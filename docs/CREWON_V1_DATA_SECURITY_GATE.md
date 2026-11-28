# CREWON V1 — customer data security release gate

**Status: NOT cleared for live customer imports or multi-business SaaS use.** This is an engineering acceptance checklist, not an assertion of compliance. Preserve existing live/working Replit changes; validate on a staging database containing only fabricated customers.

## Current confirmed risks in GitHub replit-agent

- Authentication uses one shared dashboard password (`SESSION_SECRET`) and a signed seven-day administrator cookie. It is not a per-user, per-business identity and has no staff roles or MFA.
- Multiple API handlers choose `SELECT id FROM companies ORDER BY id LIMIT 1` (and company settings seed/retrieve the first company). Checking a session therefore does **not** establish which business owns a request. Records with company IDs in tables do not alone provide tenant isolation.
- The contact detail enrichment queries jobs and threads using contact ID only, with no company restriction.
- The Tradify import previously selected the first business without verifying this was a single-company pilot. This PR rejects imports whenever more than one business exists, but **does not resolve the broader CRM tenancy architecture**.
- Frontend import previously nested a file action button inside the file-input label and had no tested, explicit click-to-picker handler. This PR adds the handler and browser tests.
- The current environment, backups, production authorisation, monitoring, real data migration, and browser tests have **not** been independently verified by this branch.

## Before importing real Parsley Electrical customer records

1. Establish a dedicated, restricted **single-business** Parsley Electrical pilot environment. Confirm only a single company exists in that database. Keep this pilot private and do not allow public self-signup or shared credentials.
2. Replace shared admin password with individual user logins, strong password hashing, MFA for admins, session revocation, login rate limits and role-based authorisation; owner, office and engineer access should be separate.
3. Scope every CRM, job, invoice, quote, certificate, site and attachment API read/write to the company associated with the authenticated user. The company ID must come from server-side authorisation, never arbitrary request parameters or the first database row. Apply authorisation for record-by-ID queries and all exports, background jobs, notifications and AI tools.
4. Create automated two-business tests: business A must never read, edit, export, import into or refer to business B's contacts or jobs, even by guessing numeric IDs or using cross-business links. Include unauthenticated, lower-role and CSRF tests.
5. Verify HTTPS, encryption at rest for production databases and backups, secret management in Replit, least-privilege database credentials, retention/deletion rules, admin audit trails, and off-site backups with a demonstrated restore.
6. Conduct dependency vulnerability and penetration testing, and document vulnerability handling and incident response. Make a UK GDPR privacy notice, data-processing agreements with hosting/AI providers, customer access/deletion and a breach notification procedure. Consider supplier and cross-border transfer arrangements.
7. Test the CSV import with **synthetic** customers first. Require usable file-picker on phone and desktop; reject invalid headers; show mapped fields and row count before write; verify no duplicate or incorrect merge; verify correct job sites and contacts after importing; and preserve existing data. Real CSVs must stay off GitHub, chat, screenshots, and test fixtures.
8. Do a private Parsley Electrical dry run: customer -> quotation (line items, VAT, AI description review) -> customer approval -> job -> schedule -> certificate -> invoice -> payment -> export/backup. Confirm audit and permissions before parallel-running any real customers.

## Scope of this PR

This PR addresses the **Tradify import picker** and a **temporary single-company import guard** only, with frontend Playwright coverage for successful preview and failure feedback. This is **not** proof of safe multi-tenant isolation, a complete migration, or a passed test/build. Do not merge into a live service until build, tests and database migration checks pass. Voice integration remains deferred until core office features are secure and tested.

## Replit acceptance

- Preserve the latest local Replit worktree and avoid blindly checking out this branch over it; integrate only the focused changes after checking conflicts.
- Run frontend/API typechecking and build; `playwright test tests/tradify-import.spec.ts` with a working, authenticated preview.
- Run 3 importer test cases on staging DB: one valid Tradify export (import then re-import), one malformed CSV, and multiple businesses (import must return an error without writes).
- Test the file picker by physically tapping Choose file on iPhone/iPad and desktop.
- Do not publish until authorisation and tenancy architecture is separately reviewed for the V1 production use case. Do not upload any real Parsley customer CSV until that security gate passes.
