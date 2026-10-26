# User Roles and Permissions — Account & access (B06 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Sign-in & session, First-run setup, Settings & Account Access, Connections, Plans & billing, Legal pages

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
Legend: Allowed · Denied · Conditional (explained in the cell). Overlay columns say "Same as base plan" where this fragment does not treat them differently.

<!-- BEGIN MATRIX -->
| Page / feature / action | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sign in, create account, Google, reset password (F-AUTH-001–005) | Allowed | Sign-in page redirects to the app; register/reset pages still open | Same as R-FREE | Same as R-FREE | Same as R-FREE | Same as R-FREE | n/a | n/a | n/a | n/a | n/a | Denied | Denied | `apps/web/src/pages/auth/LoginPage.tsx:51`, `packages/api/src/routes/auth.routes.ts:31` |
| Self-register as ADMIN | Denied ("Cannot self-register with this role") | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `packages/api/src/controllers/auth.controller.ts:44` |
| Session refresh / sign out (F-AUTH-006, F-AUTH-007) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Runs as the manager (account route) | Same as base plan | Denied | Denied | `packages/api/src/services/auth/auth.service.ts:411` |
| Onboarding wizard (F-ONB-001–005) | Denied (to Sign in) | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Denied (redirect to Portfolios) | Same as base plan | Denied | Denied | `apps/web/src/components/family/NotWhileManaging.tsx:15` |
| Settings profile, plan card, two-factor, deletion (F-SET-001–003, F-SET-007) | Denied | Allowed (own account) | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Acts on the manager's own account | Same as base plan | Denied | Denied | `packages/api/src/routes/auth.routes.ts:43`, `apps/web/src/stores/actingAs.store.ts:47` |
| Delete account while owning a family with other members | Denied | Denied (blocked) | Denied (blocked) | Denied (blocked) | Denied (blocked) | Denied (blocked) | Denied until members removed or family handed over | Allowed | Allowed | n/a | n/a | n/a | n/a | `packages/api/src/services/account/accountDeletion.service.ts:179` |
| Email notifications, loan rate alerts (F-SET-004, F-SET-005) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Loan rate alerts: the managed person's setting; Gmail connect: account route (manager) | Same as base plan | Denied | Denied | `packages/api/src/routes/notifications.routes.ts:14`, `packages/api/src/services/notifications/alertPrefs.service.ts:4` |
| Account Access: see, invite, scope, withdraw, restore (F-SET-008–012) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Shows the manager's own relationships (account route) | Cannot change own scope; can end the engagement from the CA side | Denied | Denied | `packages/api/src/routes/ca.routes.ts:178`, `packages/api/src/services/ca/caAccess.service.ts:830` |
| Account Access: preview/send the invitation email (F-SET-009) | Denied | Conditional — only with two-factor used this session | Conditional — same | Conditional — same | Conditional — same | Conditional — same | Same as base plan | Same as base plan | Same as base plan | Denied | n/a | Denied | Denied | `packages/api/src/routes/ca.routes.ts:73` |
| "Do you keep books for clients?" card (F-SET-013) | Denied | Hidden | Hidden | Hidden | Shown when no clients | Per own plan | Same as base plan | Same as base plan | Same as base plan | Hidden | n/a | n/a | n/a | `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:532` |
| Loan rates admin (F-SET-014) | Denied | Denied ("Admins only.") | Denied | Denied | Denied | Allowed with two-factor session | n/a | n/a | n/a | Denied | Denied | Denied | Denied | `packages/api/src/routes/adminLoanRates.routes.ts:17` |
| AI connectors: list, revoke, activity, family opt-in (F-CONN-002, F-CONN-004) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Same as base plan | Same as base plan | Same as base plan | Denied ("AI connectors work on your own account only…") | Same as base plan | Denied | Denied | `packages/api/src/routes/connect.routes.ts:28` |
| AI connectors: connect, approve, edit sharing (F-CONN-001, F-CONN-003, F-CONN-005) | Denied (to Sign in) | Denied (lock card / "needs the Plus plan"); Cancel allowed | Allowed | Allowed | Allowed | Per own plan | Same as base plan | Same as base plan | Same as base plan | Denied | Same as base plan | Denied | Denied | `packages/api/src/routes/connect.routes.ts:44`, `packages/api/src/routes/connect.routes.ts:71` |
| Read data through /mcp (F-CONN-006) | Denied | n/a (approval needs Plus; a lapsed plan keeps working — defect) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | Allowed — shared areas, read-only | Denied | `packages/api/src/routes/mcp.routes.ts:48` |
| Broker connectors, legacy connections (F-CONN-007, F-CONN-008) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Acts on the managed person | Same as base plan | Denied | Denied | `packages/api/src/routes/fo.routes.ts:39` |
| Account Aggregator consent (F-CONN-009) | Denied | Status only; consent actions refused ("requires the PLUS plan") | Allowed | Allowed | Allowed | Per own plan | Same as base plan | Same as base plan | Same as base plan | Manager's plan, managed person's data | Same as base plan | Denied | Denied | `packages/api/src/routes/finfactor.routes.ts:42` |
| Pricing: view, buy (F-PLAN-001, F-PLAN-002) | Denied (to Sign in) | Allowed | Allowed (lower tiers also buyable) | Allowed (lower tiers also buyable) | Allowed (lower tiers also buyable) | Allowed | Same as base plan | Same as base plan | Same as base plan | Buys for the manager's own account (account route) | Same as base plan | Denied | Denied | `packages/api/src/routes/billing.routes.ts:23` |
| Admin plan switch (F-PLAN-003) | Denied | Denied | Denied | Denied | Denied | Allowed with two-factor session | n/a | n/a | n/a | Denied | Denied | Denied | Denied | `packages/api/src/routes/billing.routes.ts:135` |
| AI-use notice, extension privacy policy (F-LEGAL-001, F-LEGAL-002) | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | n/a | Allowed | `apps/web/src/App.tsx:114` |
<!-- END MATRIX -->

## Notes and mismatches
<!-- BEGIN ROLE-NOTES -->
- Non-admins calling admin routes (`/api/admin/*`, `/api/billing/dev-set-plan`) get **401 "Insufficient role"**, not 403 (`packages/api/src/middleware/authenticate.ts:95`). The web client treats 401 as an expired session and refreshes tokens once before failing (`apps/web/src/api/client.ts:98`).
- The comment on the registration schema says ADMIN "bypasses every plan-tier gate"; the code does not (`packages/api/src/controllers/auth.controller.ts:38` vs `packages/api/src/middleware/requirePlan.ts:6`). Documentation follows the code: admins follow their own plan.
- `/admin/mf-qualitative-facts` (B02 page) is an admin tool without the two-factor requirement that the other admin tools have and with no navigation link (`packages/api/src/routes/mfQualitativeFacts.routes.ts:48`, `apps/web/src/App.tsx:203`).
- Global roles.md says the register and forgot-password pages redirect signed-in users to the app; only the sign-in page does (`apps/web/src/pages/auth/LoginPage.tsx:51`).
- The Account Access page is not plan-gated, but its invitation email step sits behind the professional two-factor gate (`packages/api/src/routes/ca.routes.ts:73`), so the account holder needs two-factor sign-in to deliver an invitation.
- The Account Aggregator card shows enabled buttons to Free users; the server refuses them (`packages/api/src/routes/finfactor.routes.ts:42`).
- AI connector access after a paid plan lapses: the web hides **Edit sharing** and locks connect, but `/mcp` keeps answering because it checks the stored plan (`packages/api/src/routes/mcp.routes.ts:48`).
- The "I am" role chosen at sign-up (INVESTOR, HNI, FAMILY_OFFICE, ADVISOR, CA) grants nothing in this fragment.
<!-- END ROLE-NOTES -->
