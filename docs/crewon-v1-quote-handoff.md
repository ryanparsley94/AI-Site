# CREWON V1 — secure quote-to-job handoff

Status: **draft / integration pending**. This branch is stacked **on top of PR #11**, which itself depends on **PR #9**. Do not merge this before those changes are integrated and validated.

## Why this slice exists

The current CREWON pilot uses a shared dashboard password and does **not** yet have authenticated, per-business tenant identities. CRM endpoints now fail closed when multiple companies are present. Until true per-user company isolation ships, the **private quote list, create/edit, duplicate, AI pricing, acceptance-link creation, job conversion, and invoice conversion** must have the same fail-closed restriction.

This branch adds that guard on the private quote and quote-sharing routers. Public client acceptance links intentionally remain token-based and are **not** blocked by the pilot guard; they reveal only public quote fields, without cost prices, supplier information, or internal markup.

**Not a production multi-tenant security solution.** Proper per-user accounts, authorisation, tenant-filtered quote/job/invoice records, and security review remain release blockers.

## New regression coverage

The acceptance integration test now covers:
- Client accepts a reviewed quote using its public revision-specific link.
- One scheduled job is created with the accepted amount, and retries return the same job.
- One invoice is generated with the accepted amount, and retries preserve its ID and number.
- The quote keeps its accepted state and recorded job relationship.

Existing tests also cover token invalidation, expiry, acceptance conflicts, locks, and keeping internal pricing out of public responses.

## Replit integration sequence

1. Finish the currently running Replit CRM import/export validation. **Do not interrupt it**.
2. Integrate PR #9, then PR #11, validate the private single-business CRM routes and ensure the Tradify CSV imports/exports work with fictional data.
3. Integrate this branch's changes without overwriting Replit's independent edits to the same files.
4. Run builds and typechecks; run `pnpm --filter @workspace/api-server test:quote-acceptance` against a dedicated **single-company disposable test database**. Do not point integration tests at production/customer data, because the test suite creates and deletes records.
5. Manually test a **fictional** customer -> reviewed quote -> share link -> acceptance -> schedule job -> create invoice; check no duplicate jobs or invoices on retry, and correct total, VAT, deposit, phone and diary time.
6. Check multi-company fail-closed behaviour in a disposable test environment: all private quote and CRM routes should reject access with >1 company. Never test that by adding a second business to a real customer database.
7. Keep the app unpublished. No real Parsley customer imports until individual account security and penetration/security checks are complete. Do not change receptionist/voice configuration.

## Follow-on development (separate branches)

- **Quote settings:** per-company labour rate and material markup settings (pilot reference: £50/hr and 15–20% markup, editable). Don't hardcode these globally or silently overwrite saved quote lines.
- **Quote workflow:** quote creation should retain CRM contact/site ownership and existing accepted amounts; approval before external messages.
- **Scheduling and invoicing:** one connected job record, edit-safe diary, approved invoice, payment tracking.
- **Later:** certification and integration tests, individual staff accounts, true multi-tenant isolation, receptionist/voice last. Lead marketplace stays V2.

## Release blockers

No SaaS or public launch while there is a shared admin password, arbitrary-company reads, missing tenant ownership on quotes/invoices, or unverified cross-company isolation. Tests in GitHub are proposed and need a successful Replit run before being counted as passing.
