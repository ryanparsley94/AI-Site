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
import emailInboundRouter from "./email-threads-inbound";
import emailThreadsRouter from "./email-threads";

const router: IRouter = Router();

// ── Public routes (no session required) ──────────────────────────────────────
// Health check and auth endpoints are always accessible.
// Widget endpoints (widget.js, widget/config, widget/chat) are public by design
// so they can be loaded from any third-party website.
// Email inbound webhook (/email-threads/inbound) is public so Resend can POST to it;
// it is protected by svix webhook signature verification instead of the session cookie.
router.use(healthRouter);
router.use(authRouter);
router.use(widgetRouter);
router.use(emailInboundRouter);

// ── Admin session gate ────────────────────────────────────────────────────────
// Every route mounted below this line requires a valid admin session cookie.
// Unauthenticated requests receive 401. This covers company, assistants,
// training, contacts, jobs, calls, quotes, certificates, dashboard, and
// email-thread CRUD — any resource that could influence the live widget or
// expose customer data if tampered with.
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
router.use(emailThreadsRouter);

export default router;
