import { Router } from "express";
import { issueSessionIfValid, hasValidSession, COOKIE_NAME } from "../lib/adminAuth";

const router = Router();

/**
 * POST /auth/login
 * Body: { password: string }
 * Validates the password against SESSION_SECRET and issues a signed session
 * cookie on success.  Returns 401 on wrong password, 503 if SESSION_SECRET
 * is not configured.
 */
router.post("/auth/login", (req, res): void => {
  const { password } = req.body as { password?: string };

  if (!process.env.SESSION_SECRET) {
    res.status(503).json({ error: "Admin authentication is not configured on this server." });
    return;
  }

  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "password is required" });
    return;
  }

  const ok = issueSessionIfValid(password, req, res);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Incorrect password" });
  }
});

/**
 * GET /auth/check
 * Returns { authenticated: true } if the request carries a valid admin session,
 * { authenticated: false } otherwise.  Never returns a 401 so the dashboard can
 * silently check auth status on mount.
 */
router.get("/auth/check", (req, res): void => {
  res.json({ authenticated: hasValidSession(req) });
});

/**
 * POST /auth/logout
 * Clears the admin session cookie.
 */
router.post("/auth/logout", (req, res): void => {
  res.clearCookie(COOKIE_NAME, { path: "/api" });
  res.json({ ok: true });
});

export default router;
