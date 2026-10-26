# User Roles and Permissions — Family, Succession, Will Maker (B03)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Family, Succession, Will Maker

Role definitions are global (see `_work/global/roles.md`); headings are repeated here for traceability.

## Roles
### Signed-out visitor <!-- R-VISITOR -->
### Free user <!-- R-FREE -->
### Plus subscriber <!-- R-PLUS -->
### Family subscriber <!-- R-FAMILY -->
### Pro/Advisor subscriber <!-- R-PRO -->
### Administrator <!-- R-ADMIN -->
### Family owner <!-- R-FAMOWNER -->
### Family contributor <!-- R-FAMCONTRIB -->
### Family viewer <!-- R-FAMVIEWER -->
### Managing a family member's account <!-- R-MANAGER -->
### Professional acting for a client <!-- R-PROF -->
### AI chatbot connection <!-- R-AICONN -->
### Succession nominee <!-- R-NOMINEE -->

## Permission matrix
| Page / feature / action | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- BEGIN MATRIX -->
| Open Family page, list families (F-FAM-001) | Denied (to /login) | Allowed | Allowed | Allowed | Allowed | Per own plan | Allowed | Allowed | Allowed | Allowed (runs as the manager) | n/a | Denied | Denied | `packages/api/src/routes/families.routes.ts:96` |
| Create a family (F-FAM-002) | Denied | Denied (lock card) | Denied (lock card) | Allowed | Allowed | Per own plan | Per own plan | Per own plan | Per own plan | Denied (account route) | n/a | Denied | Denied | `packages/api/src/routes/families.routes.ts:180` |
| Family dashboard Overview + member page (F-FAM-004–007, F-FAM-021) | Denied | Denied | Denied | Allowed (if member) | Allowed (if member) | Per own plan | Needs own FAMILY plan; uncapped | Needs own FAMILY plan; caps apply | Needs own FAMILY plan; caps apply | Denied (account route) | n/a | Denied | Denied | `packages/api/src/routes/families.routes.ts:463`, `packages/api/src/services/family/familyAggregate.service.ts:170` |
| View tree and members (F-FAM-008) | Denied | Members only | Members only | Members only | Members only | Per own plan | Allowed | Allowed | Allowed | Denied (account route) | n/a | Denied | Denied | `packages/api/src/services/family/family.service.ts:139` |
| Add/invite/edit/remove members, rearrange tree, cancel invitations, pay seats (F-FAM-008–017) | Denied | n/a | n/a | n/a | n/a | n/a | Allowed | Denied ("OWNER role required.") | Denied ("OWNER role required.") | Denied (account route) | n/a | Denied | Denied | `packages/api/src/services/family/familyScope.service.ts:310` |
| Change a managed member's keeper (F-FAM-015) | Denied | n/a | n/a | n/a | n/a | n/a | Allowed | Keeper only (API; no UI) | Keeper only (API; no UI) | Denied | n/a | Denied | Denied | `packages/api/src/services/family/family.service.ts:1295` |
| Create / share family portfolios (F-FAM-018) | Denied | n/a | n/a | n/a | n/a | n/a | Allowed | Allowed | Denied ("VIEWER cannot create family portfolios.") | Denied | n/a | Denied | Denied | `packages/api/src/services/family/family.service.ts:1650` |
| Accept invitation / claim profile (F-FAM-019, F-FAM-020) | Peek allowed; accept needs sign-in; claim allowed | Allowed (invited email) | Allowed | Allowed | Allowed | Allowed | n/a | n/a | n/a | Denied (account route) | n/a | Denied | n/a | `packages/api/src/routes/families.routes.ts:65`, `packages/api/src/services/family/family.service.ts:1400` |
| Switch view to a family (F-FAM-022) | Denied | Members | Members | Members | Members | Per own plan | Allowed | Allowed | Allowed | Cleared while managing | n/a | n/a | Denied | `packages/api/src/services/family/familyScope.service.ts:149` |
| Write another member's personal data in family view | Denied | Denied | Denied | Denied | Denied | Denied | Denied | Denied | Denied | Managed profile only | n/a | Denied | Denied | `packages/api/src/services/family/familyScope.service.ts:188` |
| Enter a managed account (F-FAM-024) | Denied | Keeper only | Keeper only | Keeper only | Keeper only | Keeper only | Keeper only | Keeper only | Keeper only | Already managing (can switch) | n/a | Denied | Denied | `packages/api/src/services/family/managedProfile.service.ts:76` |
| Succession: view page (F-SUCC-001) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Same as base plan | Same as base plan | Same as base plan | Denied ("Switch back to your own account to do this.") | n/a | Denied | Denied | `packages/api/src/routes/legacy.routes.ts:23`, `packages/api/src/services/family/managedProfile.service.ts:49` |
| Succession: configure, add/edit nominees, turn on (F-SUCC-002, F-SUCC-004) | Denied | Denied | Allowed + step-up | Allowed + step-up | Allowed + step-up | Per own plan | Same as base plan | Same as base plan | Same as base plan | Denied | n/a | Denied | Denied | `packages/api/src/routes/legacy.routes.ts:21`, `packages/api/src/controllers/legacy.controller.ts:23` |
| Succession: pause, resume, turn off, revoke, remove nominee | Denied | Allowed + step-up | Allowed + step-up | Allowed + step-up | Allowed + step-up | Per own plan | Same as base plan | Same as base plan | Same as base plan | Denied | n/a | Denied | Denied | `packages/api/src/routes/legacy.routes.ts:29` |
| Succession test mode (F-SUCC-003) | Denied | Denied | Denied | Denied | Denied | Allowed (with PLUS+) | n/a | n/a | n/a | Denied | n/a | Denied | Denied | `packages/api/src/services/legacy/plan.service.ts:93` |
| Succession email links (F-SUCC-007) | Allowed (link holder) | Allowed | Allowed | Allowed | Allowed | Allowed | n/a | n/a | n/a | n/a | n/a | n/a | Allowed (link holder) | `packages/api/src/routes/legacy.routes.ts:37` |
| Nominee view (F-SUCC-008) | Code + link only | Denied | Denied | Denied | Denied | Denied | n/a | n/a | n/a | n/a | n/a | Denied | Allowed (read-only) | `packages/api/src/middleware/legacySession.ts:10` |
| Will Maker: draft, generate, sign and store (F-WILL-001–012) | Denied | Denied (lock card) | Allowed | Allowed | Allowed | Per own plan | Same as base plan | Same as base plan | Same as base plan | Denied ("Will Maker works on your own account only…") | n/a | Denied | Denied | `packages/api/src/routes/will.routes.ts:51`, `packages/api/src/routes/will.routes.ts:15` |
| Will Maker: download own existing will documents (F-WILL-013) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Denied | n/a | Denied | Denied | `packages/api/src/routes/will.routes.ts:47` |
<!-- END MATRIX -->

Legend: Allowed · Denied · Conditional (see note). "Same as base plan" = the overlay changes nothing here. "n/a" = the role does not reach this feature.

## Notes and mismatches
<!-- BEGIN ROLE-NOTES -->
- Family roles are per family: one person can be Owner of one family and Viewer of another; the role that applies is the one for the family in view.
- The family dashboard and member page check the **caller's own** plan (FAMILY_SHARING), not the family creator's. A FREE or PLUS member of someone else's family can switch the app into family view (data routes honour it regardless of plan) but gets a lock card on the Overview tab and a generic error on member pages (`packages/api/src/routes/families.routes.ts:463`, `apps/web/src/pages/family/FamilyPage.tsx:360`, `apps/web/src/pages/family/FamilyMemberPage.tsx:222`).
- Schema comment says contributors and viewers "never see another member's personal data" (`packages/api/prisma/schema.prisma:3752`); the code makes every active member readable, filtered by caps (`packages/api/src/services/family/familyScope.service.ts:180`). Documentation follows the code.
- Visibility caps: the UI says an empty list means "no restriction"; the server treats it as deny-all (`apps/web/src/pages/family/FamilyPage.tsx:1897` vs `packages/api/src/services/family/familyScope.service.ts:208`).
- Changing a managed member's keeper: the API allows the current keeper even if not an owner (`packages/api/src/services/family/family.service.ts:1295`), but the **Edit** button that reaches the control is shown only to owners (`apps/web/src/components/family/FamilyTreeBoard.tsx:500`).
- The web client's account-route list omits `/api/legacy`, so while managing it still sends `X-Act-As` to Succession and the server refuses with "Switch back to your own account to do this." (`apps/web/src/stores/actingAs.store.ts:47` vs `packages/api/src/services/family/managedProfile.service.ts:49`).
- Managed members get role INVESTOR and the keeper's plan while being managed; they are never ADMIN (`packages/api/src/services/family/managedProfile.service.ts:108`).
- A Succession plan keeps running after the owner's plan lapses; a FREE owner keeps pause, resume, turn off, revoke and remove-nominee.
- R-PROF and R-AICONN do not reach these pages; the AI connector's "Will and succession" data area is documented by B06.
<!-- END ROLE-NOTES -->
