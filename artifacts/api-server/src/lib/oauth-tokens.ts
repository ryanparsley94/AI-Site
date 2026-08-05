/**
 * OAuth token management — refresh access tokens when expired.
 */
import { db, integrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export type Provider = "google" | "quickbooks" | "xero";

export interface TokenRecord {
  accessToken: string;
  refreshToken: string | null | undefined;
  expiresAt: Date | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
}

/** Fetch a fresh (possibly refreshed) access token for a provider. Returns null if not connected. */
export async function getAccessToken(provider: Provider): Promise<TokenRecord | null> {
  const [row] = await db
    .select()
    .from(integrationsTable)
    .where(eq(integrationsTable.provider, provider));

  if (!row || !row.accessToken) return null;

  // Refresh if expiry is within 5 minutes
  const needsRefresh =
    row.expiresAt && row.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

  if (needsRefresh && row.refreshToken) {
    const refreshed = await refreshToken(provider, row.refreshToken, row.metadata as Record<string, unknown>);
    if (refreshed) {
      const [updated] = await db
        .update(integrationsTable)
        .set({
          accessToken: refreshed.access_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          ...(refreshed.refresh_token ? { refreshToken: refreshed.refresh_token } : {}),
        })
        .where(eq(integrationsTable.provider, provider))
        .returning();
      return {
        accessToken: updated.accessToken!,
        refreshToken: updated.refreshToken,
        expiresAt: updated.expiresAt,
        metadata: updated.metadata as Record<string, unknown>,
      };
    }
  }

  return {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt,
    metadata: row.metadata as Record<string, unknown>,
  };
}

interface RefreshedToken {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

async function refreshToken(
  provider: Provider,
  refreshToken: string,
  metadata: Record<string, unknown> | null | undefined
): Promise<RefreshedToken | null> {
  try {
    if (provider === "google") {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: process.env["GOOGLE_CLIENT_ID"] ?? "",
          client_secret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json() as RefreshedToken;
    }

    if (provider === "quickbooks") {
      const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${process.env["QUICKBOOKS_CLIENT_ID"]}:${process.env["QUICKBOOKS_CLIENT_SECRET"]}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json() as RefreshedToken;
    }

    if (provider === "xero") {
      const res = await fetch("https://identity.xero.com/connect/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${process.env["XERO_CLIENT_ID"]}:${process.env["XERO_CLIENT_SECRET"]}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json() as RefreshedToken;
    }

    return null;
  } catch (err) {
    logger.error({ err, provider }, "Token refresh failed");
    return null;
  }
}
