/**
 * OAuth integration routes — Google Calendar, QuickBooks, Xero.
 *
 * OAuth flows:
 *   GET /integrations/status              — all providers' connection status
 *   GET /integrations/:provider/auth      — start OAuth (redirect to provider)
 *   GET /integrations/:provider/callback  — handle provider callback
 *   DELETE /integrations/:provider        — disconnect a provider
 */
import { Router } from "express";
import { db, integrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

type Provider = "google" | "quickbooks" | "xero";
const PROVIDERS: Provider[] = ["google", "quickbooks", "xero"];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getCallbackUrl(req: import("express").Request, provider: Provider): string {
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.get("host");
  return `${proto}://${host}/api/integrations/${provider}/callback`;
}

function missingCreds(provider: Provider): boolean {
  if (provider === "google") return !process.env["GOOGLE_CLIENT_ID"] || !process.env["GOOGLE_CLIENT_SECRET"];
  if (provider === "quickbooks") return !process.env["QUICKBOOKS_CLIENT_ID"] || !process.env["QUICKBOOKS_CLIENT_SECRET"];
  if (provider === "xero") return !process.env["XERO_CLIENT_ID"] || !process.env["XERO_CLIENT_SECRET"];
  return true;
}

// ── Status endpoint ──────────────────────────────────────────────────────────

router.get("/integrations/status", async (req, res): Promise<void> => {
  const rows = await db.select().from(integrationsTable);
  const status: Record<string, {
    connected: boolean;
    connectedAt: string | null;
    lastSyncAt: string | null;
    configured: boolean;
  }> = {};

  for (const provider of PROVIDERS) {
    const row = rows.find((r) => r.provider === provider);
    status[provider] = {
      connected: !!row?.accessToken,
      connectedAt: row?.connectedAt?.toISOString() ?? null,
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      configured: !missingCreds(provider),
    };
  }

  res.json(status);
});

// ── Google OAuth ─────────────────────────────────────────────────────────────

router.get("/integrations/google/auth", (req, res): void => {
  if (missingCreds("google")) {
    res.redirect("/settings?tab=integrations&error=google_not_configured");
    return;
  }
  const params = new URLSearchParams({
    client_id: process.env["GOOGLE_CLIENT_ID"]!,
    redirect_uri: getCallbackUrl(req, "google"),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get("/integrations/google/callback", async (req, res): Promise<void> => {
  const { code, error } = req.query as { code?: string; error?: string };
  if (error || !code) {
    res.redirect("/settings?tab=integrations&error=google_denied");
    return;
  }
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env["GOOGLE_CLIENT_ID"]!,
        client_secret: process.env["GOOGLE_CLIENT_SECRET"]!,
        redirect_uri: getCallbackUrl(req, "google"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(await tokenRes.text());
    const data = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    await db
      .insert(integrationsTable)
      .values({
        provider: "google",
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      })
      .onConflictDoUpdate({
        target: integrationsTable.provider,
        set: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          expiresAt: new Date(Date.now() + data.expires_in * 1000),
          connectedAt: new Date(),
        },
      });

    res.redirect("/settings?tab=integrations&connected=google");
  } catch (err) {
    logger.error({ err }, "Google OAuth callback failed");
    res.redirect("/settings?tab=integrations&error=google_failed");
  }
});

// ── QuickBooks OAuth ─────────────────────────────────────────────────────────

router.get("/integrations/quickbooks/auth", (req, res): void => {
  if (missingCreds("quickbooks")) {
    res.redirect("/settings?tab=integrations&error=quickbooks_not_configured");
    return;
  }
  const params = new URLSearchParams({
    client_id: process.env["QUICKBOOKS_CLIENT_ID"]!,
    redirect_uri: getCallbackUrl(req, "quickbooks"),
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    state: "buildai",
  });
  res.redirect(`https://appcenter.intuit.com/connect/oauth2?${params}`);
});

router.get("/integrations/quickbooks/callback", async (req, res): Promise<void> => {
  const { code, realmId, error } = req.query as { code?: string; realmId?: string; error?: string };
  if (error || !code || !realmId) {
    res.redirect("/settings?tab=integrations&error=quickbooks_denied");
    return;
  }
  try {
    const tokenRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${process.env["QUICKBOOKS_CLIENT_ID"]}:${process.env["QUICKBOOKS_CLIENT_SECRET"]}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: getCallbackUrl(req, "quickbooks"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(await tokenRes.text());
    const data = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    await db
      .insert(integrationsTable)
      .values({
        provider: "quickbooks",
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        metadata: { realmId },
      })
      .onConflictDoUpdate({
        target: integrationsTable.provider,
        set: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          expiresAt: new Date(Date.now() + data.expires_in * 1000),
          metadata: { realmId },
          connectedAt: new Date(),
        },
      });

    res.redirect("/settings?tab=integrations&connected=quickbooks");
  } catch (err) {
    logger.error({ err }, "QuickBooks OAuth callback failed");
    res.redirect("/settings?tab=integrations&error=quickbooks_failed");
  }
});

// ── Xero OAuth ───────────────────────────────────────────────────────────────

router.get("/integrations/xero/auth", (req, res): void => {
  if (missingCreds("xero")) {
    res.redirect("/settings?tab=integrations&error=xero_not_configured");
    return;
  }
  const params = new URLSearchParams({
    client_id: process.env["XERO_CLIENT_ID"]!,
    redirect_uri: getCallbackUrl(req, "xero"),
    response_type: "code",
    scope: "openid profile email accounting.transactions offline_access",
    state: "buildai",
  });
  res.redirect(`https://login.xero.com/identity/connect/authorize?${params}`);
});

router.get("/integrations/xero/callback", async (req, res): Promise<void> => {
  const { code, error } = req.query as { code?: string; error?: string };
  if (error || !code) {
    res.redirect("/settings?tab=integrations&error=xero_denied");
    return;
  }
  try {
    const tokenRes = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${process.env["XERO_CLIENT_ID"]}:${process.env["XERO_CLIENT_SECRET"]}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: getCallbackUrl(req, "xero"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(await tokenRes.text());
    const data = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // Fetch tenant ID from Xero connections
    let tenantId: string | null = null;
    try {
      const connRes = await fetch("https://api.xero.com/connections", {
        headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/json" },
      });
      if (connRes.ok) {
        const connections = (await connRes.json()) as Array<{ tenantId: string; tenantType: string }>;
        tenantId = connections.find((c) => c.tenantType === "ORGANISATION")?.tenantId ?? null;
      }
    } catch { /* non-fatal */ }

    await db
      .insert(integrationsTable)
      .values({
        provider: "xero",
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        metadata: tenantId ? { tenantId } : {},
      })
      .onConflictDoUpdate({
        target: integrationsTable.provider,
        set: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          expiresAt: new Date(Date.now() + data.expires_in * 1000),
          metadata: tenantId ? { tenantId } : {},
          connectedAt: new Date(),
        },
      });

    res.redirect("/settings?tab=integrations&connected=xero");
  } catch (err) {
    logger.error({ err }, "Xero OAuth callback failed");
    res.redirect("/settings?tab=integrations&error=xero_failed");
  }
});

// ── Disconnect ───────────────────────────────────────────────────────────────

router.delete("/integrations/:provider", async (req, res): Promise<void> => {
  const provider = req.params["provider"] as Provider;
  if (!PROVIDERS.includes(provider)) {
    res.status(400).json({ error: "Unknown provider" });
    return;
  }
  await db.delete(integrationsTable).where(eq(integrationsTable.provider, provider));
  res.json({ ok: true });
});

// ── Invoice export ───────────────────────────────────────────────────────────

import { invoicesTable } from "@workspace/db";
import { exportToQuickBooks } from "../lib/quickbooks";
import { exportToXero } from "../lib/xero";

router.post("/invoices/:id/export/:target", async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const target = req.params["target"] as "quickbooks" | "xero";

  if (!["quickbooks", "xero"].includes(target)) {
    res.status(400).json({ error: "Unknown export target" });
    return;
  }

  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const lineItems = (invoice.lineItems as Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>) ?? [];

  if (target === "quickbooks") {
    const result = await exportToQuickBooks({
      clientName: invoice.clientName ?? "",
      lineItems,
      dueDate: invoice.dueDate,
      vatPercent: Number(invoice.vatPercent),
      total: Number(invoice.total),
    });
    if ("error" in result) { res.status(422).json(result); return; }

    await db
      .update(invoicesTable)
      .set({ externalId: result.id, externalProvider: "quickbooks" })
      .where(eq(invoicesTable.id, id));

    res.json({ ok: true, externalId: result.id, docNumber: result.docNumber });
    return;
  }

  // Xero
  const result = await exportToXero({
    clientName: invoice.clientName ?? "",
    lineItems,
    dueDate: invoice.dueDate,
    vatPercent: Number(invoice.vatPercent),
  });
  if ("error" in result) { res.status(422).json(result); return; }

  await db
    .update(invoicesTable)
    .set({ externalId: result.id, externalProvider: "xero" })
    .where(eq(invoicesTable.id, id));

  res.json({ ok: true, externalId: result.id, invoiceNumber: result.invoiceNumber, url: result.url });
});

export default router;
