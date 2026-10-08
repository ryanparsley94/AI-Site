# CREWON V1 — Parsley Electrical pilot

The release gate is one **real** caller becoming a reviewable enquiry and reaching the owner. The phone flow takes a full message and never transfers a call. Email replies require approval in the pilot.

## Reconciled Replit workspace

Both voice features are retained: signed public telephone callbacks at `/api/voice/incoming`, `/api/voice/answer` and `/api/voice/status`, and authenticated hands-free contractor commands at `/api/voice/transcribe` and `/api/voice/command`. Telephone signature middleware must not intercept contractor commands or unrelated dashboard routes.

Dashboard APIs now require the existing admin session. Web and mobile use the existing dashboard password; no customer records or stored contractor branding are replaced by setup defaults.

Phone and email remain **unverified, not live**. Recorded counters can include tests; the legacy notification state `sent` means the provider accepted the request, not that a recipient received it. Real Twilio and Resend acceptance/delivery checks remain required.

## Configure

In Replit Secrets, set `SESSION_SECRET` (dashboard password/session key), `DATABASE_URL`, `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_PHONE_NUMBER`, `TWILIO_SMS_FROM`, `VOICE_PUBLIC_BASE_URL` (the exact public HTTPS origin), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESEND_WEBHOOK_SECRET`. Do not put their values in the repository.

Set the Twilio number's **incoming voice webhook** to `https://<your-public-origin>/api/voice/incoming` with HTTP POST. Set its **call status callback** to `/api/voice/status` with HTTP POST and include `completed`. The app uses signed webhooks; a missing token or mismatched public origin rejects calls. The call number can be a temporary number or receive a divert from the business number. Do not divert customer calls until the test number is verified.

Set up Resend inbound receiving and point its signed `email.received` webhook at `/api/email-threads/inbound`. Configure a verified sending domain/address. In Email Inbox, leave **Auto-send replies** off for this pilot; approve each draft after checking it.

Set the business profile to Parsley Electrical with Ryan's correct notification address and UK time zone. Review the receptionist greeting and knowledge before calls. The V1 readiness panel on the dashboard separates configuration from observed real activity.

## Pilot acceptance

1. Call the test number as a new customer. Give a name, callback number, work, address/postcode, urgency, and availability. Check one call and one linked contact, the saved answers, owner email acceptance, and caller SMS acceptance.
2. Call again with an urgent electrical safety issue. Check the urgent flag and summary, and that no immediate attendance or transfer was promised.
3. Hang up early. Check that the status callback finalises a partial enquiry instead of discarding it.
4. Repeat a signed webhook delivery. Check that the same Twilio CallSid produces one call and no duplicate owner email.
5. Send a real customer email. Check one inbox entry, correct contact matching, the original body, and a pending AI draft. Approve a checked reply; confirm the provider accepted it. Retry/failure states must remain visible.

The first live result has not been verified by these code changes. The dashboard must continue to show setup/testing until the real call and email checks pass. Quotes, payments, procurement, and other agents do not gate this pilot.
