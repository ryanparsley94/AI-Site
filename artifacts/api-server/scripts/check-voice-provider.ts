// Non-mutating smoke test. Uses the existing integration client without handling credentials.
import { openai } from "@workspace/integrations-openai-ai-server";
import { speechToText } from "@workspace/integrations-openai-ai-server/audio";
import { readFile } from "node:fs/promises";

const result = await openai.chat.completions.create({
  model: "gpt-4o", max_completion_tokens: 8192,
  messages: [{ role: "user", content: "What is on today's schedule? Classify using the tool." }],
  tools: [{ type: "function", function: { name: "command", parameters: {
    type: "object", required: ["action"], properties: { action: { type: "string", enum: ["schedule"] } },
  } } }],
  tool_choice: { type: "function", function: { name: "command" } },
});
if (result.choices[0]?.message.tool_calls?.length !== 1) throw new Error("Function calling unavailable");
console.log("GPT-4o function calling: OK");
const speech = await openai.chat.completions.create({
  model: "gpt-audio", modalities: ["text", "audio"], audio: { voice: "shimmer", format: "wav" },
  messages: [{ role: "system", content: "Repeat the text verbatim in a British accent." }, { role: "user", content: "You have no active jobs today." }],
});
if (!speech.choices[0]?.message.audio?.data) throw new Error("Audio unavailable");
console.log("British prompted spoken response: OK");
const transcript = await speechToText(Buffer.from(speech.choices[0].message.audio.data, "base64"), "wav");
if (!transcript.trim()) throw new Error("Transcription unavailable");
console.log("OpenAI transcription fallback: OK");

if (process.argv[2]) {
  const image = await readFile(process.argv[2]);
  const vision = await openai.chat.completions.create({
    model: "gpt-4o", max_completion_tokens: 8192, response_format: { type: "json_object" },
    messages: [
      { role: "system", content: 'Extract clearly visible materials and explicit quantities from this image, never guessing. Return JSON {"items":[{"name":string,"quantity":number,"unit":string}]}.' },
      { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${image.toString("base64")}` } }] },
    ],
  });
  const draft = JSON.parse(vision.choices[0]?.message.content || "{}");
  if (draft.items?.[0]?.quantity !== 20 || !/copper/i.test(draft.items[0].name)) throw new Error("Vision extraction incorrect");
  console.log("GPT-4o material photo extraction: OK");
}
