import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { finaliseRealtimeEnquiry } from "../src/lib/realtime-finalise";
import { setQueryHandler } from "./support/realtime-db";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});
const input = {
  callSid: "CA-fixture", callId: 10, companyId: 20, assistantId: 30,
  transcript: [{ speaker: "caller" as const, text: "Please call about my kitchen sockets", timestamp: 1 }],
  durationSeconds: 25, notifyOwner: false, confirmCaller: false,
};

function database(options: { completed?: boolean; caller?: string; loseLock?: boolean; failWrite?: boolean } = {}) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  let completed = options.completed ?? false;
  let sessionReads = 0;
  setQueryHandler(async (raw, values = []) => {
    const sql = raw.replace(/\s+/g, " ").trim();
    queries.push({ sql, values });
    if (sql.startsWith("SELECT s.")) {
      sessionReads++;
      // Simulate durable routing, rather than trusting the stream's parameters.
      assert.match(sql, /s\.company_id=\$2 AND s\.call_id=\$3 AND s\.assistant_id=\$4/);
      assert.match(sql, /c\.company_id=s\.company_id/);
      assert.match(sql, /a\.company_id=s\.company_id/);
      if (JSON.stringify(values) !== JSON.stringify(["CA-fixture", 20, 10, 30])) return { rows: [] };
      if (sessionReads > 1 && options.loseLock) return { rows: [{ completed: true }] };
      return { rows: [{ caller_phone: options.caller ?? "+447700900123", completed }] };
    }
    if (sql.startsWith("SELECT id,name,address")) return { rows: [] };
    if (sql.startsWith("INSERT INTO contacts")) return { rows: [{ id: 40 }] };
    if (sql.startsWith("SELECT job_id")) return { rows: [{ job_id: null }] };
    if (sql.startsWith("UPDATE calls") && sql.includes("caller_name")) {
      assert.match(sql, /WHERE id=\$1 AND company_id=\$2$/);
      assert.doesNotMatch(sql, /SET company_id/);
      if (options.failWrite) throw new Error("database unavailable");
    }
    if (sql.startsWith("UPDATE voice_call_sessions")) completed = true;
    return { rows: [] };
  });
  return queries;
}

test("rejects mismatched business, call and assistant before CRM or provider work", async () => {
  for (const mismatch of [{ companyId: 21 }, { callId: 11 }, { assistantId: 31 }]) {
    const queries = database();
    globalThis.fetch = async () => { throw new Error("Provider must not be called"); };
    await finaliseRealtimeEnquiry({ ...input, ...mismatch });
    assert.deepEqual(queries.map(q => q.sql.split(" ")[0]), ["BEGIN", "SELECT", "COMMIT"]);
  }
});

test("preserves raw transcript before a provider failure and completes a follow-up enquiry once", async () => {
  const queries = database();
  process.env.OPENAI_API_KEY = "test-only";
  globalThis.fetch = async (_url, init) => {
    assert.ok(init?.signal, "extraction must have a timeout");
    assert.ok(queries.some(q => q.sql.startsWith("UPDATE calls SET transcript=")));
    throw new Error("provider unavailable");
  };
  await finaliseRealtimeEnquiry(input);
  const call = queries.find(q => q.sql.includes("SET caller_name="));
  assert.ok(call);
  assert.match(String(call.values[6]), /Caller said: Please call about my kitchen sockets/);
  assert.equal(call.values[3], "+447700900123");
  assert.equal(queries.filter(q => q.sql.startsWith("INSERT INTO tasks")).length, 1);
  await finaliseRealtimeEnquiry(input);
  assert.equal(queries.filter(q => q.sql.startsWith("INSERT INTO tasks")).length, 1);
});

test("does not merge withheld callers into an anonymous customer", async () => {
  delete process.env.OPENAI_API_KEY;
  const queries = database({ caller: "anonymous" });
  await finaliseRealtimeEnquiry(input);
  assert.equal(queries.filter(q => q.sql.startsWith("INSERT INTO contacts")).length, 0);
  const call = queries.find(q => q.sql.includes("SET caller_name="));
  assert.ok(call);
  assert.equal(call.values[4], null);
  assert.equal(call.values[3], "Unknown");
});

test("invalid structured extraction falls back without inventing customer details", async () => {
  const queries = database();
  process.env.OPENAI_API_KEY = "test-only";
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: {
    content: JSON.stringify({ name: { unexpected: true }, summary: "Fabricated summary", safetyConcern: "false" }),
  } }] }), { status: 200 });
  await finaliseRealtimeEnquiry(input);
  const call = queries.find(q => q.sql.includes("SET caller_name="));
  assert.ok(call);
  assert.equal(call.values[2], "Unknown caller");
  assert.doesNotMatch(String(call.values[6]), /Fabricated/);
});

test("valid urgent enquiries retain verified caller identity and create a high-priority follow-up", async () => {
  const queries = database();
  process.env.OPENAI_API_KEY = "test-only";
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: {
    content: JSON.stringify({ name: "Test caller", callbackPhone: "07700 900456", work: "Socket smoking",
      address: null, urgency: "emergency", availability: null, summary: "Caller reports smoke from a socket", safetyConcern: true }),
  } }] }), { status: 200 });
  await finaliseRealtimeEnquiry(input);
  const call = queries.find(q => q.sql.includes("SET caller_name="));
  assert.ok(call);
  assert.equal(call.values[3], "+447700900123");
  assert.equal(call.values[5], "Urgent — review promptly");
  const task = queries.find(q => q.sql.startsWith("INSERT INTO tasks"));
  assert.ok(task);
  assert.equal(task.values[1], "high");
  assert.equal(task.values[2], 20);
  const contact = queries.find(q => q.sql.startsWith("SELECT id,name,address"));
  assert.ok(contact);
  assert.match(contact.sql, /WHERE company_id=\$1 AND phone=\$2/);
  assert.deepEqual(contact.values, [20, "+447700900123"]);
});

test("a concurrent completed finaliser prevents a second task or customer", async () => {
  delete process.env.OPENAI_API_KEY;
  const queries = database({ loseLock: true });
  await finaliseRealtimeEnquiry(input);
  assert.ok(queries.some(q => q.sql.includes("FOR UPDATE OF s,c")));
  assert.equal(queries.filter(q => q.sql.startsWith("INSERT")).length, 0);
});

test("database write failure rolls back while the earlier transcript remains captured", async () => {
  delete process.env.OPENAI_API_KEY;
  const queries = database({ failWrite: true });
  await assert.rejects(finaliseRealtimeEnquiry(input), /database unavailable/);
  assert.equal(queries.at(-1)?.sql, "ROLLBACK");
  assert.equal(queries.filter(q => q.sql.startsWith("UPDATE voice_call_sessions")).length, 0);
  assert.ok(queries.findIndex(q => q.sql.startsWith("UPDATE calls SET transcript=")) < queries.findIndex(q => q.sql === "COMMIT"));
});

test("a completed call cannot have its transcript overwritten by a late retry", async () => {
  const queries = database({ completed: true });
  await finaliseRealtimeEnquiry(input);
  assert.equal(queries.filter(q => q.sql.startsWith("UPDATE") || q.sql.startsWith("INSERT")).length, 0);
});
