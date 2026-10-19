# services/split/

**Split Expenses** (Splitwise-style): groups, shared expenses, balances and settling up.

- `groups.service.ts`, `contacts.service.ts`, `expenses.service.ts`, `settlements.service.ts`, `ledger.service.ts` — the core.
- `allocate.ts`, `balances.ts`, `fx.ts`, `validate.ts` — pure maths: splitting, balances, currency.
- `receipts.service.ts`, `comments.service.ts`, `labels.service.ts`, `activity.ts` — expense extras and the activity feed.
- `shareLink.service.ts`, `linking.service.ts` — share links and linking a contact to a real user.
- `notify.service.ts`, `splitEmail.templates.ts`, `settings.service.ts` — notifications and per-user settings.

Jobs: `jobs/splitDigestJobs.ts`, `jobs/splitShareLinkReconcileJob.ts`. HTTP: `routes/split.routes.ts`.
