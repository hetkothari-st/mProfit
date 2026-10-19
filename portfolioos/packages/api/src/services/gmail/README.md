# services/gmail/

The app side of Gmail ingestion. The Gmail API client, poller and parsers live in `src/ingestion/gmail/`.

- `monitoredSenders.service.ts` — which senders the user has chosen to ingest from.
- `gmailScanJobs.service.ts` — full-inbox document scan jobs (create, list, cancel).
- `gmailDiscoveredDocs.service.ts` — documents those scans found.
- `gmailDocApproval.service.ts` — approve or reject a discovered document, plus the auto-approval sweep.
- `gmailAutoApproveRules.service.ts` — per-sender auto-approve rules.

Worker: `jobs/gmailScanWorker.ts`. HTTP: `routes/gmail.routes.ts`, `routes/gmailScan.routes.ts`, `routes/monitoredSenders.routes.ts`.
