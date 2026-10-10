import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import companyRouter from "./company";
import assistantsRouter from "./assistants";
import contactsRouter from "./contacts";
import jobsRouter from "./jobs";
import callsRouter from "./calls";
import quotesRouter from "./quotes";
import { publicQuoteRouter, quoteSharingRouter } from "./quote-acceptance";
import invoicesRouter from "./invoices";
import certificatesRouter from "./certificates";
import dashboardRouter from "./dashboard";
import widgetRouter from "./widget";
import emailInboundRouter from "./email-threads-inbound";
import emailThreadsRouter from "./email-threads";
import integrationsRouter from "./integrations";
import tasksRouter from "./tasks";
import marketingRouter from "./marketing";
import supportQuestionsRouter from "./support-questions";
import pilotRouter from "./pilot";
import importsRouter from "./imports";
import billingRouter, { billingWebhookRouter } from "./billing";
import businessSetupRouter from "./business-setup";
import voiceRouter, { phoneRouter } from "./voice";
import { adminOnly } from "../lib/adminAuth";

const router: IRouter = Router();

// ── Public routes (no session required) ──────────────────────────────────────
// Health check and auth endpoints are always accessible.
// Widget endpoints (widget.js, widget/config, widget/chat) are public by design
// so they can be loaded from any third-party website.
// Email inbound webhook (/email-threads/inbound) is public so Resend can POST to it;
// it is protected by svix webhook signature verification instead of the session cookie.
// Support questions (/support-questions) is public so landing-page visitors can submit.
router.use(healthRouter);
router.use(authRouter);
router.use(widgetRouter);
router.use(emailInboundRouter);
router.use(supportQuestionsRouter);
router.use(phoneRouter);
router.use(billingWebhookRouter);
router.use(publicQuoteRouter);

// ── Dashboard routes ──────────────────────────────────────────────────────────
router.use(adminOnly);
router.use(companyRouter);
router.use(assistantsRouter);
router.use(contactsRouter);
router.use(jobsRouter);
router.use(callsRouter);
router.use(quotesRouter);
router.use(quoteSharingRouter);
router.use(invoicesRouter);
router.use(certificatesRouter);
router.use(dashboardRouter);
router.use(emailThreadsRouter);
router.use(integrationsRouter);
router.use(marketingRouter);
router.use(tasksRouter);
router.use(pilotRouter);
router.use(importsRouter);
router.use(billingRouter);
router.use(businessSetupRouter);
router.use(voiceRouter);

export default router;
