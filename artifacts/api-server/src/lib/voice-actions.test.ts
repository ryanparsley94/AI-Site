import { test } from "node:test";
import assert from "node:assert/strict";
import { executeVoiceAction, intentSchema, resolveNamed, localDay, type VoiceData } from "./voice-actions";
import { blankQuoteWorkflow } from "@workspace/api-zod";

const data: VoiceData = {
  jobs: [
    { id: 1, title: "Smithson boiler repair", contactName: "Smithson", status: "scheduled", scheduledAt: new Date("2026-10-08T09:00:00Z") },
    { id: 2, title: "Johnson kitchen", contactName: "Johnson", status: "completed", scheduledAt: new Date("2026-10-08T10:00:00Z") },
  ],
  quotes: [{ id: 3, title: "Johnson kitchen", materials: [{ name: "Valve", quantity: 2, unit: "each", total: 10 }] }],
  invoices: [{ id: 4, jobId: 1, invoiceNumber: "INV-0004", status: "draft", total: "120.00", clientName: "Smithson" }],
};
const now = new Date("2026-10-08T07:00:00Z");
const run = async (intent: unknown, input = data) => {
  const requests: unknown[] = [];
  const result = await executeVoiceAction(intentSchema.parse(intent), input, async (...args) => {
    requests.push(args); return {};
  }, "Europe/London", now);
  return { result, requests };
};

test("job completion uses the existing endpoint and does not repeat completed work", async () => {
  const { result, requests } = await run({ action: "complete_job", job: "Smithson" });
  assert.equal(result.action, "complete_job");
  assert.deepEqual(requests, [["/jobs/1", "PATCH", { status: "completed" }]]);
  assert.equal((await run({ action: "complete_job", job: "Johnson" })).requests.length, 0);
});
test("ambiguous names never select an arbitrary job", async () => {
  const input = { ...data, jobs: [...data.jobs, { ...data.jobs[0], id: 5, title: "Smithson roof" }] };
  assert.equal(resolveNamed(input.jobs, "Smithson", j => [j.title, j.contactName]), undefined);
  const { result, requests } = await run({ action: "send_invoice", job: "Smithson" }, input);
  assert.equal(result.action, "none"); assert.equal(requests.length, 0);
});
test("send invoice requires exactly one draft linked to the named job", async () => {
  const { requests } = await run({ action: "send_invoice", job: "Smithson" });
  assert.deepEqual(requests, [["/invoices/4/send", "POST"]]);
  const multiple = { ...data, invoices: [...data.invoices, { ...data.invoices[0], id: 5 }] };
  assert.equal((await run({ action: "send_invoice", job: "Smithson" }, multiple)).requests.length, 0);
  const sent = { ...data, invoices: [{ ...data.invoices[0], status: "sent" }] };
  assert.equal((await run({ action: "send_invoice", job: "Smithson" }, sent)).requests.length, 0);
});
test("add materials preserves existing prices and makes new items explicitly unpriced", async () => {
  const { requests } = await run({ action: "add_quote_items", quote: "Johnson", items: [{ name: "Copper pipe", quantity: 20, unit: "metres" }] });
  assert.deepEqual(requests, [["/quotes/3", "PATCH", { materials: [
    ...data.quotes[0].materials as unknown[],
    { name: "Copper pipe", quantity: 20, unit: "metres", unitPrice: null, total: null, source: null },
  ] }]]);
});
test("photo draft is ephemeral and never saved automatically", async () => {
  const { result, requests } = await run({ action: "quote_draft", items: [{ name: "Pipe", quantity: 3, unit: "each" }] });
  assert.equal(requests.length, 0); assert.equal(result.navigateTo, "/quotes");
  assert.equal(result.quoteDraft?.[0].quantity, 3);
});
test("workflow quote additions preserve prices and use optimistic revision checks", async () => {
  const workflow = blankQuoteWorkflow();
  workflow.sections[0].items = [{ id: "valve", type: "materials", description: "Valve", quantity: 2, unit: "each", costPrice: 5, sellPrice: 8 }];
  const input = { ...data, quotes: [{ ...data.quotes[0], workflow, revision: 4, status: "reviewed" }] };
  const { requests } = await run({ action: "add_quote_items", quote: "Johnson", items: [{ name: "Copper pipe", quantity: 20, unit: "metres" }] }, input);
  const [path, method, body] = requests[0] as [string, string, { workflow: typeof workflow; revision: number }];
  assert.equal(path, "/quotes/3"); assert.equal(method, "PATCH"); assert.equal(body.revision, 4);
  assert.deepEqual(body.workflow.sections[0].items[0], workflow.sections[0].items[0]);
  assert.equal(body.workflow.sections[0].items[1].description, "Copper pipe");
  assert.equal(body.workflow.sections[0].items[1].sellPrice, 0);
  assert.equal(body.workflow.sections[0].items[1].costPrice, 0);
  assert.equal(workflow.sections[0].items.length, 1);
  assert.equal((await run({ action: "add_quote_items", quote: "Johnson", items: [{ name: "Pipe", quantity: 1, unit: "m" }] }, {
    ...input, quotes: [{ ...input.quotes[0], status: "accepted" }],
  })).requests.length, 0);
});
test("create job validates complete details, explicit date and future scheduling", async () => {
  assert.equal(intentSchema.safeParse({ action: "create_job", title: "Visit" }).success, false);
  const intent = { action: "create_job", title: "Visit", contactName: "Client", contactPhone: "0123456789", address: "1 Test Street", serviceType: "Inspection", scheduledAt: "2026-10-09T10:00:00+01:00" };
  assert.equal((await run(intent)).requests.length, 1);
  assert.equal((await run({ ...intent, scheduledAt: "2026-10-01T10:00:00Z" })).requests.length, 0);
});
test("today's schedule respects local day and excludes completed jobs", async () => {
  assert.equal(localDay(new Date("2026-10-07T23:30:00Z"), "Europe/London"), "2026-10-08");
  const { result, requests } = await run({ action: "schedule" });
  assert.match(result.spokenResponse, /1 active jobs/);
  assert.doesNotMatch(result.spokenResponse, /Johnson/);
  assert.equal(requests.length, 0);
});
test("outstanding invoices exclude paid invoices and separate unsent drafts", async () => {
  const input = { ...data, invoices: [...data.invoices, { ...data.invoices[0], id: 5, status: "sent", total: "50" }, { ...data.invoices[0], id: 6, status: "paid", total: "200" }] };
  const { result } = await run({ action: "outstanding_invoices" }, input);
  assert.match(result.spokenResponse, /1 sent, unpaid invoices totalling £50.00/);
  assert.match(result.spokenResponse, /1 unsent drafts/);
});
test("invalid quantities and model actions fail closed", () => {
  for (const quantity of [0, -1, Infinity, NaN]) {
    assert.equal(intentSchema.safeParse({ action: "quote_draft", items: [{ name: "Pipe", unit: "each", quantity }] }).success, false);
  }
  assert.equal(intentSchema.safeParse({ action: "delete_job", job: "Smithson" }).success, false);
});
test("failed API action propagates instead of reporting success", async () => {
  await assert.rejects(executeVoiceAction({ action: "send_invoice", job: "Smithson" }, data, async () => { throw new Error("Email unavailable"); }, "Europe/London", now), /Email unavailable/);
});
