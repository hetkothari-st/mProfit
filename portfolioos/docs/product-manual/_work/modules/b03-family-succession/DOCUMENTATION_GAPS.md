# Documentation Gaps — Family, Succession, Will Maker (B03)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Family, Succession, Will Maker

## Verification limitations
- UI not visually verified: this run was code-only. Labels, messages and layout come from source; the tree drawing, charts and responsive layouts were not seen.
- Emails (family invitations, hand-overs, Succession reminders and codes) depend on the server's mail configuration and were not sent.
- Razorpay seat payments need live keys and were not exercised.
- Row-level-security effects were reasoned from migrations and service code, not run against a database.

## Unverified claims
| ID | Item | What is unknown | Why it couldn't be verified | Suggested owner action |
|---|---|---|---|---|
<!-- BEGIN UNVERIFIED -->
| F-FAM-003 | Seat line for contributors and viewers | `listMyFamilies` calls `seatUsage` in the caller's own security context; the FamilyMember policy shows a non-owner only their own row, so a contributor/viewer probably sees "1 of 3 seats used — 1 member" and no open invitations | Needs a database run with RLS as a non-owner | Run `GET /api/families` as a contributor; if confirmed, compute seats under `runAsSystem` after the membership check (`packages/api/src/services/family/family.service.ts:103`, `packages/api/src/services/family/family.service.ts:771`, `packages/api/prisma/migrations/20260903090000_fix_familymember_policy_recursion/migration.sql:63`) |
| F-WILL-006 | "From your family on EveryPaisa" quick-pick for non-owners | `listWillPeopleSuggestions` reads `FamilyMember` rows of other users without elevated privileges; under the FamilyMember policy a contributor/viewer sees only their own row, so the list is probably empty for them (works for owners) | Needs a database run with RLS | Test as a contributor; if confirmed, read the roster under a bounded system context (`packages/api/src/services/will/will.service.ts:211`) |
| F-SUCC-006 | Production health of the Succession jobs | Whether the daily tick, outbox retries and emails run and deliver in production | Runtime only | Check job logs (`[legacy.cron]`) and outbox rows with attempts ≥ 5 |
<!-- END UNVERIFIED -->

## Implementation ambiguities and possible defects
| ID | Observation | Evidence (path:line) | Question |
|---|---|---|---|
<!-- BEGIN AMBIGUITIES -->
| F-FAM-014 | Defect: the visibility matrix tells owners "Empty = no restriction" and "Leave both lists empty to give a contributor or viewer full visibility", and new invitations default to empty lists; the server treats an empty list as deny-all, so a member invited with defaults sees none of the other members' data | `apps/web/src/pages/family/FamilyPage.tsx:1410`, `apps/web/src/pages/family/FamilyPage.tsx:1516`, `apps/web/src/pages/family/FamilyPage.tsx:1808`, `apps/web/src/pages/family/FamilyPage.tsx:1897`, `apps/web/src/pages/family/FamilyPage.tsx:1945`, `packages/api/src/services/family/familyScope.service.ts:208` | Fix the UI copy (and default to all), or change the server semantics? |
| F-FAM-004 | Confirmed (brief item): the family dashboard endpoints require the caller's own FAMILY plan; a FREE/PLUS member of someone else's family gets "This feature requires the FAMILY plan or higher". The UI wraps the Overview tab in a FAMILY lock card, so such a member sees "Family dashboard is locked" for a family they belong to | `packages/api/src/routes/families.routes.ts:463`, `packages/api/src/middleware/requirePlan.ts:18`, `apps/web/src/pages/family/FamilyPage.tsx:360` | Should membership in a FAMILY-plan family unlock the dashboard? |
| F-FAM-021 | Defect: the member page has no plan lock; for a FREE/PLUS member the 403 shows as "Couldn't load this member. You may no longer have permission to see them." | `packages/api/src/routes/families.routes.ts:487`, `apps/web/src/pages/family/FamilyMemberPage.tsx:222` | Show the plan lock card instead? |
| F-FAM-022 | Confirmed (brief item): schema comment says CONTRIBUTOR/VIEWER "never see another member's personal data (rule A locked in Phase 3)"; the code makes every active member readable to every role, filtered by caps. The Shared portfolios empty state also still says "Contributors and viewers can only see own personal + family-shared data (rule A)" and the page header says contributors/viewers see "own personal + family-shared" | `packages/api/prisma/schema.prisma:3752`, `packages/api/src/services/family/familyScope.service.ts:180`, `apps/web/src/pages/family/FamilyPage.tsx:126`, `apps/web/src/pages/family/FamilyPage.tsx:451` | Update the schema comment and UI copy to the current rule |
| F-FAM-023 | Defect: every sidebar family row links to `/family`, and `/family` always selects the first family; with two families, clicking the second family's name opens the first | `apps/web/src/components/layout/FamilyNavTree.tsx:180`, `apps/web/src/pages/family/FamilyPage.tsx:91` | Add the family id to the URL? |
| F-FAM-015 | Mismatch: the API lets a non-owner keeper hand a managed member to another keeper, but the **Edit** button that opens that control is owner-only; the hand-over email send step also requires an owner while the claim invitation itself allows the keeper | `packages/api/src/services/family/family.service.ts:1295`, `apps/web/src/components/family/FamilyTreeBoard.tsx:500`, `packages/api/src/services/family/familyClaim.service.ts:81`, `packages/api/src/services/family/familyInviteEmail.service.ts:119` | Expose keeper actions to keepers? |
| F-FAM-024 | Minor: the web client's account-route list omits `/api/legacy`, so the Succession page sends `X-Act-As` while managing and shows the server's refusal instead of a friendly guard (Will Maker has one) | `apps/web/src/stores/actingAs.store.ts:47`, `packages/api/src/services/family/managedProfile.service.ts:49`, `apps/web/src/pages/legacy/LegacyPage.tsx:80` | Add a WillGate-style guard to Succession? |
| F-FAM-019 | Minor: after accepting an invitation the app navigates to **Settings**, not to the family | `apps/web/src/pages/family/AcceptInvitationPage.tsx:47` | Intended? |
| F-SUCC-004 | Minor: removing the last nominee of a running plan is allowed; the plan keeps counting with nobody to notify | `packages/api/src/services/legacy/plan.service.ts:210` | Block it or turn the plan off? |
| S-SUCC-010 | Nominee **Priority** only orders lists and emails; no behaviour depends on it | `packages/api/src/services/legacy/runner.service.ts:22` | Is a priority-based release planned? |
| F-SUCC-008 | Investments shown to nominees include holdings in family-shared portfolios the owner created | `packages/api/src/services/legacy/view.service.ts:47` | Should shared family pots be excluded? |
<!-- END AMBIGUITIES -->

## Hidden, partial, backend-only, deprecated features
| ID | Feature | Status | Evidence |
|---|---|---|---|
<!-- BEGIN HIDDEN -->
| F-FAM-025 | Rename / re-describe a family (`PATCH /api/families/:familyId`) | Backend-only — client method exists, no caller | `packages/api/src/routes/families.routes.ts:187`, `apps/web/src/api/family/families.api.ts:170` |
| F-FAM-026 | Leave a family (`POST /api/families/:familyId/leave`) | Backend-only — no caller; removing yourself in the UI is refused with "Use \"leave family\" to revoke your own access." | `packages/api/src/routes/families.routes.ts:228`, `apps/web/src/api/family/families.api.ts:204` |
| F-FAM-027 | Unshare a family portfolio (`POST …/portfolios/:portfolioId/unshare`) | Backend-only — no caller | `packages/api/src/routes/families.routes.ts:402`, `apps/web/src/api/family/families.api.ts:327` |
<!-- END HIDDEN -->

## UI / API permission mismatches
| ID | UI behavior | API behavior | Evidence |
|---|---|---|---|
<!-- BEGIN MISMATCHES -->
| F-FAM-014 | "Empty = no restriction" | Empty = deny-all | `apps/web/src/pages/family/FamilyPage.tsx:1897`, `packages/api/src/services/family/familyScope.service.ts:208` |
| F-FAM-015 | Keeper change only via owner-only **Edit** | Current keeper allowed | `apps/web/src/components/family/FamilyTreeBoard.tsx:500`, `packages/api/src/services/family/family.service.ts:1295` |
| F-FAM-021 | Member page not plan-locked | Requires caller's FAMILY plan | `apps/web/src/pages/family/FamilyMemberPage.tsx:222`, `packages/api/src/routes/families.routes.ts:487` |
<!-- END MISMATCHES -->

## Choices made without asking
| Choice | Alternatives | Why |
|---|---|---|
<!-- BEGIN CHOICES -->
| Module prefixes FAM / SUCC / WILL with workflow IDs W-FAM-, W-SUCC-, W-WILL- | Single W- sequence | Matches the brief's prefixes and keeps IDs mergeable |
| Family dashboard split into four features (wealth, attention, goals, protection) | One feature | Each card has its own endpoint, rules and empty states |
| Header **Switch view**, user-menu managed accounts and managing banner documented here (F-FAM-022, F-FAM-024) | Leave to B10 | Assigned to B03 by the wave-0 brief |
| Family overlay roles marked "Same as base plan" for Succession and Will Maker | Separate cells | Family role does not change these features; only managing does |
| Seat-line and will-suggestion RLS issues logged as unverified (not confirmed defects) | Confirmed defects | Reasoned from the FamilyMember policy without a database run |
<!-- END CHOICES -->

## Audit allow-list
| Literal | Where it appears in source | Why it's not real data |
|---|---|---|
<!-- BEGIN ALLOWLIST -->
<!-- END ALLOWLIST -->
