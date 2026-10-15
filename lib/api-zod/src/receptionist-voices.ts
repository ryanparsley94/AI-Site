export const RECEPTIONIST_VOICE_PERSONAS = [
  {
    id: "cedar",
    label: "Edward",
    gender: "Male",
    description: "Male · calm, mature and professional, with warm, clear British delivery.",
    direction: "mature, warm, calm and professional; speak clear, natural British English without exaggeration",
  },
  {
    id: "ash",
    label: "Arthur",
    gender: "Male",
    description: "Male · direct and practical, with a Northern England flavour.",
    direction: "direct, friendly British delivery with a subtle Northern England style cue",
  },
  {
    id: "echo",
    label: "George",
    gender: "Male",
    description: "Male · steady and welcoming, with a Scottish-influenced style.",
    direction: "warm, steady British delivery with a subtle Scottish-influenced style cue",
  },
  {
    id: "coral",
    label: "Charlotte",
    gender: "Female",
    description: "Female · bright and conversational, with a Welsh-influenced style.",
    direction: "bright, conversational British delivery with a subtle Welsh-influenced style cue",
  },
  {
    id: "sage",
    label: "Sophie",
    gender: "Female",
    description: "Female · calm and composed, with a West Country style.",
    direction: "calm, composed British delivery with a subtle West Country style cue",
  },
  {
    id: "shimmer",
    label: "Amelia",
    gender: "Female",
    description: "Female · poised and articulate, with a Southern English style.",
    direction: "poised, articulate British delivery with a subtle Southern English style cue",
  },
] as const;

export type ReceptionistVoiceId = (typeof RECEPTIONIST_VOICE_PERSONAS)[number]["id"];

export function getReceptionistVoicePersona(value: string | null | undefined) {
  return RECEPTIONIST_VOICE_PERSONAS.find((persona) => persona.id === value) ?? RECEPTIONIST_VOICE_PERSONAS[0];
}
