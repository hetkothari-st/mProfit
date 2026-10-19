# services/will/

**Will Maker**: drafting, generating and executing a will.

- `will.service.ts`, `willStore.ts` — the draft and its storage.
- `estate/` — gathers the user's assets into the estate schedule (one adapter per asset type, then reconciliation).
- `willGenerate.service.ts`, `willPdf.ts`, `willFonts.ts` — rendering the will document.
- `willReview.service.ts` — periodic "review your will" reminders.
- `willExecute.service.ts` — recording that the will was signed, and storing the signed copy.
- `willOrphanSweep.ts` — removes orphaned will documents.

Job: `jobs/willReviewJob.ts`. HTTP: `routes/will.routes.ts`.
