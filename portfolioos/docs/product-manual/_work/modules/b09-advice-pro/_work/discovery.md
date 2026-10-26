# B09 discovery — Advisor, Professional workspace (CA), Split Expenses

Source commit 9d9025c4 · code-only · routes per `_work/global/modules.md` rows 12, 23–25, 67, 71–74, 81.

## Routes in scope
| Route | Page | Nav |
|---|---|---|
| /advisor | pages/advisor/AdvisorPage | Overview → Advisor (`apps/web/src/components/layout/navItems.tsx:85`) |
| /ca | pages/ca/CaWorkspacePage inside ProfessionalTwoFactorGate | Sidebar **Client books**, only when the user holds ≥1 client row (`apps/web/src/components/layout/SidebarNav.tsx:170`) |
| /ca/clients/:clientId | pages/ca/ClientBooksPage (2FA gate) | **Open books** on a client card |
| /ca/invitations/:token/accept | pages/ca/AcceptCaInvitationPage | email link (practice → client) |
| /professional-invitations/:token | pages/ca/AcceptProfessionalInvitePage (outside protected tree) | email link (client → professional) |
| /split, /split/settings, /split/groups/:id, /split/expenses/:id, /split/friends/:key | pages/split/* | Tools → Split Expenses (`apps/web/src/components/layout/navItems.tsx:117`) |

## Backend
- `/api/advisor` (`packages/api/src/routes/advisor.routes.ts`) — whole router gated by ADVICE_ENGINE (PLUS).
- `/api/ca`, `/api/me/professional-access`, `/api/professional-invitations` (`packages/api/src/routes/ca.routes.ts`), mounted only when ENABLE_FAMILY is true (`packages/api/src/routes/index.ts:139`).
- `/api/split` (`packages/api/src/routes/split.routes.ts`).
- Jobs: fund scoring 22:45 IST (`packages/api/src/jobs/fundScoring.job.ts:117`); split digests hourly :05 + Monday 09:00 IST (`packages/api/src/jobs/splitDigestJobs.ts:33`); split share-link reconcile 02:30 IST (`packages/api/src/jobs/splitShareLinkReconcileJob.ts:22`). No advisor engine schedule — runs only on **Refresh recommendations**.

## Module checklist
- [x] Advisor — 14 features (10 Live, 3 Backend-only, 1 automatic)
- [x] Professional workspace — 19 features
- [x] Split Expenses — 20 features
- [x] Settings, roles, workflows, gaps

## Exhaustiveness notes
Controls grepped in every page/component listed above; every button/tab/select maps to a feature Controls table. Account Access page (`apps/web/src/pages/settings/ProfessionalAccessPage.tsx`) and `GrantScopePanel` belong to B06 → D-CA-001.
