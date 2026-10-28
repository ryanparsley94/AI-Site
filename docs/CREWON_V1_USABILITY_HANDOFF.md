# CREWON V1 — usability sprint handoff

## Source
- Branch: `chester/crewon-v1-task-navigation-20261028`
- Base: `replit-agent` (the active default branch, which is ahead of the older `crewon-v1-phase1` branch).
- Do not reset, overwrite or cherry-pick the older Phase 1 branch over current Replit work.

## Product direction
CREWON is a full AI trades office, not a standalone AI receptionist. Retain Phase 1 call handling, CRM, diary, quotes, invoices, certificates, business onboarding, email, demo work and future integrations.

## UX changes included
1. **Tasks category-first home**: Four large, touch-friendly buttons for Quotes, Invoices, Certificates and General To-do. Counts and overdue indicators are shown on each tile.
2. **One task list at a time**: Selecting a tile opens only that category, with a clear Back to all categories action.
3. **Task controls kept intact**: Existing task API, status, priority, due-date/overdue, AI-generation, dismissal and deletion behavior remain. Invoice tasks do **not** change invoice payment status.
4. **Focused search**: Search applies only to the open task category.
5. **Navigation targets**: More generous sidebar, phone bottom-navigation and public-site call-to-action tap targets; Tasks is now available directly in mobile quick navigation (Sales remains in the full sidebar).
6. **Accessibility**: Buttons are keyboard-operable, visibly focusable and large enough for site use on mobile.

## Important limits
- Current category detection recognises task-title keywords, not a stored task category. The task list has not been given a new category column or any data migration.
- This is a UX and navigation improvement; it is **not** evidence of completed V1 telephony, live onboarding or multi-tenant security readiness.
- Existing running Replit work is authoritative for provider secrets, deployment and migration status. Do not publish or solicit paying tenants until all release gates pass.

## Replit validation
1. Synchronise this branch into a clean review build without discarding the active Replit Agent working tree.
2. Run `pnpm install`, `pnpm run typecheck`, and `pnpm run build`.
3. Run the Playwright tests for `tasks-overdue.spec.ts`, `sidebar-task-count.spec.ts`, `mobile-usability.spec.ts`, plus any existing voice and quote regression tests.
4. Verify desktop (1280px), tablet (768px) and mobile (390px and 320px): tiles display without horizontal overflow; only one category list opens; Back works; pending counts update after completing a task; completed state and overdue badge remain correct; mobile navigation exposes Tasks; the marketing buttons are tappable.
5. Verify with an actual logged-in pilot session, not only mocked API responses.
6. Fix failures in the branch and report verifiable test/build output before merging; keep production unpublished.

## Next V1 development after UI validation
- Voice quality/live Twilio test and the three honest demo modes (recorded conversation, browser conversation and consent-based outbound callback), without presenting a simulated recording as a live call.
- Pilot enquiry -> CRM -> schedule -> approved follow-up acceptance in Parsley Electrical.
- Workspace authentication, tenant-scoped integration and billing access, and automated cross-tenant isolation tests before public subscriptions.
