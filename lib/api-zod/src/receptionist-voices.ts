export const RECEPTIONIST_VOICE_PERSONAS = [
  {
    id: "cedar",
    label: "Edward",
    gender: "Male",
    description: "Male · calm and professional, with a subtle South-East England style cue.",
    direction: "A friendly adult man from Essex in South-East England. Use contemporary, natural UK English with a light local cadence and relaxed, clear phrasing. Keep the accent subtle and authentic, never exaggerated or caricatured.",
  },
  {
    id: "ash",
    label: "Arthur",
    gender: "Male",
    description: "Male · direct and practical, with a subtle Northern England style cue.",
    direction: "A friendly adult man with a subtle Northern England style. Use natural UK English, straightforward wording, and an easy conversational rhythm; do not perform or exaggerate the accent.",
  },
  {
    id: "echo",
    label: "George",
    gender: "Male",
    description: "Male · steady and welcoming, with a subtle Scottish style cue.",
    direction: "A warm, steady adult man with a light Scottish-influenced UK cadence. Speak clearly and conversationally; keep the regional character subtle, never theatrical.",
  },
  {
    id: "coral",
    label: "Charlotte",
    gender: "Female",
    description: "Female · bright and conversational, with a subtle Welsh style cue.",
    direction: "A bright, approachable adult woman with a light Welsh-influenced UK cadence. Use natural conversational phrasing and clear articulation; avoid an exaggerated performance.",
  },
  {
    id: "sage",
    label: "Sophie",
    gender: "Female",
    description: "Female · calm and composed, with a West Country style.",
    direction: "A calm, composed adult woman with a light West Country-influenced UK cadence. Keep the delivery warm, measured and natural, without caricature.",
  },
  {
    id: "shimmer",
    label: "Amelia",
    gender: "Female",
    description: "Female · poised and articulate, with a subtle Southern English style cue.",
    direction: "A poised, articulate adult woman with a natural Southern English UK cadence. Keep the rhythm relaxed and conversational, with a subtle regional character rather than a performed accent.",
  },
] as const;

export type ReceptionistVoiceId = (typeof RECEPTIONIST_VOICE_PERSONAS)[number]["id"];

export function getReceptionistVoicePersona(value: string | null | undefined) {
  return RECEPTIONIST_VOICE_PERSONAS.find((persona) => persona.id === value) ?? RECEPTIONIST_VOICE_PERSONAS[0];
}
