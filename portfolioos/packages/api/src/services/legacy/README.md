# services/legacy/

**Succession** (formerly "Legacy Transfer"): handing your financial picture to nominees if you stop responding. The code and routes keep the old `legacy` name.

- `stateMachine.ts`, `runner.service.ts` — a pure state machine that decides, from the plan's clock and "now", what happens next; the runner applies it.
- `activity.service.ts` — records real owner activity, which resets the clock.
- `plan.service.ts` — the owner's succession plan and nominees.
- `publicLinks.service.ts`, `tokens.service.ts`, `view.service.ts`, `viewPdf.ts` — the nominee's access link and read-only view.
- `outbox.service.ts`, `emails.ts` — outgoing notices.

Job: `jobs/legacyTransferJob.ts`. HTTP: `routes/legacy.routes.ts`.
