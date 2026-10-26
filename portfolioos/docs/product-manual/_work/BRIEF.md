# Full-app manual run — shared brief

Every agent in this run reads this file first, then follows the skill at
`C:\Users\ST269\.claude\skills\product-manual-generator\SKILL.md` (and its references/ and scripts/).

- Repo root (worktree): `C:\Users\ST269\Desktop\mProfit-loans-fix-wt\portfolioos` — branch `docs/product-manual`, source commit `9d9025c4` (origin/main).
- Output root: `docs/product-manual/` in that repo. **Only write inside your own folder** under `docs/product-manual/_work/` (named below). Never modify app code, config, git state (no commits, no checkout), databases, or start servers/browsers.
- Run is **code-only** (no UI verification). Record that limitation once in your gaps fragment.
- Do not ask the user questions; record choices under "Choices made without asking". Do not spawn subagents.
- Cite **full repo-relative paths** (`apps/web/src/...`, `packages/api/src/...`).
- Product name in UI: check `apps/web/src` brand components (likely "EveryPaisa"); use the UI's name.

## Batches and ID prefixes

Each batch owns the listed `apps/web/src/pages/<dir>` folders, their routes in `apps/web/src/App.tsx`, the components they render (from `apps/web/src/components/<area>`), and the backend routes/services/jobs/models behind them. A feature belongs to the batch whose route renders it; if another batch's page links to it, list it as a dependency (D-).

| Batch | Folder name | Pages dirs | Module ID prefixes |
|---|---|---|---|
| B01 | b01-asset-classes | assetClasses | ASSET (sub-prefix allowed: e.g. FD, BOND, GOLD, NPS, PPF, CRYPTO… — keep each ≤6 chars) |
| B02 | b02-mutual-funds | mf, mutualFunds | MF |
| B03 | b03-family-succession | family, legacy, will | FAM, SUCC, WILL |
| B04 | b04-loans-cards | loans, emi, creditCards | LOAN, EMI, CARD |
| B05 | b05-property-vehicles | rental, realEstate, vehicles | RENT, REST, VEH |
| B06 | b06-account-access | auth, onboarding, settings, pricing, legal, notFound, connect, connectors | AUTH, ONB, SET, PLAN, LEGAL, CONN |
| B07 | b07-data-in | ingestion, imports, cas, mailboxes, documentSorter | INGEST, IMPORT, CAS, MAIL, DOCS |
| B08 | b08-reports-tax | reports, tax, analytics, intelligence | REPORT, TAX, ANLYT, INTEL |
| B09 | b09-advice-pro | advisor, ca, split | ADV, CA, SPLIT |
| B10 | b10-core-shell | dashboard, portfolios, transactions, bankAccounts, alerts + app shell (components/layout, components/ai assistant, header, sidebar, global search/notifications) | DASH, PORT, TXN, BANK, ALERT, SHELL, AI |
| B11 | b11-money-misc | insurance, pf, forex, goals, accounting, cashflows, income | INS, PF, FX, GOAL, ACCT, CASH, INC |

IDs: `F-<PREFIX>-NNN`, `S-<PREFIX>-NNN`, `W-<PREFIX>-NNN`, `D-<PREFIX>-NNN`. Roles use only the global `R-` IDs from `_work/global/roles.md` — never invent new R- IDs; if your module distinguishes users in a way the global roles don't cover, record it in your gaps fragment under ambiguities.

## Fragment format (batches B01–B11)

Write to `docs/product-manual/_work/modules/<folder name>/` the six deliverable files **plus** `_work/` notes (discovery.md, inventory.md, etc.) inside that folder. Each deliverable is a valid standalone file (so `audit_docs.py` can run on your folder) and wraps its mergeable content in marker comments, exactly as below. The merge step copies only what is between markers.

- `PRODUCT_MANUAL.md`
  - `<!-- BEGIN MODULES -->` … `<!-- END MODULES -->`: one `## <Module name>` chapter per module (overview, its features as `### ... <!-- F-... -->` sections with all 14 labels, and a "What this area doesn't do" list).
  - `<!-- BEGIN GLOSSARY -->` … `<!-- END GLOSSARY -->`: glossary table rows only (`| Term | Meaning |`), no header.
  - Also include a `## Roles and profiles` section that copies the global role headings you reference (so the audit passes) and a `## Glossary` heading — these are dropped at merge.
- `FEATURE_INVENTORY.md`
  - `<!-- BEGIN INVENTORY -->` … `<!-- END INVENTORY -->`: inventory table rows only (columns exactly: `ID | Feature | Module | Page/route | Roles | Actions | Settings/toggles | Backend deps | Data read/modified | Impl. status | Doc status | Sources`). Put the full table (header + rows) around the markers so the audit can parse it.
  - `<!-- BEGIN DEPENDENCIES -->` … `<!-- END DEPENDENCIES -->`: dependency rows only (`| D-... | Feature (out of scope) | How it's reached | Sources |`).
- `SETTINGS_AND_TOGGLES.md`
  - `<!-- BEGIN SETTINGS -->` … `<!-- END SETTINGS -->`: `## <Screen> → <Section>` headings with `### <Label> <!-- S-... -->` blocks.
  - `<!-- BEGIN CLIENT-STORAGE -->` … `<!-- END CLIENT-STORAGE -->` and `<!-- BEGIN OPERATOR-CONFIG -->` … `<!-- END OPERATOR-CONFIG -->`: table rows only (env var names, never values).
- `USER_ROLES_AND_PERMISSIONS.md`
  - Copy the global role headings you use (for the audit).
  - `<!-- BEGIN MATRIX -->` … `<!-- END MATRIX -->`: permission-matrix rows only, columns in the global role order from roles.md, last column "Enforced by".
  - `<!-- BEGIN ROLE-NOTES -->` … `<!-- END ROLE-NOTES -->`: bullet notes / mismatches.
- `WORKFLOWS_AND_TROUBLESHOOTING.md`
  - `<!-- BEGIN WORKFLOWS -->` … `<!-- END WORKFLOWS -->`: `## <Workflow> <!-- W-... -->` sections.
  - `<!-- BEGIN TROUBLESHOOTING -->` … `<!-- END TROUBLESHOOTING -->`: general troubleshooting rows specific to your modules.
- `DOCUMENTATION_GAPS.md` — rows only between these marker pairs (one table each, header outside markers):
  `UNVERIFIED`, `AMBIGUITIES`, `HIDDEN`, `MISMATCHES`, `CHOICES`, `ALLOWLIST` (e.g. `<!-- BEGIN AMBIGUITIES -->` … `<!-- END AMBIGUITIES -->`). Defects you confirmed go in AMBIGUITIES with path:line evidence.

Before finishing: run
`python C:\Users\ST269\.claude\skills\product-manual-generator\scripts\audit_docs.py <your folder> --repo <repo root>` (add `--allow-literal` only for genuine app placeholders) until clean, and `--print-citations` once to spot-check lines. Confirm `git status --short` shows only files under `docs/product-manual/`.

Final reply (short): counts (features by impl. status, settings, workflows, deps), audit result, top 5 confirmed defects with path:line, anything that blocked you.

## Assignments from wave 0 (authoritative — read `_work/global/modules.md` and `_work/global/roles.md` too)

- Route ownership: follow `_work/global/modules.md`. Overrides: `/mutual-funds` → B02 (page file in pages/assetClasses); `/provident-fund` → B11 (page file in pages/assetClasses).
- Roles: use the 13 R- IDs and the ROLE ORDER in roles.md; overlay roles get "Same as base plan" / "n/a" where your module doesn't differ (guidance in roles.md). Do not define new R- IDs.
- Extra scope:
  - **B03**: family "Switch view" menu, "Accounts you manage" menu + managing banner + **Back to my account**, sidebar family tree. Verify and, if confirmed, log: family dashboard endpoints require the caller's own FAMILY plan (`packages/api/src/routes/families.routes.ts:463`); schema comment vs code on contributors/viewers seeing members' personal data (`packages/api/prisma/schema.prisma:3752` vs `packages/api/src/services/family/familyScope.service.ts:180`).
  - **B10**: Upgrade button / sidebar upgrade card / lock card; page error screen; theme, Hide values, alerts bell, tab bar + swipe, sidebar edit/sort; "no global search / no app-wide shortcuts" in its doesn't-do list; price jobs, corporate-action apply job, net-worth snapshot job; `/api/corporate-actions` (backend-only); gap note for dead `pages/PlaceholderPage.tsx`.
  - **B06**: desktop-app download button; session refresh/expiry handling; Razorpay billing + admin plan switch; notification config (`/api/notifications`); account deletion + its job; `/mcp`, `/oauth`, `/.well-known`, Finfactor webhook (backend-only / external callers); ops/security jobs in operator-config only; `settings/ProfessionalAccessPage` (Account Access). Verify and log if confirmed: MCP ignores plan expiry (`packages/api/src/routes/mcp.routes.ts:48`); Pricing advertises ungated flags (`packages/shared/src/entitlements.ts:68`); ADMIN comment vs code (`packages/api/src/controllers/auth.controller.ts:38`); non-admin on admin route gets 401 not 403; `/admin/mf-qualitative-facts` lacks 2FA and nav.
  - **B07**: Gmail auto-connect banner + scan context; gap note for dead `MailboxesPage`; hidden `/import/failures`.
  - **B08**: nightly data-integrity job.
  - **B09**: list B06's Account Access page as a dependency of the CA features.

**Marker placement note (from B02):** a marker line between a table's header and its `|---|` separator breaks the audit's table parser. Put `<!-- BEGIN X -->` on its own line *above* the table header (the header may sit inside the markers — merge drops header rows), or at the end of the separator line. Never between header and separator.
