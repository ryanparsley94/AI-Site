import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { IncomingMessage } from "node:http";

function safeEqualBase64(actual: string, expected: string): boolean {
  try {
    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(expected);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  } catch {
    return false;
  }
}

/** Validate the exact public URL and every form parameter, per Twilio's signed webhook format. */
export function validTwilioRequest(req: Request): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const base = process.env.VOICE_PUBLIC_BASE_URL;
  const signature = req.header("X-Twilio-Signature");
  if (!token || !base || !signature || req.method !== "POST" || !req.is("application/x-www-form-urlencoded")) return false;
  try {
    const url = new URL(req.originalUrl, `${base.replace(/\/+$/, "")}/`).toString();
    let payload = url;
    for (const key of Object.keys(req.body ?? {}).sort()) {
      const value = req.body[key];
      if (typeof value !== "string") return false;
      payload += key + value;
    }
    const expected = createHmac("sha1", token).update(payload, "utf8").digest("base64");
    return safeEqualBase64(signature, expected);
  } catch {
    return false;
  }
}

/**
 * Validate Twilio's WebSocket upgrade for Media Streams.
 * Twilio signs the public WebSocket URL. We derive it only from our configured
 * public base URL so Host-header spoofing cannot influence signature checks.
 */
export function validTwilioWebSocketRequest(req: IncomingMessage): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const base = process.env.VOICE_PUBLIC_BASE_URL;
  const signature = req.headers["x-twilio-signature"];
  if (!token || !base || typeof signature !== "string" || !req.url) return false;

  try {
    const configured = new URL(base);
    const relative = new URL(req.url, "https://internal.invalid");
    const search = relative.search;
    const pathname = relative.pathname;

    const candidates = [
      `wss://${configured.host}${pathname}${search}`,
      `https://${configured.host}${pathname}${search}`,
    ];

    return candidates.some((url) => {
      const expected = createHmac("sha1", token).update(url, "utf8").digest("base64");
      return safeEqualBase64(signature, expected);
    });
  } catch {
    return false;
  }
}
