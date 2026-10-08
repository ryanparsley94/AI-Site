/**
 * Admin session for single-tenant contractor dashboard.
 *
 * Security model
 * ──────────────
 * A session cookie is only issued after the caller presents the correct admin
 * password (== SESSION_SECRET env var) via POST /api/auth/login. The server
 * never auto-issues a session to unauthenticated requests.
 *
 * The cookie is:
 *   – HttpOnly   → inaccessible to embedded JavaScript on third-party sites
 *   – SameSite=Lax → allows the top-level OAuth callback redirect while
 *     preventing third-party subrequests from carrying the dashboard cookie
 *   – Secure in production → only sent over HTTPS
 *   – Signed with SESSION_SECRET via HMAC-SHA256 → cannot be forged without
 *     knowledge of the server-side secret
 *
 * Fails closed: if SESSION_SECRET is not set, every login attempt is rejected
 * and every adminOnly check returns 401.
 */
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";

export const COOKIE_NAME = "bai_admin";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string | null {
  return process.env.SESSION_SECRET ?? null;
}

function sign(value: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(value);
  const sig = hmac.digest("hex").slice(0, 32);
  return `${value}.${sig}`;
}

function verify(signed: string, secret: string): boolean {
  try {
    const dotIdx = signed.lastIndexOf(".");
    if (dotIdx < 1) return false;
    const value = signed.slice(0, dotIdx);
    const expected = sign(value, secret);
    const a = Buffer.from(signed.padEnd(expected.length, " "));
    const b = Buffer.from(expected.padEnd(a.length, " "));
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b) && signed === expected;
  } catch {
    return false;
  }
}

/**
 * Validate the provided password and, if correct, set an admin session cookie.
 * Returns true on success, false on incorrect password or missing SESSION_SECRET.
 */
export function issueSessionIfValid(
  password: string,
  req: Request,
  res: Response
): boolean {
  const secret = getSecret();
  if (!secret) return false;

  // Constant-time comparison against SESSION_SECRET
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }

  // Issue a nonce-based signed token (so each session is unique)
  const nonce = randomBytes(16).toString("hex");
  const token = sign(`admin:${nonce}`, secret);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_MS,
    path: "/api",
  });
  return true;
}

/** Check whether the current request carries a valid admin session cookie. */
export function hasValidSession(req: Request): boolean {
  const secret = getSecret();
  if (!secret) return false;
  const cookie = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!cookie) return false;
  return verify(cookie, secret);
}

/** Middleware: require a valid admin session cookie; returns 401 otherwise. */
export function adminOnly(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!hasValidSession(req)) {
    res.status(401).json({ error: "Unauthorized — admin session required" });
    return;
  }
  next();
}
