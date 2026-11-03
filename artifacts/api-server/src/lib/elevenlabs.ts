const voiceIds = ["cedar", "ash", "echo", "coral", "sage", "shimmer"] as const;

export function elevenLabsVoiceId(voice: string): string | null {
  const raw = process.env.ELEVENLABS_VOICE_MAP;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const id = parsed[voice];
    return typeof id === "string" && /^[A-Za-z0-9_-]{6,100}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function elevenLabsVoiceMapValid(): boolean {
  return voiceIds.every((voice) => elevenLabsVoiceId(voice) !== null);
}
