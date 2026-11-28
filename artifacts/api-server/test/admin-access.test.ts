import assert from "node:assert/strict";
import { after, test } from "node:test";
import { once } from "node:events";

// Some public widget routes start housekeeping intervals at import time. They
// are unrelated to these request tests, so prevent them keeping the test process
// alive; the real application runtime is unchanged.
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = (() => ({ unref() {} })) as unknown as typeof setInterval;
const [{ default: app }, { pool }] = await Promise.all([
  import("../src/app"),
  import("@workspace/db"),
]);
globalThis.setInterval = originalSetInterval;

const password = "admin-access-test-password";
process.env.SESSION_SECRET = password;
process.env.RESEND_WEBHOOK_SECRET = "whsec_" + Buffer.from("admin-access-test-secret").toString("base64");
process.env.STRIPE_WEBHOOK_SECRET = "admin-access-test-stripe-secret";
process.env.TWILIO_AUTH_TOKEN = "admin-access-test-twilio-token";
process.env.VOICE_PUBLIC_BASE_URL = "https://crew-on.replit.app";

const server = app.listen(0);
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await pool.end();
});

async function get(path: string, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    headers: cookie ? { Cookie: cookie } : undefined,
    signal: AbortSignal.timeout(10_000),
  });
}

test("customer enquiry APIs require sign-in and the owner session can review calls and email", async () => {
  for (const path of [
    "/calls",
    "/calls/1",
    "/contacts",
    "/contacts/export/customers.csv",
    "/email-threads",
    "/email-threads/1",
    "/pilot/readiness",
    "/business-setup",
    "/dashboard/summary",
  ]) {
    const response = await get(path);
    assert.equal(response.status, 401, `anonymous ${path} request must be denied`);
  }
  const anonymousImport = await fetch(`${baseUrl}/imports/tradify/customers`, {
    method: "POST",
    headers: { "Content-Type": "text/csv" },
    body: "Customer Name,Phone Number\nSynthetic Customer,07700900123\n",
  });
  assert.equal(anonymousImport.status, 401, "anonymous CSV import must be denied before database access");

  const incorrect = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "not-the-test-password" }),
  });
  assert.equal(incorrect.status, 401);

  const login = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const sessionCookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(sessionCookie, "successful sign-in should issue a session cookie");
  assert.match(login.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.equal((await (await get("/auth/check", sessionCookie)).json()).authenticated, true);

  for (const path of ["/calls", "/email-threads"]) {
    const response = await get(path, sessionCookie);
    assert.equal(response.status, 200, `signed-in owner should be able to review ${path}`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    await response.arrayBuffer(); // Consume without printing real customer data.
  }

  const readiness = await get("/pilot/readiness", sessionCookie);
  assert.equal(readiness.status, 200, "signed-in owner should be able to review pilot setup");

  const logout = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") ?? "", /Expires=.*1970/i);
  assert.equal((await get("/calls")).status, 401, "logged-out browser must no longer have access");
});

test("public provider callbacks reject missing signatures without a dashboard cookie", async () => {
  const inboundEmail = await fetch(`${baseUrl}/email-threads/inbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": "msg_admin_access_test",
      "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
      "webhook-signature": "v1,invalid",
    },
    body: JSON.stringify({ type: "email.received", data: { email_id: "test", from: "test@example.invalid" } }),
  });
  assert.equal(inboundEmail.status, 401, "Resend webhook requires a valid Svix signature");

  const phoneCallback = await fetch(`${baseUrl}/voice/incoming`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ CallSid: "CA00000000000000000000000000000000", From: "+441234567890", To: "+449876543210" }),
  });
  assert.equal(phoneCallback.status, 403, "Twilio callback requires a valid request signature");

  const billingCallback = await fetch(`${baseUrl}/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "evt_admin_access_test", type: "test", data: { object: {} } }),
  });
  assert.equal(billingCallback.status, 400, "Stripe callback requires a valid webhook signature");
});
