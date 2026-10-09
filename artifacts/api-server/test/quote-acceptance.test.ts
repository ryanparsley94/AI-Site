import assert from "node:assert/strict";
import { test, after } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { db, quotesTable, pool } from "@workspace/db";
import { blankQuoteWorkflow } from "@workspace/api-zod";
import { financialFields } from "../src/lib/quote-workflow";
import { quoteSharingRouter, publicQuoteRouter } from "../src/routes/quote-acceptance";
import quotesRouter from "../src/routes/quotes";
import { adminOnly } from "../src/lib/adminAuth";

const ids: number[] = [];
const fixture = express();
fixture.use(express.json());
fixture.use("/api", publicQuoteRouter);
// Test harness only: never changes the production app's authentication.
fixture.use("/api", quoteSharingRouter, quotesRouter);
const server = fixture.listen(0);
const protectedApp = express();
protectedApp.use("/api", adminOnly, quoteSharingRouter);
const actual = protectedApp.listen(0);
const origin = () => `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
after(async () => {
  if (ids.length) await db.delete(quotesTable).where(inArray(quotesTable.id, ids));
  server.close(); actual.close(); await pool.end();
});
async function create() {
  const w = blankQuoteWorkflow();
  Object.assign(w, { customerName: "Test customer", siteAddress: "Test site", scope: "Install test fitting",
    paymentTerms: "Balance on completion", validUntil: "2099-12-31" });
  w.sections[0].items = [{ id: "fixture-line", type: "materials", description: "Test fitting", quantity: 2,
    unit: "item", costPrice: 3.25, sellPrice: 10, source: "PRIVATE SUPPLIER", sourceUrl: "https://private.invalid" }];
  w.deposit = { mode: "percentage", value: 25 };
  const [q] = await db.insert(quotesTable).values({
    title: "Acceptance integration fixture", status: "reviewed", workflow: w, ...financialFields(w),
    companySnapshot: { id: 1, name: "Test trades", phone: "", timezone: "Europe/London",
      createdAt: new Date().toISOString(), email: "test@example.invalid", privateKey: "NEVER EXPOSE" },
  }).returning();
  ids.push(q.id);
  return q;
}
async function request(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`${origin()}${path}`, { method, headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json(), headers: r.headers };
}
async function share(id: number) {
  const r = await request(`/quotes/${id}/acceptance-link`, "POST");
  assert.equal(r.status, 200);
  return r.body.path.split("/").pop() as string;
}

test("Public quote responses preserve privacy, status, locking and revision safety", async () => {
  const protectedResponse = await fetch(`http://127.0.0.1:${(actual.address() as { port: number }).port}/api/quotes/1/acceptance-link`, { method: "POST" });
  assert.equal(protectedResponse.status, 401);
  assert.equal((await request("/public/quotes/invalid")).status, 404);
  const q = await create();
  const token = await share(q.id);
  const page = await request(`/public/quotes/${token}`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  const serialized = JSON.stringify(page.body);
  for (const sensitive of ["costPrice", "costTotal", "profit", "margin", "sourceUrl", "PRIVATE SUPPLIER", "NEVER EXPOSE", "acceptanceTokenHash"]) {
    assert.ok(!serialized.includes(sensitive), sensitive);
  }
  assert.equal(page.body.total, 24);
  assert.equal(page.body.depositAmount, 6);
  assert.equal(page.body.balance, 18);
  assert.equal((await request(`/public/quotes/${token}`, "POST", { action: "accept", revision: 1 })).status, 409);
  const attempts = await Promise.all(["accept", "request_changes"].map(action =>
    request(`/public/quotes/${token}`, "POST", { action, revision: page.body.revision, message: "Please change this" })));
  assert.deepEqual(attempts.map(r => r.status).sort(), [200, 409]);
  const [saved] = await db.select().from(quotesTable).where(eq(quotesTable.id, q.id));
  assert.ok(["accepted", "changes_requested"].includes(saved.status));
  assert.ok(saved.respondedAt);
  if (saved.status === "accepted") {
    assert.ok(saved.acceptedAt);
    assert.equal((await request(`/quotes/${q.id}`, "PATCH", { title: "Cannot change", revision: saved.revision })).status, 409);
  }
  const second = await create();
  const oldToken = await share(second.id);
  const newToken = await share(second.id);
  assert.notEqual(oldToken, newToken);
  assert.equal((await request(`/public/quotes/${oldToken}`)).status, 404);
  const pending = (await request(`/public/quotes/${newToken}`)).body;
  assert.equal((await request(`/public/quotes/${newToken}`, "POST", { action: "request_changes", revision: pending.revision, message: "   " })).status, 400);
  const changes = await request(`/public/quotes/${newToken}`, "POST", { action: "request_changes", revision: pending.revision, message: " Move the fitting " });
  assert.equal(changes.status, 200);
  assert.equal(changes.body.status, "changes_requested");
  assert.equal(changes.body.changeRequest, "Move the fitting");
  assert.equal((await request(`/quotes/${second.id}/acceptance-link`, "POST")).status, 409);
  const edited = await request(`/quotes/${second.id}`, "PATCH", { status: "reviewed", revision: changes.body.revision });
  assert.equal(edited.status, 200);
  assert.equal((await request(`/public/quotes/${newToken}`)).status, 404);
  const fresh = await share(second.id);
  const freshPage = (await request(`/public/quotes/${fresh}`)).body;
  const acceptance = await request(`/public/quotes/${fresh}`, "POST", { action: "accept", revision: freshPage.revision });
  assert.equal(acceptance.status, 200);
  assert.equal(acceptance.body.status, "accepted");
  const [accepted] = await db.select().from(quotesTable).where(eq(quotesTable.id, second.id));
  assert.ok(accepted.acceptedAt);
  const duplicate = await request(`/quotes/${second.id}/duplicate`, "POST");
  assert.equal(duplicate.status, 201);
  ids.push(duplicate.body.id);
  const [copy] = await db.select().from(quotesTable).where(eq(quotesTable.id, duplicate.body.id));
  assert.equal(copy.acceptanceTokenHash, null);
  assert.equal(copy.status, "draft");
  assert.equal((await request(`/quotes/${copy.id}/acceptance-link`, "POST")).status, 409);
  const third = await create();
  const expiredToken = await share(third.id);
  await db.update(quotesTable).set({ workflow: { ...third.workflow as object, validUntil: "2000-01-01" } }).where(eq(quotesTable.id, third.id));
  const expired = (await request(`/public/quotes/${expiredToken}`)).body;
  assert.equal(expired.expired, true);
  assert.equal((await request(`/public/quotes/${expiredToken}`, "POST", { action: "accept", revision: expired.revision })).status, 409);
  const fourth = await create();
  const editedToken = await share(fourth.id);
  const editPage = (await request(`/public/quotes/${editedToken}`)).body;
  assert.equal((await request(`/quotes/${fourth.id}`, "PATCH", { title: "Revised scope", revision: editPage.revision })).status, 200);
  assert.equal((await request(`/public/quotes/${editedToken}`)).status, 404);
});
