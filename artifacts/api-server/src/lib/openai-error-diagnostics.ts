export type OpenAiLimitCategory = "quota_or_billing" | "transient_rate_limit" | "unclassified_429" | "other";

export interface OpenAiErrorDiagnostic {
  category: OpenAiLimitCategory;
  type: string | null;
  code: string | null;
  requestId: string | null;
  message: string | null;
  param: string | null;
}

function safeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_.-]{1,80}$/.test(trimmed) ? trimmed : null;
}

function safeParam(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_.\[\]-]{1,120}$/.test(trimmed) ? trimmed : null;
}

function safeMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[redacted email]")
    .replace(/\+?\d[\d ().-]{7,}\d/g, "[redacted number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  return message || null;
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
  const message = safeMessage(rawError.message);
  const param = safeParam(rawError.param);
  const marker = `${type ?? ""} ${code ?? ""}`.toLowerCase();
  const category: OpenAiLimitCategory =
    /insufficient_quota|billing_hard_limit|quota_exceeded/.test(marker)
      ? "quota_or_billing"
      : /rate_limit/.test(marker)
        ? "transient_rate_limit"
        : "other";
  return { category, type, code, requestId, message, param };
}

export function getRealtimeSessionErrorMessage(status: number, diagnostic: OpenAiErrorDiagnostic): string {
  const code = diagnostic.code ? ` ${diagnostic.code}` : "";
  const param = diagnostic.param ? ` (${diagnostic.param})` : "";
  const detail = diagnostic.message ? ` ${diagnostic.message}` : "";
  const request = diagnostic.requestId ? ` Reference: ${diagnostic.requestId}.` : "";

  if (status === 401 || status === 403) {
    return `OpenAI rejected authentication for the Realtime session (HTTP ${status}). Check the production OpenAI credential and project access; the credential value is not shown.${request}`;
  }
  if (status === 429 && diagnostic.category === "quota_or_billing") {
    return `OpenAI rejected the Realtime session because the project quota or billing limit was reached (HTTP 429). Check project usage and billing.${request}`;
  }
  if (status === 429 && diagnostic.category === "transient_rate_limit") {
    return `OpenAI is temporarily rate-limiting Realtime session creation (HTTP 429). Wait briefly and retry.${request}`;
  }
  if (status === 400) {
    return `OpenAI rejected the Realtime session settings (HTTP 400${code}${param}).${detail}${request}`;
  }
  return `OpenAI could not create the Realtime session (HTTP ${status}${code}${param}).${detail}${request}`;
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
