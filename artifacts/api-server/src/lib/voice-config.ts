export const CANONICAL_VOICE_PUBLIC_BASE_URL = "https://crew-on.replit.app";
export type VoicePublicBaseUrlIssue = "missing" | "whitespace" | "invalid_url" | "wrong_origin" | "extra_path_or_query" | null;

export function getVoicePublicBaseUrlIssue(value = process.env.VOICE_PUBLIC_BASE_URL): VoicePublicBaseUrlIssue {
  if (!value) return "missing";
  if (value !== value.trim()) return "whitespace";
  let url: URL;
  try { url = new URL(value); }
  catch { return "invalid_url"; }
  if (url.origin !== CANONICAL_VOICE_PUBLIC_BASE_URL) return "wrong_origin";
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "" || url.username || url.password) {
    return "extra_path_or_query";
  }
  return null;
}

/**
 * Voice webhooks must use one exact public HTTPS origin so Twilio signs the same
 * URL that the handlers validate. Reject whitespace, paths and alternate hosts.
 */
export function getVoicePublicBaseUrl(value = process.env.VOICE_PUBLIC_BASE_URL): URL | null {
  if (!value) return null;
  if (getVoicePublicBaseUrlIssue(value)) return null;
  try {
    const url = new URL(value);
    if (url.origin !== CANONICAL_VOICE_PUBLIC_BASE_URL) return null;
    return new URL(CANONICAL_VOICE_PUBLIC_BASE_URL);
  } catch {
    return null;
  }
}
