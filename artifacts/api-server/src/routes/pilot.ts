import { Router } from "express";
import { GetPilotReadinessResponse } from "@workspace/api-zod";

const router = Router();
router.get("/pilot/readiness", (_req, res) => {
  const receivingConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET);
  const sendingConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  const twilioConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.VOICE_PUBLIC_BASE_URL
  );
  const realtimeConfigured = Boolean(
    process.env.OPENAI_API_KEY &&
    process.env.VOICE_REALTIME_ENABLED === "true"
  );
  const phoneConfigured = twilioConfigured && realtimeConfigured;
  // These are verification gates, not feature toggles. Existing manual/demo records
  // cannot prove a real phone call, delivered message or correctly approved booking.
  // Do not promote a gate merely because a credential exists.
  res.json(GetPilotReadinessResponse.parse({
    pilotName: "Parsley Electrical",
    timezone: "Europe/London",
    live: false,
    checks: [
      { id: "business", title: "Reviewed business & receptionist setup", status: "not_verified",
        detail: "Confirm the Parsley profile, website knowledge, receptionist name, greeting and instructions before use.", path: "/assistants" },
      { id: "call", title: "Real incoming Realtime call", status: phoneConfigured ? "not_verified" : "blocked",
        detail: phoneConfigured
          ? "Twilio and OpenAI Realtime are configured, but credentials do not prove call quality. Verify a real mobile call, natural turn-taking, barge-in, transcript and CRM capture."
          : "Configure Twilio, the public voice URL and OpenAI Realtime. The browser voice assistant and demo call logs do not count.", path: "/calls" },
      { id: "email", title: "Real incoming email & approved threaded reply", status: receivingConfigured ? "not_verified" : "blocked",
        detail: receivingConfigured ? "Credentials alone are not proof. Verify a real inbound message, contact match and approved reply."
          : "Connect the business mailbox or configure a verified receiving address and signed inbound events.", path: "/email-inbox" },
      { id: "confirmation", title: "Actual owner & customer notification", status: sendingConfigured ? "not_verified" : "blocked",
        detail: "Require provider receipts and visible failure/retry states. A draft or “Mark sent” action is not delivery evidence.", path: "/email-inbox" },
      { id: "crm", title: "Correct customer & enquiry linking", status: "not_verified",
        detail: "Verify repeat calls and emails link to one customer without changing existing customer details.", path: "/contacts" },
      { id: "booking", title: "Availability checked & booking approved", status: "not_verified",
        detail: "Verify a genuinely available UK-time slot and owner-approved booking. Never promise immediate emergency attendance.", path: "/jobs" },
      { id: "resilience", title: "Failures, hang-ups & duplicate events", status: "not_verified",
        detail: "Prove partial-message retention, missing-field follow-up, webhook deduplication and notification failure/retry.", path: "/calls" },
    ],
    missingSetup: [
      ...(!twilioConfigured ? ["Add the Twilio account, auth token, public voice URL and UK inbound number."] : []),
      ...(!realtimeConfigured ? ["Add OPENAI_API_KEY and enable VOICE_REALTIME_ENABLED for the pilot."] : []),
      ...(!receivingConfigured ? ["Configure the signed inbound email webhook."] : []),
      ...(!sendingConfigured ? ["Configure the verified owner/customer notification sender."] : []),
      "Review Parsley Electrical receptionist knowledge, greeting and selected voice.",
      "Run and record real call, email, confirmation, CRM and booking checks before marking the pilot live.",
    ],
  }));
});
export default router;
