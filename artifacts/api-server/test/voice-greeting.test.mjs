import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOpeningGreeting,
  createOpeningResponseGate,
  isGreetingKnowledgeCategory,
  stripWebsiteGreetingFields,
} from "../src/lib/voice-twiml.ts";

test("website greetings are reference data, not a second callable training item", () => {
  const entries = [
    { category: "receptionist_greeting", question: "Website greeting", answer: "Welcome to Parsley Electrical." },
    { category: "receptionistGreeting", question: "Alternate category", answer: "Hello." },
    { category: "service", question: "Services", answer: "Electrical repairs" },
  ];
  const callable = entries.filter((entry) => !isGreetingKnowledgeCategory(entry.category));
  assert.deepEqual(callable.map((entry) => entry.answer), ["Electrical repairs"]);
  assert.equal(entries.length, 3, "filtering callable context must not delete stored knowledge");

  const websiteFacts = stripWebsiteGreetingFields({
    companyName: "Parsley Electrical",
    services: ["Electrical repairs"],
    receptionistGreeting: "Welcome to Parsley Electrical.",
    nested: { greeting: "Hello there" },
  });
  assert.deepEqual(websiteFacts, {
    companyName: "Parsley Electrical",
    services: ["Electrical repairs"],
    nested: {},
  });
});

test("opening greeting is sourced once from the saved greeting or business fallback", () => {
  const imported = buildOpeningGreeting("Parsley Electrical", "Hi there, you've reached Parsley Electrical. How can I help?");
  assert.equal(imported, "Hi there, you've reached Parsley Electrical. How can I help?");
  assert.equal((imported.match(/you've reached Parsley Electrical/g) ?? []).length, 1);

  const fallback = buildOpeningGreeting("Parsley Electrical", null);
  assert.equal(fallback, "Hello, you've reached Parsley Electrical. How can I help?");
  assert.equal((fallback.match(/Hello, you've reached Parsley Electrical/g) ?? []).length, 1);
});

test("session.updated and reconnect handlers can claim only one greeting per connection", () => {
  const canStart = createOpeningResponseGate();
  assert.equal(canStart(), true);
  assert.equal(canStart(), false);
  assert.equal(canStart(), false);
});
