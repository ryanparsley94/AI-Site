import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRealtimeAudioOutput,
  clearRealtimeVoiceCacheForTests,
  resolveRealtimeVoice,
} from "../src/lib/realtime-voice-config.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  clearRealtimeVoiceCacheForTests();
});

test("stock persona selection is used unless custom voices are explicitly enabled", async () => {
  const result = await resolveRealtimeVoice("cedar", "cedar", {
    enabled: "false",
    configuredIds: JSON.stringify({ cedar: "voice_custom1" }),
    apiKey: "test-only",
  });
  assert.deepEqual(result, { voice: "cedar", kind: "stock", status: "disabled" });
});

test("custom voice is selected only when listed by the current OpenAI project", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: "voice_custom1" }] }), { status: 200 });
  const result = await resolveRealtimeVoice("cedar", "cedar", {
    enabled: "true",
    configuredIds: JSON.stringify({ cedar: "voice_custom1" }),
    apiKey: "test-only",
  });
  assert.deepEqual(result, { voice: { id: "voice_custom1" }, kind: "custom", status: "active" });
  assert.deepEqual(buildRealtimeAudioOutput(result.voice), {
    format: { type: "audio/pcmu" },
    voice: { id: "voice_custom1" },
    speed: 1,
  });
});

test("unlisted or malformed custom IDs safely retain the saved stock voice", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: "voice_other" }] }), { status: 200 });
  const unavailable = await resolveRealtimeVoice("cedar", "cedar", {
    enabled: "true",
    configuredIds: JSON.stringify({ cedar: "voice_custom1" }),
    apiKey: "test-only",
  });
  assert.deepEqual(unavailable, { voice: "cedar", kind: "stock", status: "unavailable" });
  const malformed = await resolveRealtimeVoice("cedar", "cedar", {
    enabled: "true",
    configuredIds: JSON.stringify({ cedar: "not-a-voice-id" }),
    apiKey: "test-only",
  });
  assert.deepEqual(malformed, { voice: "cedar", kind: "stock", status: "not_configured" });
});
