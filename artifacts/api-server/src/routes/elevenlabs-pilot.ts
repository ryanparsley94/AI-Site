import { Router } from "express";

const router = Router();
const WINDOW_MS = 10 * 60_000;
const MAX_SIGNED_URLS_PER_WINDOW = 3;
const attempts = new Map<string, { count: number; resetAt: number }>();

function isConfigured() {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  const agentId = process.env.ELEVENLABS_AGENT_ID?.trim();
  return Boolean(key && agentId && /^agent_[a-zA-Z0-9]+$/.test(agentId));
}

function sameOrigin(req: import("express").Request) {
  const origin = req.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const forwarded = req.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwarded || req.get("host");
    return parsed.protocol === "https:" && parsed.host === host;
  } catch {
    return false;
  }
}

// The parent /api router applies adminOnly before mounting this router.
// This endpoint must never be made a public demo endpoint: a signed URL grants
// billable access to the ElevenLabs agent even though it contains no API key.
router.use("/voice/elevenlabs", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
  next();
});

router.get("/voice/elevenlabs/status", (_req, res) => {
  res.json({
    configured: isConfigured(),
    mode: "authenticated-pilot",
    message: isConfigured()
      ? "Ready to connect. An authenticated user may start a pilot conversation."
      : "Connect ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in Replit Secrets first.",
  });
});

router.post("/voice/elevenlabs/session", async (req, res): Promise<void> => {
  // Origin check is intentionally strict: don't issue a paid signed URL to a
  // cross-site page, even if the browser happens to send a dashboard cookie.
  if (!sameOrigin(req)) {
    res.status(403).json({ error: "Open CREWON using its secure HTTPS address." });
    return;
  }
  if (!isConfigured()) {
    res.status(503).json({ error: "ElevenLabs is not configured in Replit Secrets." });
    return;
  }

  const now = Date.now();
  for (const [key, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(key);
  }
  const ipKey = req.ip || "unknown";
  const previous = attempts.get(ipKey);
  const attempt = previous && previous.resetAt > now
    ? previous
    : { count: 0, resetAt: now + WINDOW_MS };
  if (attempt.count >= MAX_SIGNED_URLS_PER_WINDOW) {
    res.setHeader("Retry-After", String(Math.ceil((attempt.resetAt - now) / 1000)));
    res.status(429).json({ error: "Pilot limit reached. Try again in a few minutes." });
    return;
  }
  attempt.count += 1;
  attempts.set(ipKey, attempt);

  const apiKey = process.env.ELEVENLABS_API_KEY!.trim();
  const agentId = process.env.ELEVENLABS_AGENT_ID!.trim();
  const endpoint = new URL("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url");
  endpoint.searchParams.set("agent_id", agentId);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      // Never return an upstream response body; it may contain account details.
      res.status(502).json({ error: "ElevenLabs couldn't authorise a conversation. Check the agent and API key." });
      return;
    }
    const payload: unknown = await response.json();
    const signedUrl = (payload && typeof payload === "object" && "signed_url" in payload)
      ? (payload as { signed_url?: unknown }).signed_url : undefined;
    if (typeof signedUrl !== "string") {
      res.status(502).json({ error: "ElevenLabs returned an invalid connection." });
      return;
    }
    const url = new URL(signedUrl);
    if (url.protocol !== "wss:" || !(url.hostname === "elevenlabs.io" || url.hostname.endsWith(".elevenlabs.io"))) {
      res.status(502).json({ error: "ElevenLabs returned an unrecognised connection." });
      return;
    }
    res.json({ signedUrl, expiresInSeconds: 900 });
  } catch {
    // Avoid printing API keys or signed URLs in logs.
    res.status(502).json({ error: "ElevenLabs is currently unavailable. Try again shortly." });
  }
});

export default router;
