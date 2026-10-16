export type RealtimeVoiceValue = string | { id: string };
export function buildRealtimeAudioOutput(voice: RealtimeVoiceValue) {
  return { format: { type: "audio/pcmu" as const }, voice, speed: 1 };
}

const personaIds = new Set(["cedar", "ash", "echo", "coral", "sage", "shimmer"]);
const voiceIdPattern = /^voice_[A-Za-z0-9_-]+$/;
let cachedProjectVoiceIds: Set<string> | null = null;
let cachedProjectVoiceIdsUntil = 0;

function parseVoiceMap(value: string | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([persona, id]) =>
        personaIds.has(persona) && typeof id === "string" && voiceIdPattern.test(id),
      ),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

async function listProjectVoiceIds(apiKey: string): Promise<Set<string>> {
  if (cachedProjectVoiceIds && Date.now() < cachedProjectVoiceIdsUntil) return cachedProjectVoiceIds;
  const response = await fetch("https://api.openai.com/v1/audio/voices", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error(`voice_list_http_${response.status}`);
  const body = await response.json() as { data?: Array<{ id?: string }> };
  const ids = new Set((body.data ?? []).flatMap((voice) =>
    typeof voice.id === "string" && voiceIdPattern.test(voice.id) ? [voice.id] : [],
  ));
  cachedProjectVoiceIds = ids;
  cachedProjectVoiceIdsUntil = Date.now() + 5 * 60_000;
  return ids;
}

/**
 * Custom voices are opt-in and only selected when the project's Voices API
 * confirms the configured ID. Any unavailable or unauthorized configuration
 * safely retains the saved stock Realtime voice.
 */
export async function resolveRealtimeVoice(
  personaId: string,
  stockVoice: string,
  options: {
    enabled?: string;
    configuredIds?: string;
    apiKey?: string;
  },
): Promise<{ voice: RealtimeVoiceValue; kind: "stock" | "custom"; status: "disabled" | "not_configured" | "unavailable" | "active" }> {
  if (options.enabled !== "true") return { voice: stockVoice, kind: "stock", status: "disabled" };
  const customId = parseVoiceMap(options.configuredIds)[personaId];
  if (!customId || !options.apiKey) return { voice: stockVoice, kind: "stock", status: "not_configured" };
  try {
    const availableIds = await listProjectVoiceIds(options.apiKey);
    if (!availableIds.has(customId)) return { voice: stockVoice, kind: "stock", status: "unavailable" };
    return { voice: { id: customId }, kind: "custom", status: "active" };
  } catch {
    return { voice: stockVoice, kind: "stock", status: "unavailable" };
  }
}

export function clearRealtimeVoiceCacheForTests(): void {
  cachedProjectVoiceIds = null;
  cachedProjectVoiceIdsUntil = 0;
}
