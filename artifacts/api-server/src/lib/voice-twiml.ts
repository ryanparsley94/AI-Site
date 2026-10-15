export const DEFAULT_TWILIO_VOICE = "Polly.Amy-Neural";

export const TWILIO_UK_NEURAL_VOICES = [
  "Polly.Amy-Neural",
  "Polly.Emma-Neural",
  "Polly.Arthur-Neural",
  "Polly.Brian-Neural",
] as const;

export type TwilioUkNeuralVoice = (typeof TWILIO_UK_NEURAL_VOICES)[number];

export function buildOpeningGreeting(
  businessName: string | null | undefined,
  savedGreeting: string | null | undefined,
  agentName?: string | null,
): string {
  const business = businessName?.trim().replace(/\s+(?:limited|ltd\.?)$/i, "").trim() || "Parsley Electrical";
  const greeting = savedGreeting?.replace(/\s+/g, " ").trim();
  const agentIntro = agentName?.trim() ? ` This is ${agentName.trim()}.` : "";
  if (!greeting) return `Hello, you've reached ${business}.${agentIntro} How can I help?`;
  if (greeting.toLocaleLowerCase("en-GB").includes(business.toLocaleLowerCase("en-GB"))) return greeting;
  const body = greeting
    .replace(/^(?:hello|hi(?: there)?|good morning|good afternoon|thanks for calling)[,\s—-]*/i, "")
    .replace(/^(?:you(?:'ve| have) reached (?:our|the) [^.!?]+[.!?]\s*)/i, "")
    .trim();
  return `Hello, you've reached ${business}.${agentIntro} ${body || "How can I help?"}`;
}

export function createOpeningResponseGate(): () => boolean {
  let started = false;
  return () => {
    if (started) return false;
    started = true;
    return true;
  };
}

export function isGreetingKnowledgeCategory(category: string): boolean {
  return ["greeting", "receptionistgreeting", "welcome"].includes(category.toLowerCase().replace(/[_\s-]+/g, ""));
}

export function stripWebsiteGreetingFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripWebsiteGreetingFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["greeting", "receptionistgreeting"].includes(key.toLowerCase().replace(/[^a-z]/g, "")))
      .map(([key, child]) => [key, stripWebsiteGreetingFields(child)]),
  );
}

export function resolveTwilioUkNeuralVoice(value: string | null | undefined): TwilioUkNeuralVoice {
  return TWILIO_UK_NEURAL_VOICES.includes(value as TwilioUkNeuralVoice)
    ? value as TwilioUkNeuralVoice
    : DEFAULT_TWILIO_VOICE;
}

function xml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

export function buildSpeech(text: string, voiceId?: string | null): string {
  const voice = resolveTwilioUkNeuralVoice(voiceId);
  return `<Say voice="${voice}" language="en-GB">${xml(text)}</Say>`;
}

export function buildVoiceQuestion(step: number, question: string | undefined, prefix = "", voiceId?: string | null): string {
  if (!question) return `${buildSpeech("Thank you. We have your message and will be in touch.", voiceId)}<Hangup/>`;
  return `<Gather input="speech" language="en-GB" speechTimeout="auto" timeout="6" actionOnEmptyResult="true" method="POST" action="/api/voice/answer?step=${step}">${buildSpeech(prefix + question, voiceId)}</Gather>`;
}

function buildListeningGather(step: number): string {
  return `<Gather input="speech" language="en-GB" speechTimeout="auto" timeout="6" actionOnEmptyResult="true" method="POST" action="/api/voice/answer?step=${step}"></Gather>`;
}

function spokenBusinessName(value: string | null | undefined): string {
  const name = value?.trim() || "Parsley Electrical";
  return name.replace(/\s+(?:limited|ltd\.?)$/i, "").trim() || "Parsley Electrical";
}

export function buildIncomingVoiceResponse(
  step: number,
  question: string | undefined,
  settings: {
    businessName?: string | null;
    agentName?: string | null;
    voiceId?: string | null;
    greeting?: string | null;
  } = {},
): string {
  const voiceId = resolveTwilioUkNeuralVoice(settings.voiceId);
  const businessName = spokenBusinessName(settings.businessName);
  const agentName = settings.agentName?.trim();
  const greeting = step === 0
    ? buildSpeech(`${buildOpeningGreeting(businessName, settings.greeting, agentName)} ${question ?? ""}`.trim(), voiceId)
    : "";
  return step === 0
    ? `${greeting}<Gather input="speech" language="en-GB" speechTimeout="auto" timeout="6" actionOnEmptyResult="true" method="POST" action="/api/voice/answer?step=${step}"></Gather>`
    : buildVoiceQuestion(step, question, "", voiceId);
}
