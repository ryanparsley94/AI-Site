import { Router } from "express";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db, companiesTable } from "@workspace/db";
import { emailNotificationReady, smsNotificationReady } from "../lib/notification-readiness";

const router = Router();

async function getCompany() {
  const [company] = await db.select().from(companiesTable).limit(1);
  return company;
}

router.get("/notifications/settings", async (_req, res): Promise<void> => {
  const company = await getCompany();
  if (!company) { res.status(404).json({ error: "Company not found" }); return; }
  const [emailReady, smsReady] = await Promise.all([emailNotificationReady(), smsNotificationReady()]);
  res.json({
    destination: company.voiceNotificationEmail ?? company.email ?? "",
    internalOwnerEmail: company.email ?? "",
    ownerEmailEnabled: company.voiceOwnerEmailEnabled,
    callerSmsEnabled: company.voiceCallerSmsEnabled,
    emailReady,
    smsReady,
    emailSenderConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    smsSenderConfigured: Boolean(process.env.TWILIO_SMS_FROM),
  });
});

router.patch("/notifications/settings", async (req, res): Promise<void> => {
  const { destination, ownerEmailEnabled, callerSmsEnabled } = req.body ?? {};
  if (typeof destination !== "string" || (destination && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination.trim())) ||
      typeof ownerEmailEnabled !== "boolean" || typeof callerSmsEnabled !== "boolean") {
    res.status(400).json({ error: "Enter a valid owner email and choose both notification settings." }); return;
  }
  const [emailReady, smsReady] = await Promise.all([emailNotificationReady(), smsNotificationReady()]);
  if (ownerEmailEnabled && !destination.trim()) { res.status(400).json({ error: "Enter an owner email destination before enabling automatic email." }); return; }
  if (ownerEmailEnabled && !emailReady) { res.status(409).json({ error: "Owner email requires a verified Resend sender and API key." }); return; }
  if (callerSmsEnabled && !smsReady) { res.status(409).json({ error: "Caller SMS requires a Twilio sender verified for SMS." }); return; }
  const company = await getCompany();
  if (!company) { res.status(404).json({ error: "Company not found" }); return; }
  await db.update(companiesTable).set({
    voiceNotificationEmail: destination.trim() || null,
    voiceOwnerEmailEnabled: ownerEmailEnabled,
    voiceCallerSmsEnabled: callerSmsEnabled,
  }).where(eq(companiesTable.id, company.id));
  res.json({ saved: true, destination: destination.trim(), ownerEmailEnabled, callerSmsEnabled, emailReady, smsReady });
});

router.post("/notifications/test-owner-email", async (req, res): Promise<void> => {
  if (req.body?.confirmed !== true) { res.status(400).json({ error: "Explicit confirmation is required." }); return; }
  const company = await getCompany();
  const recipient = company?.email;
  if (!company || !recipient || (company.voiceNotificationEmail && company.voiceNotificationEmail !== recipient)) {
    res.status(409).json({ error: "Test email is restricted to the existing company owner email destination." }); return;
  }
  if (!await emailNotificationReady()) { res.status(409).json({ error: "Email is not ready: configure a verified Resend sender and API key." }); return; }
  const key = process.env.RESEND_API_KEY!;
  const from = process.env.RESEND_FROM_EMAIL!;
  const result = await new Resend(key).emails.send({
    from: `CREWON <${from}>`, to: [recipient], subject: "CREWON notification test",
    text: "This is a test of the internal owner notification destination. No customer was contacted.",
  }, { idempotencyKey: `crewon-notification-test-${company.id}` });
  if (result.error) { res.status(502).json({ error: "Resend did not accept the test email." }); return; }
  res.json({ accepted: true, message: "Test email accepted by Resend; delivery is not yet confirmed." });
});

export default router;
