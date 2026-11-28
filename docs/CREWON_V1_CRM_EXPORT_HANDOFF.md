# CREWON V1 — GitHub-first CRM hardening + customer backup

**Scope:** first office-workflow release slice for the private Parsley Electrical pilot. Based on the Tradify importer work in GitHub PR #9, not the live website. This branch contains PR #9 plus this follow-up. No ElevenLabs / Twilio changes.

## Implemented in GitHub (not yet verified in Replit)

1. Customer CSV importer from PR #9: actual file picker action, preview gate, required Tradify headers, sample preview, cautious duplicate matching, and importer fail-closed on multiple companies.
2. Customer CRM route guard: block every /api/contacts operation if there are zero or more than one companies. The existing admin session **does not identify a business**, so it is unsafe to select the first company when multiple exist.
3. Customer update explicitly reassigns the existing authorised companyId and does not trust client-controlled company identity.
4. Contact enrichment scopes linked jobs by company ID, not merely contact ID. Email threads do not currently have a company ID; the linked contact ID remains globally unique. A future multi-tenant migration must address the email thread schema too.
5. Protected, explicit CSV backup endpoints:
   - GET /api/contacts/export/customers.csv
   - GET /api/contacts/export/sites.csv
   Both require the dashboard session via the API router and the single-company guard. Exports have no-store headers, stable attachments, spreadsheet-formula defanging, CSV quoting and a 10,000-record safety cap.
6. UI export links on Import from Tradify: **Download customers** and **Download job sites**, both with 44px+ targets and sensitive-data warning.
7. Tests: browser download checks plus actual unit tests of the CSV quoting/formula protections; previous PR #9 adds importer browser tests.

## Security caveat — launch blocker

This is an **interim private pilot control**, not multi-business security. The existing codebase has one shared dashboard password and many other routes select the first company. Do **not** use CREWON for multiple paying businesses or import actual Parsley Electrical customers until identity-bound per-business access, authorisation, protected backups, retention rules and privacy compliance have been independently checked. The export button can download sensitive details to the user's device and must be accessible only to authorised staff in production. Exports are **not full database backups**.

## Replit tasks, after the current update completes

1. Protect Replit's latest working-copy changes. Review PR #9 and this stacked follow-up; integrate carefully without resetting or replacing local work. Keep V2 marketplace out and voice last.
2. Run `pnpm --filter @workspace/api-server typecheck`, `pnpm --filter @workspace/api-server build`, `pnpm --filter @workspace/buildai typecheck`, `pnpm --filter @workspace/buildai build`.
3. Run `pnpm --filter @workspace/api-server test:crm-csv` and Playwright browser tests `tradify-import.spec.ts`, `crm-backup.spec.ts`, plus existing CRM/mobile regressions.
4. Test authenticated, unauthenticated and multi-company CRM reads/writes and exports against a temporary staging database with synthetic customer records. Two companies must reject CRM requests for this prototype and must never expose each other's data. Check response codes and error messages.
5. Download both CSVs on iPhone/Safari and desktop, open in spreadsheet software, and verify commas, embedded quotes, multiline notes, malicious formulas, phone numbers, empty fields and non-ASCII customer names.
6. Confirm customer import, re-import, customer site linkage, CRM contact display, and CSV backup with **synthetic data only**. Confirm that no API key, customer CSV or signed session is logged.
7. Update the GitHub lockfile only if necessary; report all passes and failures, especially UI test assumptions and deploy differences. **Do not publish automatically.**

## Next development, before the Parsley pilot

- Individual user accounts and company-bound roles (owner/office/engineer), MFA and revocable sessions.
- Tenant-isolated access controls throughout quotes, jobs, invoices, certificates, email threads, attachments, integrations and background workers, with two-business integration tests.
- Quote creation/AI description editing, cost/labour/material/UK VAT calculations, PDF/email customer approval, job conversion, certificates and invoices/payment workflow.
- Data backups/restores tested, real email delivery verified, migration dry run and security review.
- **Voice connection is the final V1 step** after the office system works.
