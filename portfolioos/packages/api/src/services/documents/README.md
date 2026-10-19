# services/documents/

The document vault and the document sorter.

- `document.service.ts` — vault documents: upload, list, tags, download (bytes stored in Postgres).
- `docSorter/` — auto-sorting uploaded documents: text extraction, rules, person matching, naming, and an LLM fallback.

Worker: `jobs/docSortWorker.ts`. HTTP: `routes/documents.routes.ts`, `routes/documentSorter.routes.ts`. Tests: `test/docSorter/`.
