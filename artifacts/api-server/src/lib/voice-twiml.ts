export const DEFAULT_TWILIO_VOICE = "Polly.Amy-Neural";

export const TWILIO_UK_NEURAL_VOICES = [
  "Polly.Amy-Neural",
  "Polly.Emma-Neural",
  "Polly.Arthur-Neural",
  "Polly.Brian-Neural",
] as const;

export type TwilioUkNeuralVoice = (typeof TWILIO_UK_NEURAL_VOICES)[number];

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

function greetingBody(value: string | null | undefined): string {
  const withoutSalutation = (value ?? "").trim().replace(/^(?:hello|hi(?: there)?|good morning|good afternoon|thanks for calling)[,\s—-]*/i, "");
  const withoutDuplicateIdentity = withoutSalutation.replace(/^(?:you(?:'ve| have) reached (?:our|the) [^.!?]+[.!?]\s*)/i, "").trim();
  return withoutDuplicateIdentity || "How can I help?";
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
  const configuredGreeting = greetingBody(settings.greeting);
  const identity = `Hello, you've reached ${businessName}.${agentName ? ` This is ${agentName}.` : ""}`;
  const greeting = step === 0
    ? buildSpeech(`${identity} ${configuredGreeting || "How can I help?"}`, voiceId)
    : "";
  return step === 0 ? `${greeting}${buildListeningGather(step)}` : buildVoiceQuestion(step, question, "", voiceId);
}
