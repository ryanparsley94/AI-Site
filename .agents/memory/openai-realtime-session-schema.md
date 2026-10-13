---
name: OpenAI Realtime session schema
description: A Realtime client-secrets request rejected a function tool's strict field; safe upstream diagnostics made the specific schema mismatch visible.
---

Realtime `client_secrets` does not accept `strict` on the tested function-tool definition; OpenAI returned HTTP 400 with `invalid_request_error`, `unknown_parameter`, naming `session.tools[1].strict`.

**Why:** The editor and public browser demo both failed before WebRTC negotiation, while a credential check without that field succeeded for every offered Realtime voice.

**How to apply:** When Realtime session creation fails, preserve only sanitized upstream type/code/parameter/message and request ID. Do not recommend key rotation for a 400 schema rejection; compare session and SDP model settings separately.
