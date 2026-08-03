import { Router, type IRouter } from "express";
import { adminOnly } from "../lib/adminAuth";
import healthRouter from "./health";
import authRouter from "./auth";
import companyRouter from "./company";
import assistantsRouter from "./assistants";
import contactsRouter from "./contacts";
import jobsRouter from "./jobs";
import callsRouter from "./calls";
import quotesRouter from "./quotes";
import certificatesRouter from "./certificates";
import dashboardRouter from "./dashboard";
import widgetRouter from "./widget";

const router: IRouter = Router();

// ── Public routes (no session required) ──────────────────────────────────────
// Health check and auth endpoints are always accessible.
// Widget endpoints (widget.js, widget/config, widget/chat) are public by design
// so they can be loaded from any third-party website.
router.use(healthRouter);
router.use(authRouter);
router.use(widgetRouter);

// ── Admin session gate ────────────────────────────────────────────────────────
// Every route mounted below this line requires a valid admin session cookie.
// Unauthenticated requests receive 401. This covers company, assistants,
// training, contacts, jobs, calls, quotes, certificates, and dashboard CRUD —
// any resource that could influence the live widget if tampered with.
router.use(adminOnly);

// ── Protected dashboard routes ────────────────────────────────────────────────
router.use(companyRouter);
router.use(assistantsRouter);
router.use(contactsRouter);
router.use(jobsRouter);
router.use(callsRouter);
router.use(quotesRouter);
router.use(certificatesRouter);
router.use(dashboardRouter);

export default router;
