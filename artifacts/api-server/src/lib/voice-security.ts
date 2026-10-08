import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

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
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  } catch {
    return false;
  }
}
