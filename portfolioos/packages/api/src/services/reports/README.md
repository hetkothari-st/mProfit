# services/reports/

Downloadable reports (PDF/Excel).

- `reports.service.ts` — capital-gains reports (STCG, LTCG, Schedule 112A, intraday) and income.
- `specialReports.service.ts` — grandfathering, demat holdings, residual lots.
- `schedule43.report.ts`, `fyBundle.service.ts` — the Schedule 43 report and the full financial-year bundle.
- `reportSubjects.ts` — whose data a report covers (self, family members, CA clients).
- `export.service.ts`, `excelCells.ts`, `renderToBuffer.ts` — PDF/Excel streaming and formatting helpers.

The report layout engine lives next door in `services/reportBuilder/`. HTTP: `routes/reports.routes.ts`.
