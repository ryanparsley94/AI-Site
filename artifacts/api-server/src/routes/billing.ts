import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();
export const billingWebhookRouter = Router();

type StripeObject = Record<string, unknown>;

function stripeSecret(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

function appBaseUrl(): string | null {
  const raw = process.env.APP_PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function stripeRequest(path: string, form: URLSearchParams): Promise<StripeObject> {
  const secret = stripeSecret();
  if (!secret) throw new Error("Stripe is not configured.");
  const response = await fetch("https://api.stripe.com" + path, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(secret + ":").toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const body = (await response.json()) as StripeObject & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(body.error?.message || "Stripe request failed.");
  }
  return body;
}

async function currentCompany(): Promise<{
  id: number;
  name: string;
  email: string | null;
}> {
  const result = await pool.query<{
    id: number;
    name: string;
    email: string | null;
  }>("SELECT id,name,email FROM companies ORDER BY id LIMIT 1");
  if (!result.rows[0]) throw new Error("Business profile is not configured.");
  return result.rows[0];
}

router.get("/billing/status", async (_req, res): Promise<void> => {
  try {
    const company = await currentCompany();
    const result = await pool.query<{
      plan: string;
      status: string;
      stripe_customer_id: string | null;
      current_period_end: Date | null;
      cancel_at_period_end: boolean;
    }>(
      `SELECT plan,status,stripe_customer_id,current_period_end,cancel_at_period_end
         FROM billing_subscriptions
        WHERE company_id=$1
        LIMIT 1`,
      [company.id],
    );
    const row = result.rows[0];
    res.json({
      companyId: company.id,
      plan: row?.plan ?? "office",
      status: row?.status ?? "inactive",
      currentPeriodEnd: row?.current_period_end?.toISOString() ?? null,
      cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
      canManage: Boolean(row?.stripe_customer_id),
      checkoutConfigured: Boolean(
        process.env.STRIPE_SECRET_KEY &&
          process.env.STRIPE_OFFICE_PRICE_ID &&
          appBaseUrl(),
      ),
      proAvailable: false,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Could not load billing status.",
    });
  }
});

router.post("/billing/checkout", async (_req, res): Promise<void> => {
  try {
    const company = await currentCompany();
    const price = process.env.STRIPE_OFFICE_PRICE_ID?.trim();
    const base = appBaseUrl();
    if (!price || !base || !stripeSecret()) {
      res.status(503).json({
        error:
          "Billing is not configured yet. Add STRIPE_SECRET_KEY, STRIPE_OFFICE_PRICE_ID and APP_PUBLIC_BASE_URL.",
      });
      return;
    }

    const existing = await pool.query<{ stripe_customer_id: string | null }>(
      "SELECT stripe_customer_id FROM billing_subscriptions WHERE company_id=$1 LIMIT 1",
      [company.id],
    );

    const form = new URLSearchParams({
      mode: "subscription",
      success_url: base + "/billing?checkout=success",
      cancel_url: base + "/billing?checkout=cancelled",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      client_reference_id: String(company.id),
      "metadata[company_id]": String(company.id),
      "metadata[plan]": "office",
      "subscription_data[metadata][company_id]": String(company.id),
      "subscription_data[metadata][plan]": "office",
      allow_promotion_codes: "true",
    });

    if (existing.rows[0]?.stripe_customer_id) {
      form.set("customer", existing.rows[0].stripe_customer_id);
    } else if (company.email) {
      form.set("customer_email", company.email);
    }

    const session = await stripeRequest("/v1/checkout/sessions", form);
    const url = typeof session.url === "string" ? session.url : null;
    if (!url) throw new Error("Stripe did not return a checkout URL.");
    res.json({ url });
  } catch (error) {
    logger.error({ err: error }, "Stripe checkout creation failed");
    res.status(502).json({
      error: error instanceof Error ? error.message : "Could not start checkout.",
    });
  }
});

router.post("/billing/portal", async (_req, res): Promise<void> => {
  try {
    const company = await currentCompany();
    const base = appBaseUrl();
    if (!base || !stripeSecret()) {
      res.status(503).json({ error: "Billing portal is not configured yet." });
      return;
    }
    const existing = await pool.query<{ stripe_customer_id: string | null }>(
      "SELECT stripe_customer_id FROM billing_subscriptions WHERE company_id=$1 LIMIT 1",
      [company.id],
    );
    const customer = existing.rows[0]?.stripe_customer_id;
    if (!customer) {
      res.status(409).json({ error: "Start the Office subscription before opening the billing portal." });
      return;
    }
    const session = await stripeRequest(
      "/v1/billing_portal/sessions",
      new URLSearchParams({
        customer,
        return_url: base + "/billing",
      }),
    );
    const url = typeof session.url === "string" ? session.url : null;
    if (!url) throw new Error("Stripe did not return a portal URL.");
    res.json({ url });
  } catch (error) {
    logger.error({ err: error }, "Stripe billing portal creation failed");
    res.status(502).json({
      error: error instanceof Error ? error.message : "Could not open billing portal.",
    });
  }
});

function verifyStripeSignature(req: Request): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const header = req.header("stripe-signature");
  const raw = req.rawBody;
  if (!secret || !header || !raw) return false;

  const parts = header.split(",").map((part) => part.trim());
  const timestampRaw = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(String(timestamp))
    .update(".")
    .update(raw)
    .digest("hex");

  return signatures.some((signature) => {
    try {
      const a = Buffer.from(signature, "hex");
      const b = Buffer.from(expected, "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

function idFrom(value: unknown): string | null {
  return typeof value === "string"
    ? value
    : value && typeof value === "object" && typeof (value as StripeObject).id === "string"
      ? String((value as StripeObject).id)
      : null;
}

function metadataCompanyId(object: StripeObject): number | null {
  const metadata =
    object.metadata && typeof object.metadata === "object"
      ? (object.metadata as StripeObject)
      : null;
  const direct = metadata && typeof metadata.company_id === "string"
    ? Number(metadata.company_id)
    : null;
  if (direct && Number.isSafeInteger(direct) && direct > 0) return direct;

  const reference =
    typeof object.client_reference_id === "string"
      ? Number(object.client_reference_id)
      : null;
  return reference && Number.isSafeInteger(reference) && reference > 0
    ? reference
    : null;
}

function subscriptionPriceId(object: StripeObject): string | null {
  const items =
    object.items && typeof object.items === "object"
      ? (object.items as StripeObject)
      : null;
  const data = Array.isArray(items?.data) ? items!.data : [];
  const first = data[0] as StripeObject | undefined;
  const price =
    first?.price && typeof first.price === "object"
      ? (first.price as StripeObject)
      : null;
  return price && typeof price.id === "string" ? price.id : null;
}

async function resolveCompanyId(object: StripeObject): Promise<number | null> {
  const direct = metadataCompanyId(object);
  if (direct) return direct;

  const subscriptionId = idFrom(object.id);
  const customerId = idFrom(object.customer);
  if (!subscriptionId && !customerId) return null;

  const found = await pool.query<{ company_id: number }>(
    `SELECT company_id
       FROM billing_subscriptions
      WHERE ($1::text IS NOT NULL AND stripe_subscription_id=$1)
         OR ($2::text IS NOT NULL AND stripe_customer_id=$2)
      ORDER BY id
      LIMIT 1`,
    [subscriptionId, customerId],
  );
  return found.rows[0]?.company_id ?? null;
}

async function applyCheckoutSession(object: StripeObject): Promise<void> {
  const companyId = await resolveCompanyId(object);
  if (!companyId) return;

  const customer = idFrom(object.customer);
  const subscription = idFrom(object.subscription);
  await pool.query(
    `INSERT INTO billing_subscriptions(
       company_id,plan,status,stripe_customer_id,stripe_subscription_id,stripe_price_id
     ) VALUES ($1,'office','active',$2,$3,$4)
     ON CONFLICT (company_id) DO UPDATE SET
       plan='office',
       status=CASE WHEN billing_subscriptions.status='inactive' THEN 'active' ELSE billing_subscriptions.status END,
       stripe_customer_id=COALESCE(EXCLUDED.stripe_customer_id,billing_subscriptions.stripe_customer_id),
       stripe_subscription_id=COALESCE(EXCLUDED.stripe_subscription_id,billing_subscriptions.stripe_subscription_id),
       stripe_price_id=COALESCE(EXCLUDED.stripe_price_id,billing_subscriptions.stripe_price_id),
       updated_at=now()`,
    [companyId, customer, subscription, process.env.STRIPE_OFFICE_PRICE_ID ?? null],
  );
}

async function applySubscription(object: StripeObject, deleted: boolean): Promise<void> {
  const companyId = await resolveCompanyId(object);
  if (!companyId) return;

  const customer = idFrom(object.customer);
  const subscription = idFrom(object.id);
  const status = deleted
    ? "canceled"
    : typeof object.status === "string"
      ? object.status
      : "unknown";
  const period = typeof object.current_period_end === "number"
    ? new Date(object.current_period_end * 1000)
    : null;
  const cancelAtPeriodEnd = object.cancel_at_period_end === true;
  const price = subscriptionPriceId(object) ?? process.env.STRIPE_OFFICE_PRICE_ID ?? null;

  await pool.query(
    `INSERT INTO billing_subscriptions(
       company_id,plan,status,stripe_customer_id,stripe_subscription_id,
       stripe_price_id,current_period_end,cancel_at_period_end
     ) VALUES ($1,'office',$2,$3,$4,$5,$6,$7)
     ON CONFLICT (company_id) DO UPDATE SET
       plan='office',
       status=EXCLUDED.status,
       stripe_customer_id=COALESCE(EXCLUDED.stripe_customer_id,billing_subscriptions.stripe_customer_id),
       stripe_subscription_id=COALESCE(EXCLUDED.stripe_subscription_id,billing_subscriptions.stripe_subscription_id),
       stripe_price_id=COALESCE(EXCLUDED.stripe_price_id,billing_subscriptions.stripe_price_id),
       current_period_end=EXCLUDED.current_period_end,
       cancel_at_period_end=EXCLUDED.cancel_at_period_end,
       updated_at=now()`,
    [
      companyId,
      status,
      customer,
      subscription,
      price,
      period,
      cancelAtPeriodEnd,
    ],
  );
}

billingWebhookRouter.post("/billing/webhook", async (req, res): Promise<void> => {
  if (!verifyStripeSignature(req)) {
    res.status(400).json({ error: "Invalid Stripe webhook signature." });
    return;
  }

  const event = req.body as StripeObject;
  const eventId = typeof event.id === "string" ? event.id : null;
  const eventType = typeof event.type === "string" ? event.type : null;
  const data =
    event.data && typeof event.data === "object"
      ? (event.data as StripeObject)
      : null;
  const object =
    data?.object && typeof data.object === "object"
      ? (data.object as StripeObject)
      : null;

  if (!eventId || !eventType || !object) {
    res.status(400).json({ error: "Malformed Stripe event." });
    return;
  }

  const claimed = await pool.query(
    `INSERT INTO billing_events(event_id,event_type)
     VALUES ($1,$2)
     ON CONFLICT DO NOTHING
     RETURNING event_id`,
    [eventId, eventType],
  );
  if (!claimed.rows[0]) {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  try {
    if (eventType === "checkout.session.completed") {
      await applyCheckoutSession(object);
    } else if (
      eventType === "customer.subscription.created" ||
      eventType === "customer.subscription.updated"
    ) {
      await applySubscription(object, false);
    } else if (eventType === "customer.subscription.deleted") {
      await applySubscription(object, true);
    }
    res.status(200).json({ received: true });
  } catch (error) {
    await pool.query("DELETE FROM billing_events WHERE event_id=$1", [eventId]).catch(() => undefined);
    logger.error({ err: error, eventId, eventType }, "Stripe webhook processing failed");
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

export default router;
