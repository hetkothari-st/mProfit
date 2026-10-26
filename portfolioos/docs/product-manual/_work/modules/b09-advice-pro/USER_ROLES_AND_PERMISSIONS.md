# User Roles and Permissions — Advisor, Professional workspace, Split Expenses (B09)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Investment Advisor, Professional workspace, Split Expenses

Role definitions are global (see `_work/global/roles.md`); headings are repeated here for traceability. Gates in these modules: `/api/advisor` requires ADVICE_ENGINE (Plus) on the whole router (`packages/api/src/routes/advisor.routes.ts:27`); `/api/ca` requires two-factor sign-in for everything except the empty client list (`packages/api/src/routes/ca.routes.ts:73`), CA_WORKSPACE (Pro/Advisor) only for onboarding your own clients (`packages/api/src/routes/ca.routes.ts:87`), and a live grant per client (`packages/api/src/services/ca/caAccess.service.ts:132`); `/api/split` requires only sign-in plus group membership (`packages/api/src/routes/split.routes.ts:12`, `packages/api/src/services/split/groups.service.ts:34`).

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
<!-- BEGIN MATRIX -->
| Page / feature / action | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Advisor page, questionnaire, allocation, recommendations, override list (F-ADV-001–F-ADV-010) | Denied (to /login) | Denied (locked card; API 403) | Allowed | Allowed | Allowed | Per own plan | Same as base plan (own data only) | Same as base plan | Same as base plan | Allowed on managed person's data under manager's plan | n/a | Denied (no tool) | Denied | `packages/api/src/routes/advisor.routes.ts:27`, `apps/web/src/pages/advisor/AdvisorPage.tsx:43` |
| AI narration (F-ADV-009) | Denied | Denied | Allowed when operator enabled; monthly budget | Same as Plus | Same as Plus | Per own plan | Same as base plan | Same as base plan | Same as base plan | Manager's plan; budget of the managed person | n/a | Denied | Denied | `packages/api/src/services/advisor/advisorProse.service.ts:120` |
| Reorder override list, edit target weights, run history (F-ADV-011–F-ADV-013, API only) | Denied | Denied | Allowed (no UI) | Allowed (no UI) | Allowed (no UI) | Per own plan | Same as base plan | Same as base plan | Same as base plan | Allowed (no UI) | n/a | Denied | Denied | `packages/api/src/routes/advisor.routes.ts:58` |
| Client books sidebar entry and workspace (F-CA-001, F-CA-002, F-CA-007–F-CA-017) | Denied | Only with a grant + two-factor | Only with a grant + two-factor | Only with a grant + two-factor | Grant or own practice + two-factor | Per plan + two-factor | n/a | n/a | n/a | Denied (account route) | Allowed with two-factor | Denied | Denied | `packages/api/src/routes/ca.routes.ts:73`, `packages/api/src/services/ca/caAccess.service.ts:132` |
| Change a client's books / transactions / imports / FMV (F-CA-008–F-CA-014) | Denied | Only if the client granted that right | Same | Same | Same | Same | n/a | n/a | n/a | Denied | Conditional — per right; never delete transactions | Denied | Denied | `packages/api/src/services/ca/caAccess.service.ts:116`, `packages/api/src/routes/ca.routes.ts:131` |
| Client reports downloads (F-CA-015) | Denied | Denied (Plus gate on professional's plan) | Catalogue yes; accounting reports denied | Same as Plus | Allowed | Per own plan | n/a | n/a | n/a | Denied | Depends on the professional's own plan | Denied | Denied | `packages/api/src/routes/reports.routes.ts:85`, `packages/api/src/middleware/requirePlan.ts:16` |
| Invite a client / email the invitation (F-CA-004) | Denied | Denied | Denied | Denied | Allowed + two-factor | Per own plan + two-factor | n/a | n/a | n/a | Denied | Denied below Pro/Advisor | Denied | Denied | `packages/api/src/routes/ca.routes.ts:95` |
| Close an engagement (F-CA-003) | Denied | Allowed for own grants + two-factor | Same | Same | Same | Same | n/a | n/a | n/a | Denied | Allowed | Denied | Denied | `packages/api/src/services/ca/caAccess.service.ts:544` |
| Accept a practice's invitation (F-CA-005) | Denied (sign in first) | Allowed (invited email) | Allowed | Allowed | Allowed | Allowed | n/a | n/a | n/a | Denied (account route) | n/a | Denied | Denied | `packages/api/src/services/ca/caAccess.service.ts:496` |
| View / accept an account holder's invitation (F-CA-006) | View only | Accept with two-factor (invited email) | Same | Same | Same | Same | n/a | n/a | n/a | Denied | Becomes R-PROF | Denied | Denied | `packages/api/src/routes/ca.routes.ts:206`, `packages/api/src/routes/ca.routes.ts:210` |
| Create a record for a client without a login (F-CA-018) | Denied | Denied | Denied | Denied | Refused for everyone ("no longer created") | Refused | n/a | n/a | n/a | Denied | Denied | Denied | Denied | `packages/api/src/services/ca/caAccess.service.ts:322` |
| Split Expenses: groups, expenses, payments, settings (F-SPLIT-001–F-SPLIT-017) | Denied (to /login) | Allowed | Allowed | Allowed | Allowed | Allowed | Own groups only (family view not applied) | Own groups only | Own groups only | Managed person's groups | n/a | Read-only balances via `list_split_balances` | Denied | `packages/api/src/routes/split.routes.ts:12`, `packages/api/src/services/split/groups.service.ts:34` |
| Delete a split comment | Denied | Own comments only | Own only | Own only | Own only | Own only | Same as base plan | Same as base plan | Same as base plan | Own (managed person's) | n/a | Denied | Denied | `packages/api/src/services/split/comments.service.ts:54` |
<!-- END MATRIX -->

Legend: Allowed · Denied · Conditional (see note)

## Notes and mismatches
<!-- BEGIN ROLE-NOTES -->
- Inside a split group every active member has equal rights: anyone can edit or delete any expense, record or delete any payment, rename, archive, add or remove members (`packages/api/src/services/split/expenses.service.ts:124`, `packages/api/src/services/split/groups.service.ts:204`). Only comment deletion is restricted to the author.
- "Acting for a client who invited you is free" (`packages/api/src/routes/ca.routes.ts:78`) is contradicted for report downloads: `/api/reports/download/*`, `/statement/provident-fund` and `/fy-bundle` check the professional's own plan, so a Free professional cannot download any client report and a Plus/Family professional cannot download accounting reports (`packages/api/src/routes/reports.routes.ts:85`, `packages/api/src/routes/reports.routes.ts:128`).
- The invitation email endpoints (`/api/ca/clients/:id/invite-email/preview|send`) sit behind the professional two-factor gate (`packages/api/src/routes/ca.routes.ts:73`), but the account holder's Account Access page (B06) uses the same composer to email an invitation to their professional — so an account holder without two-factor sign-in gets `TWO_FACTOR_REQUIRED` when emailing their own invitation (`apps/web/src/pages/settings/ProfessionalAccessPage.tsx:603`).
- R-MANAGER on `/api/advisor`: the plan gate checks the acting user's plan, which equals the manager's plan while managing (global roles); recommendations, override list and assessments are stored under the managed person.
- No distinction beyond global roles was found for Advisor or Split. The professional's "edit rights" (books, transactions, imports, FMV) are per-grant flags, not roles.
<!-- END ROLE-NOTES -->
