import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { db, pool, marketingDraftsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import marketingRouter from "../src/routes/marketing";
import { validateMarketingDelivery } from "../src/lib/marketing-delivery";
import type { AddressInfo } from "node:net";

// Isolated process: only synthetic provider credentials and fixture contacts.
process.env.TWILIO_ACCOUNT_SID = "ACfixture";
process.env.TWILIO_AUTH_TOKEN = "fixture-token";
process.env.TWILIO_SMS_FROM = "+447700900000";
process.env.RESEND_API_KEY = "fixture-key";
process.env.RESEND_FROM_EMAIL = "test@example.test";

const ids: number[] = [];
const realFetch = globalThis.fetch;
// One session, with a temporary shadow table: never change genuine drafts.
pool.options.max = 1;
let providerCalls: { url: string; init?: RequestInit }[] = [];
let providerResponse = () => Promise.resolve(Response.json({ sid: "SMfixture", status: "queued" }));
const app = express();
app.use(express.json());
// This private loopback harness tests the router, not the application's auth.
app.use(marketingRouter);
const server = app.listen(0, "127.0.0.1");
let base = "";

before(async () => {
  await pool.query("CREATE TEMP TABLE marketing_drafts (LIKE public.marketing_drafts INCLUDING ALL)");
  await pool.query("CREATE TEMP SEQUENCE marketing_test_ids");
  await pool.query("ALTER TABLE marketing_drafts ALTER COLUMN id SET DEFAULT nextval('pg_temp.marketing_test_ids')");
  if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  globalThis.fetch = async (input, init) => {
    providerCalls.push({ url: String(input), init });
    return providerResponse();
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  if (ids.length) await db.delete(marketingDraftsTable).where(inArray(marketingDraftsTable.id, ids));
  await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
});

async function fixture(values: Partial<typeof marketingDraftsTable.$inferInsert> = {}) {
  providerCalls = [];
  providerResponse = () => Promise.resolve(Response.json({ sid: "SMfixture", status: "queued" }));
  const [row] = await db.insert(marketingDraftsTable).values({
    jobTitle: "Synthetic marketing test", clientName: "Fixture Client", clientPhone: "+447700900123",
    clientEmail: "client@example.test", companyName: "Fixture Trades",
    draftMessage: "Thanks for choosing us.", ...values,
  }).returning();
  ids.push(row.id);
  return row;
}
async function request(id: number, action: string, method = "POST", body?: object) {
  const response = await realFetch(`${base}/marketing-drafts/${id}${action}`, {
    method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}

test("validates missing messages and recipients without contacting a provider", async () => {
  assert.match((await validateMarketingDelivery("sms", "+447700900123", null, "__FAILED__"))!, /Write a message/);
  assert.match((await validateMarketingDelivery("sms", "07700900123", null, "Thanks"))!, /international/);
  assert.match((await validateMarketingDelivery("email", null, "", "Thanks"))!, /valid client email/);
});

test("missing sender configuration is a clear failure without a provider send", async () => {
  const row = await fixture({ channel: "email" });
  delete process.env.RESEND_FROM_EMAIL;
  try {
    const result = await request(row.id, "/approve");
    assert.equal(result.data.deliveryStatus, "failed");
    assert.match(result.data.deliveryError, /not configured/);
    assert.equal(providerCalls.length, 0);
  } finally { process.env.RESEND_FROM_EMAIL = "test@example.test"; }
});

test("SMS supports the existing Twilio phone-number setting", async () => {
  const row = await fixture();
  delete process.env.TWILIO_SMS_FROM;
  process.env.TWILIO_PHONE_NUMBER = "+447700900001";
  try {
    const result = await request(row.id, "/approve");
    assert.equal(result.data.deliveryStatus, "queued");
    assert.equal(new URLSearchParams(String(providerCalls[0].init?.body)).get("From"), "+447700900001");
  } finally {
    process.env.TWILIO_SMS_FROM = "+447700900000";
    delete process.env.TWILIO_PHONE_NUMBER;
  }
});

test("approval sends edited SMS once; repeat approval, edit and delete are blocked", async () => {
  const row = await fixture({ editedMessage: "Contractor approved text" });
  const result = await request(row.id, "/approve");
  assert.equal(result.status, 200);
  assert.equal(result.data.deliveryStatus, "queued");
  assert.equal(result.data.providerMessageId, "SMfixture");
  assert.ok(result.data.sentAt);
  const body = new URLSearchParams(String(providerCalls[0].init?.body));
  assert.equal(body.get("Body"), "Contractor approved text");
  assert.equal(body.get("To"), "+447700900123");
  assert.equal((await request(row.id, "/approve")).status, 409);
  assert.equal((await request(row.id, "", "PATCH", { editedMessage: "Changed" })).status, 409);
  assert.equal((await request(row.id, "", "DELETE")).status, 409);
  assert.equal(providerCalls.length, 1);
});

test("simultaneous approvals make only one provider request", async () => {
  const row = await fixture();
  const results = await Promise.all([request(row.id, "/approve"), request(row.id, "/approve")]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(providerCalls.length, 1);
});

test("email uses selected recipient, plain text, and durable per-attempt idempotency", async () => {
  const row = await fixture({ channel: "email", editedMessage: "<b>Plain text only</b>" });
  providerResponse = () => Promise.resolve(Response.json({ id: "email-fixture" }));
  const result = await request(row.id, "/approve");
  assert.equal(result.data.deliveryStatus, "sent");
  const call = providerCalls[0];
  assert.match(call.url, /api.resend.com\/emails$/);
  const body = JSON.parse(String(call.init?.body));
  assert.deepEqual(body.to, ["client@example.test"]);
  assert.equal(body.text, "<b>Plain text only</b>");
  assert.equal(body.html, undefined);
  assert.equal(new Headers(call.init?.headers).get("Idempotency-Key"), `marketing-draft-${row.id}-1`);
});

test("definite rejection is visible and allows retry with updated recipient", async () => {
  const row = await fixture();
  providerResponse = () => Promise.resolve(Response.json({ code: 21211 }, { status: 400 }));
  let result = await request(row.id, "/approve");
  assert.equal(result.data.deliveryStatus, "failed");
  assert.match(result.data.deliveryError, /Twilio rejected/);
  assert.equal(result.data.sentAt, null);
  assert.equal((await request(row.id, "", "PATCH", { clientPhone: "+447700900124" })).status, 200);
  providerResponse = () => Promise.resolve(Response.json({ sid: "SMretry", status: "sent" }));
  result = await request(row.id, "/approve");
  assert.equal(result.data.deliveryStatus, "sent");
  assert.equal(providerCalls.length, 2);
});

test("uncertain transport failures cannot be blindly retried", async () => {
  const row = await fixture();
  providerResponse = async () => { throw new Error("Fixture timeout"); };
  const result = await request(row.id, "/approve");
  assert.equal(result.data.deliveryStatus, "unknown");
  assert.match(result.data.deliveryError, /may have been sent/);
  assert.equal((await request(row.id, "/approve")).status, 409);
  assert.equal((await request(row.id, "", "DELETE")).status, 409);
  assert.equal(providerCalls.length, 1);
});

test("invalid contact and dismissed drafts never send", async () => {
  const invalid = await fixture({ clientPhone: "" });
  assert.equal((await request(invalid.id, "/approve")).data.deliveryStatus, "failed");
  const dismissed = await fixture({ status: "dismissed" });
  assert.equal((await request(dismissed.id, "/approve")).status, 409);
  assert.equal(providerCalls.length, 0);
});

test("list persists provider-confirmed delivery and failed delivery permits retry", async () => {
  const row = await fixture({ status: "approved", deliveryStatus: "sent", providerMessageId: "SMstatus" });
  providerResponse = () => Promise.resolve(Response.json({ status: "undelivered" }));
  const response = await realFetch(`${base}/marketing-drafts?status=approved`);
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows.find((r: { id: number }) => r.id === row.id).deliveryStatus, "failed");
  const [saved] = await db.select().from(marketingDraftsTable).where(eq(marketingDraftsTable.id, row.id));
  assert.equal(saved.deliveryStatus, "failed");
});

test("legacy approved drafts remain not-sent until explicitly sent", async () => {
  const row = await fixture({ status: "approved" });
  assert.equal(row.deliveryStatus, "not_sent");
  assert.equal((await request(row.id, "/approve")).data.deliveryStatus, "queued");
});

test("email receipts distinguish actual delivery from acceptance", async () => {
  const row = await fixture({ channel: "email", status: "approved", deliveryStatus: "sent", providerMessageId: "email-status-fixture" });
  providerResponse = () => Promise.resolve(Response.json({ last_event: "delivered" }));
  const response = await realFetch(`${base}/marketing-drafts?status=approved`);
  const rows = await response.json();
  assert.equal(rows.find((r: { id: number }) => r.id === row.id).deliveryStatus, "delivered");
});

test("interrupted sends become unconfirmed and cannot be retried", async () => {
  const row = await fixture({ status: "approved", deliveryStatus: "sending", updatedAt: new Date(Date.now() - 180000) });
  const response = await realFetch(`${base}/marketing-drafts?status=approved`);
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows.find((r: { id: number }) => r.id === row.id).deliveryStatus, "unknown");
  assert.equal((await request(row.id, "/approve")).status, 409);
});
