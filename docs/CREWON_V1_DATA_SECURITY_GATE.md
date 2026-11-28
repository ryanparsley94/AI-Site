# CREWON V1 — customer data security gate

**Not cleared for real customer imports or multi-business use.** This checklist is not a compliance certification. Use synthetic records and an isolated staging database only.

## Current limits

- Login is one shared administrator password, not individual identities or roles.
- Contact CRUD/import still resolves a business by selecting the first company. Other business APIs are not yet consistently scoped by authenticated company membership.
- The import endpoint now rejects a database with more than one company. A global single-company gate also blocks authenticated business routes if a second company exists. These are fail-closed pilot guards, not tenant isolation.
- Real provider connections, backup/restore, production authorization and phone/mobile flows have not been validated by this change.

## Before real Parsley customer data

1. Confirm an isolated, private Parsley pilot database with synthetic data and a demonstrated backup restore.
2. Implement individual sign-in, company membership and role checks; do not make ownership depend on the first company or first registrant.
3. Scope every CRM, job, quote, invoice, certificate, site, attachment, export, background task and AI action to the authenticated user's company.
4. Add two-company authorization tests for list, detail-by-ID, writes, import, export and cross-linked records. Company A must not access company B by guessing IDs.
5. Test the Tradify import with synthetic files: mobile/desktop picker, headers, preview, repeat import, customer/site matching, blank values, malformed rows and multi-company denial.
6. Verify lawful processing, privacy/retention, recording/transcription consent, provider agreements and least-privilege access before any real customer work.

Do not import real customer CSVs, publish this work or claim tenant security until the database-backed cross-company tests and review pass. Keep existing Twilio/OpenAI calls unchanged; voice work remains last in the V1 sequence.
