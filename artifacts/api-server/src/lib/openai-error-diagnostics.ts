export type OpenAiLimitCategory = "quota_or_billing" | "transient_rate_limit" | "unclassified_429" | "other";

export interface OpenAiErrorDiagnostic {
  category: OpenAiLimitCategory;
  type: string | null;
  code: string | null;
  requestId: string | null;
}

function safeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_.-]{1,80}$/.test(trimmed) ? trimmed : null;
}

export function getOpenAiErrorDiagnostic(
  body: unknown,
  requestIdHeader: string | null,
): OpenAiErrorDiagnostic {
  const root = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const rawError = root.error && typeof root.error === "object"
    ? root.error as Record<string, unknown>
    : root;
  const type = safeToken(rawError.type);
  const code = safeToken(rawError.code);
  const requestId = safeToken(requestIdHeader);
  const marker = `${type ?? ""} ${code ?? ""}`.toLowerCase();
  const category: OpenAiLimitCategory =
    /insufficient_quota|billing_hard_limit|quota_exceeded/.test(marker)
      ? "quota_or_billing"
      : /rate_limit/.test(marker)
        ? "transient_rate_limit"
        : "other";
  return { category, type, code, requestId };
}

export function getSampleAudioErrorMessage(diagnostic: OpenAiErrorDiagnostic): string {
  if (diagnostic.category === "quota_or_billing") {
    return "OpenAI did not allow sample generation because the project may have reached its quota or billing limit. Check the OpenAI project’s usage and billing settings.";
  }
  if (diagnostic.category === "transient_rate_limit") {
    return "OpenAI is temporarily rate-limiting sample generation. Wait a little, then retry; the sample will be cached after it succeeds.";
  }
  if (diagnostic.category === "unclassified_429") {
    return "OpenAI returned HTTP 429 without a specific reason code. Check the project’s usage, quota and rate limits before retrying.";
  }
  return "OpenAI could not generate the sample. Check the OpenAI project’s audio-model access, then retry.";
}
