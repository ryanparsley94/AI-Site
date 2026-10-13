---
name: Outbound delivery safety
description: Distinguish provider acceptance from delivery and avoid duplicate messages after uncertain sends.
---

For customer messaging, a timeout or lost connection after a send request is an unconfirmed outcome, not proof of failure. Do not automatically resend or offer an unconditional retry unless rejection or non-delivery is confirmed.

**Why:** A provider can accept a message before the app loses its response. Twilio SMS requests do not provide the same send-idempotency protection as Resend. Blind retries can send duplicate customer messages.

**How to apply:** Apply this across customer SMS and email features, not just marketing. Preserve an unconfirmed state for provider reconciliation, guard concurrent send attempts durably, and distinguish queued/provider-accepted messages from confirmed delivery in user-facing claims.
