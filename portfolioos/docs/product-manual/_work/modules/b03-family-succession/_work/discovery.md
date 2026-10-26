# B03 discovery — Family, Succession, Will Maker

Source commit 9d9025c4 · code-only · scope: routes 6–11, 21, 22, 70, 76–78 of `_work/global/modules.md` plus family "Switch view" menu, "Accounts you manage" + managing banner + Back to my account, sidebar family tree.

## Modules
- **Family** (FAM): `/family`, `/family/members/:userId`, `/families/invitations/:token/accept`, `/family/claims/:token`; shell pieces: `FamilyScopeSwitcher`, `FamilyScopeBanner` (shown on Dashboard), `FamilyNavTree`, `ActingAsBanner`, header user menu managed-profile items, `NotWhileManaging`.
  - API: `/api/families/*` (`packages/api/src/routes/families.routes.ts`), `/api/managed-profiles/*`; services `family.service`, `familyScope.service`, `familyAggregate.service`, `familyClaim.service`, `familyInviteEmail.service`, `managedProfile.service`; middleware `authenticate` (X-Act-As).
- **Succession** (SUCC): `/legacy`, `/legacy/ok|ack|verify|access/:token`; API `/api/legacy`, `/api/legacy-public`, `/api/legacy-view`; job `legacyTransferJob` (daily 10:00 IST, outbox :20 hourly, per-minute test tick).
- **Will Maker** (WILL): `/will`, `/will/:id/:step`, `/will/:id/execute`; API `/api/will/*`; job `willReviewJob` (09:15 IST daily).

## Checklist
- [x] Routes and nav entries mapped
- [x] Controls inventoried per page (FamilyPage, FamilyTreeBoard, FamilyMemberPage, Accept/Claim pages, LegacyPage + dialogs, Legacy link/access pages, Will overview/wizard/steps/execute)
- [x] Backend guards traced (requireFeature, assertOwnerOf, rejectActAs, requireLegacyGrant, legacySession)
- [x] Jobs traced (legacy cron, will review cron)
- [x] Brief-specific verifications (family dashboard plan gate; schema comment vs code)

## Notable findings (see DOCUMENTATION_GAPS.md)
- Visibility caps: UI says "Empty = no restriction"; server treats empty as deny-all (`familyScope.service.ts:208`).
- Family dashboard needs caller's own FAMILY plan (`families.routes.ts:463`); UI locks Overview tab; member page shows a misleading generic error.
- Schema comment 3752 contradicts `getEffectiveScope`.
- Seat line / will suggestions likely wrong for non-owners because of FamilyMember RLS (inferred).
- No UI for rename family, leave family, unshare portfolio (backend-only).
- Sidebar family rows all go to `/family`, which always opens the first family.
