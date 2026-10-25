# V1 post-call capture reliability

This focused patch is based on AI-Site `replit-agent` commit `c36fcdd`.
Integrate the patch into the current Replit workspace, preserving its newer
Control Centre, voice, demo and responsive-image changes. Do not replace the
workspace with this older branch snapshot. No database migration is required.

## Result

- Check the persisted session's business, call and assistant ownership before
  extracting caller details or writing customer records.
- Save transcript/duration in a short transaction before AI enrichment. Lock the
  session and call so a late finalisation retry cannot overwrite a completed call.
- Bound extraction to 15 seconds; validate the structured result before use.
  Provider errors and malformed results fall back to caller transcript text.
- Recheck ownership under the finalisation lock. Update only the existing
  business-owned call, without changing its ownership.
- Preserve the verified inbound number over an extracted callback. Withheld or
  invalid identifiers alone do not create a shared "anonymous" customer record.

## Local validation

- Eight focused tests in `test/realtime-finalise.test.ts` pass using a controlled
  database adapter and mocked provider responses. These cover mismatched routing,
  failed/malformed extraction, urgent enquiries, withheld numbers, completed
  retries, lock rechecks and rollback behavior. They are not live PostgreSQL
  concurrency tests or real-call acceptance tests.
- Workspace TypeScript project build, API typecheck and API production bundle pass.
- No calls placed, messages sent or deployments performed.

Run the API package's `test:realtime-finalise` script, API typecheck and build after
integration. Start the API as well as the web preview before reviewing the app.

## Remaining V1 release checks

1. Verify the current call path and natural British accent on an actual call.
   A British persona name or accent instruction does not prove the audio passes.
2. Against a disposable database, test two separate businesses, repeated and
   concurrent finalisation, provider failure, withheld numbers and interrupted calls.
   Confirm transcript, customer, follow-up task and booking remain correctly linked.
3. Audit phone/email/website enquiries into the lead inbox; test review, follow-up
   and confirmed scheduling. Keep draft approval and tenant isolation intact.

This patch is one V1 release-gate improvement. It does not establish that the
entire product, integrations, accent or deployed service are launch-ready.
