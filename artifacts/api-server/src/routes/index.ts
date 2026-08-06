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
import invoicesRouter from "./invoices";
import certificatesRouter from "./certificates";
import dashboardRouter from "./dashboard";
import widgetRouter from "./widget";
import emailInboundRouter from "./email-threads-inbound";
import emailThreadsRouter from "./email-threads";
import integrationsRouter from "./integrations";
import tasksRouter from "./tasks";

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

// ── Dashboard routes ──────────────────────────────────────────────────────────
router.use(companyRouter);
router.use(assistantsRouter);
router.use(contactsRouter);
router.use(jobsRouter);
router.use(callsRouter);
router.use(quotesRouter);
router.use(invoicesRouter);
router.use(certificatesRouter);
router.use(dashboardRouter);
router.use(emailThreadsRouter);
router.use(integrationsRouter);
// Tasks route is protected by adminOnly to guard contractor data and AI generation
router.use(adminOnly, tasksRouter);

export default router;
