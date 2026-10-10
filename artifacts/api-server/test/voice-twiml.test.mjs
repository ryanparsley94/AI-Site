import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildIncomingVoiceResponse,
  buildSpeech,
  buildVoiceQuestion,
  resolveTwilioUkNeuralVoice,
  TWILIO_UK_NEURAL_VOICES,
} from "../src/lib/voice-twiml.ts";

test("initial greeting uses the selected agent name, or the unnamed fallback", () => {
  const named = buildIncomingVoiceResponse(0, "What's your full name?", {
    businessName: "Parsley Electrical",
    agentName: "Olivia",
    voiceId: "Polly.Emma-Neural",
  });
  assert.match(named, /Hello, you&apos;ve reached Parsley Electrical\. This is Olivia\. How can I help\?/);
  assert.ok(named.indexOf("<Say") < named.indexOf("<Gather"));
  assert.match(named, /voice="Polly\.Emma-Neural" language="en-GB"/);
  assert.doesNotMatch(named, /CREWON|AI receptionist/);

  const unnamed = buildIncomingVoiceResponse(0, "What's your full name?", {
    businessName: "Parsley Electrical Ltd",
    agentName: "",
    voiceId: "Polly.Amy-Neural",
  });
  assert.match(unnamed, /Hello, you&apos;ve reached Parsley Electrical\. How can I help\?/);
  assert.doesNotMatch(unnamed, /This is |CREWON|AI receptionist/);
});

test("saved voice selection is used for greeting, every prompt, retries, and spoken endings", () => {
  assert.deepEqual([...TWILIO_UK_NEURAL_VOICES], [
    "Polly.Amy-Neural", "Polly.Emma-Neural", "Polly.Arthur-Neural", "Polly.Brian-Neural",
  ]);
  for (const voiceId of TWILIO_UK_NEURAL_VOICES) {
    const turns = [
      buildIncomingVoiceResponse(0, "What's your full name?", { agentName: "Olivia", voiceId }),
      ...[
        "What's the best number to call you back on?",
        "What work do you need done?",
        "What's the job address and postcode?",
        "Is it urgent or dangerous, or is it routine?",
        "When are you available for a call or visit?",
      ].map((question, step) => buildVoiceQuestion(step + 1, question, "", voiceId)),
      buildVoiceQuestion(0, "What's your full name?", "Sorry, I didn't catch that. ", voiceId),
      buildVoiceQuestion(6, undefined, "", voiceId),
      `${buildSpeech("Thank you. Goodbye.", voiceId)}<Hangup/>`,
    ];
    const sayTags = turns.flatMap(turn => turn.match(/<Say\b[^>]*>/g) ?? []);
    assert.equal(sayTags.length, 10);
    assert.ok(sayTags.every(tag => tag.includes(`voice="${voiceId}"`) && tag.includes('language="en-GB"')));
  }
});

test("unsupported stored voice values resolve to the documented default", () => {
  assert.equal(resolveTwilioUkNeuralVoice("invalid"), "Polly.Amy-Neural");
  assert.equal(resolveTwilioUkNeuralVoice(null), "Polly.Amy-Neural");
});

test("follow-up questions do not repeat the initial greeting", () => {
  const followUp = buildIncomingVoiceResponse(1, "What's the best number to call you back on?", {
    businessName: "Parsley Electrical",
    agentName: "Olivia",
    voiceId: "Polly.Amy-Neural",
  });
  assert.doesNotMatch(followUp, /Hello, you&apos;ve reached|This is Olivia/);
  assert.match(followUp, /voice="Polly\.Amy-Neural" language="en-GB"/);
});
