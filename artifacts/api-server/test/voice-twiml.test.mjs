import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildIncomingVoiceResponse,
  buildSpeech,
  buildVoiceQuestion,
  resolveTwilioUkNeuralVoice,
  resolveTwilioGatherVoice,
  TWILIO_UK_GATHER_VOICES,
  TWILIO_UK_NEURAL_VOICES,
} from "../src/lib/voice-twiml.ts";

test("initial greeting uses the selected agent name, or the unnamed fallback", () => {
  const named = buildIncomingVoiceResponse(0, "What's your full name?", {
    businessName: "Parsley Electrical",
    agentName: "Olivia",
    voiceId: "Polly.Emma-Neural",
    greeting: "Hello, you've reached our electrical team. How can I help?",
  });
  assert.match(named, /Hello, you&apos;ve reached Parsley Electrical\. This is Olivia\. How can I help\?/);
  assert.doesNotMatch(named, /our electrical team/);
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
    assert.equal(sayTags.length, 9);
    assert.ok(sayTags.every(tag => tag.includes(`voice="${voiceId}"`) && tag.includes('language="en-GB"')));
  }
});

test("unsupported stored voice values resolve to the documented default", () => {
  assert.equal(resolveTwilioUkNeuralVoice("invalid"), "Polly.Amy-Neural");
  assert.equal(resolveTwilioUkNeuralVoice(null), "Polly.Amy-Neural");
});

test("all six saved receptionist personas resolve to distinct Twilio en-GB Gather voices", () => {
  const personas = ["cedar", "ash", "echo", "coral", "sage", "shimmer"];
  const expectedVoices = [
    "Google.en-GB-Chirp3-HD-Charon",
    "Google.en-GB-Chirp3-HD-Fenrir",
    "Google.en-GB-Chirp3-HD-Orus",
    "Google.en-GB-Chirp3-HD-Aoede",
    "Google.en-GB-Chirp3-HD-Kore",
    "Google.en-GB-Chirp3-HD-Leda",
  ];
  assert.deepEqual([...TWILIO_UK_GATHER_VOICES], expectedVoices);
  const resolved = personas.map(persona => resolveTwilioGatherVoice(persona));
  assert.deepEqual(resolved.map(selection => selection.voice), expectedVoices);
  assert.deepEqual(resolved.map(selection => selection.personaId), personas);
  assert.ok(resolved.every(selection => selection.source === "saved_persona"));

  for (const voice of expectedVoices) {
    const greeting = buildIncomingVoiceResponse(0, "What's your full name?", { voiceId: voice });
    const followUp = buildVoiceQuestion(1, "What's the best number to call you back on?", "", voice);
    const ending = buildVoiceQuestion(6, undefined, "", voice);
    for (const twiml of [greeting, followUp, ending]) {
      assert.match(twiml, new RegExp(`voice="${voice.replaceAll(".", "\\.")}" language="en-GB"`));
    }
  }
});

test("legacy Marin selection is safely mapped to Edward's British Gather voice", () => {
  assert.deepEqual(resolveTwilioGatherVoice("marin"), {
    voice: "Google.en-GB-Chirp3-HD-Charon",
    personaId: "cedar",
    source: "legacy_persona",
  });
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

test("website-imported greeting is spoken once as the saved opening", () => {
  const fromWebsite = buildIncomingVoiceResponse(0, "Please tell me your full name.", {
    businessName: "Parsley Electrical",
    greeting: "Hi there, you've reached Parsley Electrical. How can I help?",
  });
  assert.equal((fromWebsite.match(/<Say\b/g) ?? []).length, 1);
  assert.equal((fromWebsite.match(/you&apos;ve reached Parsley Electrical/g) ?? []).length, 1);
  assert.match(fromWebsite, /Please tell me your full name/);
});

test("missing website greeting uses one business-naming fallback opening", () => {
  const withoutWebsiteGreeting = buildIncomingVoiceResponse(0, "Please tell me your full name.", {
    businessName: "Parsley Electrical",
    greeting: null,
  });
  assert.equal((withoutWebsiteGreeting.match(/<Say\b/g) ?? []).length, 1);
  assert.equal((withoutWebsiteGreeting.match(/Hello, you&apos;ve reached Parsley Electrical/g) ?? []).length, 1);
  assert.match(withoutWebsiteGreeting, /Please tell me your full name/);
});
