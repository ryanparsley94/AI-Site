import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validTwilioRequest } from "../src/lib/voice-security.ts";

test("Twilio form signature accepts the exact URL and fields and rejects tampering", () => {
  process.env.TWILIO_AUTH_TOKEN = "pilot-test-token";
  process.env.VOICE_PUBLIC_BASE_URL = "https://example.replit.dev";
  const url = "https://example.replit.dev/api/voice/answer?step=2";
  const body = { SpeechResult: "Install a new consumer unit", CallSid: `CA${"a".repeat(32)}` };
  // Twilio alphabetises form keys before signing, regardless of insertion order.
  const signed = url + "CallSid" + body.CallSid + "SpeechResult" + body.SpeechResult;
  const signature = createHmac("sha1", process.env.TWILIO_AUTH_TOKEN).update(signed).digest("base64");
  const request = {
    originalUrl: "/api/voice/answer?step=2", method: "POST", body,
    header: () => signature, is: () => true,
  };
  assert.equal(validTwilioRequest(request), true);
  assert.equal(validTwilioRequest({ ...request, body: { ...body, SpeechResult: "send me money" } }), false);
  assert.equal(validTwilioRequest({ ...request, originalUrl: "/api/voice/answer?step=3" }), false);
  assert.equal(validTwilioRequest({ ...request, method: "GET" }), false);
  assert.equal(validTwilioRequest({ ...request, body: { ...body, Extra: ["x"] } }), false);
  delete process.env.TWILIO_AUTH_TOKEN;
  assert.equal(validTwilioRequest(request), false);
});
