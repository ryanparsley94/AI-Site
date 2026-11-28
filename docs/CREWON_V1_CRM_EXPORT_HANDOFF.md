# CREWON V1 — CRM import and export slice

This change integrates the reviewed CRM work from stacked GitHub PR #9 and PR #11 into the newer Replit working copy without switching branches or replacing unrelated features.

## Included

- Tradify customer/site CSV picker, header checks, preview, cautious duplicate matching, blank-field preservation and multiple-company import denial.
- Authenticated single-company CRM guard for contact and site read/write routes.
- Customer and job-site CSV exports with safe quoting, spreadsheet formula protection, private/no-store headers and a 10,000-row cap.
- Tests for importer picker/preview/errors, export downloads and CSV serialization.

## Safety limits

This is still a shared-admin, single-company prototype—not identity-bound multi-tenant security. Jobs, quotes, invoices, certificates, integrations and other records still need company scoping and cross-company authorization tests. CSV downloads contain personal data and are not a full database backup. Do not import real Parsley records or publish this change until proper user identity/access controls, backup restore and security checks pass.

The staging database secret is not configured in this workspace. Tests that would write customer-shaped data to an unverified development or production database must remain unrun.
