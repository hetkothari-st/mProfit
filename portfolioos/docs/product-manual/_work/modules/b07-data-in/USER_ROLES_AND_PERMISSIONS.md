# User Roles and Permissions — Data in (B07)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Import, Email ingestion, Gmail connection and inbox scans, CAS, Documents

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
<!-- BEGIN MATRIX -->
| Page / feature / action | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Upload, reprocess, unlock, download, delete imports (F-IMPORT-001…007) | Denied (to /login) | Allowed (own) | Allowed (own) | Allowed (own) | Allowed (own) | Per own plan | Same as base plan (own imports only) | Same as base plan | Same as base plan | Managed person's imports | n/a (CA workspace upload) | Denied | Denied | `packages/api/src/routes/imports.routes.ts:18`, `packages/api/src/services/imports/import.service.ts:158` |
| Ingestion failures page (F-IMPORT-011, hidden) | Denied | Own failures (typed URL) | Own failures | Own failures | Own failures | Per own plan | Same as base plan | Same as base plan | Same as base plan | Managed person's | n/a | Denied | Denied | `packages/api/src/services/imports/ingestionFailures.service.ts:106` |
| Market feed failures card (F-IMPORT-012, hidden) | Denied | Allowed (global rows) | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | Denied | Denied | `packages/api/src/controllers/ingestionFailures.controller.ts:51` |
| Connect / disconnect Gmail, discover senders, inbox scan, scan shortcut (F-MAIL-001…003, F-MAIL-007, F-INGEST-002) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Same as base plan | Same as base plan | Same as base plan | Denied ("Switch back to your own account to do this.") | n/a | Denied | Denied | `packages/api/src/services/family/managedProfile.service.ts:45`, `packages/api/src/controllers/gmail.controller.ts:42` |
| Monitored senders, review and approve events (F-INGEST-003…007) | Denied | Allowed (own) | Allowed (own) | Allowed (own) | Allowed (own) | Per own plan | Same as base plan | Same as base plan | Same as base plan | Managed person's (no Gmail behind it) | n/a | Denied | Denied | `packages/api/src/services/gmail/monitoredSenders.service.ts:63`, `packages/api/src/services/imports/canonicalEvents.service.ts:72` |
| Enable auto-commit before threshold | Denied | Denied | Denied | Denied | Denied | Denied | Same as base plan | Same as base plan | Same as base plan | Denied | n/a | Denied | Denied | `packages/api/src/controllers/monitoredSenders.controller.ts:54` |
| CAS request helper (F-CAS-001, F-CAS-002) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | Denied | Denied | `packages/api/src/routes/cas.routes.ts:8` |
| Documents sorter (F-DOCS-001…008) | Denied | Denied (lock card; API "This feature requires the PLUS plan or higher") | Allowed | Allowed | Allowed | Per own plan | Same as base plan (own documents) | Same as base plan | Same as base plan | Manager's plan, managed person's documents | n/a | Denied | Denied | `packages/api/src/routes/documentSorter.routes.ts:10`, `apps/web/src/pages/documentSorter/DocumentSorterPage.tsx:44` |
<!-- END MATRIX -->

Legend: Allowed · Denied · Conditional (see note). "Same as base plan" = family view does not change what this area shows or allows.

## Notes and mismatches
<!-- BEGIN ROLE-NOTES -->
- Family view (R-FAMOWNER/R-FAMCONTRIB/R-FAMVIEWER) has no effect in this area: every endpoint filters by the signed-in user id (`packages/api/src/services/imports/import.service.ts:164`, `packages/api/src/services/imports/canonicalEvents.service.ts:61`).
- R-MANAGER: `/api/gmail` and `/api/mailboxes` are account routes, so the ingestion page's email-account card, discovery and the scan shortcut fail while managing, but `/api/monitored-senders` and `/api/canonical-events` are data routes and work on the managed person, who cannot have a Gmail connection of their own. The page does not hide these controls (`packages/api/src/services/family/managedProfile.service.ts:37`). Logged as a mismatch.
- The market-feed failures endpoint is authenticated but not user-scoped by design: every signed-in user reads the same global feed rows (`packages/api/src/services/imports/ingestionFailures.service.ts:226`).
- Auto-commit threshold: the server refuses enabling auto-commit below the threshold on update, but creates every sender with auto-commit on, so the guard is effectively bypassed for new senders (`packages/api/src/services/gmail/monitoredSenders.service.ts:99`).
- Plan gate: only Documents is plan-gated (PLUS); imports, Gmail, email events and CAS are available on every plan (`packages/shared/src/entitlements.ts:58`).
<!-- END ROLE-NOTES -->
