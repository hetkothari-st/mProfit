# Manual QA — Gmail Full-Inbox Ingestion

Run end-to-end against the Railway deployment after `prisma migrate deploy` + redeploy.

## Setup

- [ ] Anthropic API key set + `ENABLE_LLM_PARSER=true` on Railway.
- [ ] Google OAuth client + redirect URL set on Railway.
- [ ] Demo user can log in.

## Onboarding

- [ ] New user signs up. Dashboard shows the `ConnectGmailCard` CTA.
- [ ] Click "Connect Gmail". Google consent screen opens.
- [ ] Grant scope. Browser lands on `/gmail/scan-setup`.
- [ ] Date inputs default to last 5y → today.

## Scan

- [ ] Click "Start scan". Redirects to `/reports?tab=inbox-imports`.
- [ ] Progress strip shows running scan with live counts.
- [ ] Dashboard `GmailScanProgressCard` mirrors the same numbers.
- [ ] Discovered docs appear with `status=CLASSIFYING` then transition.

## Approval queue

- [ ] Filter by `status=Pending review` shows only `PENDING_APPROVAL` rows.
- [ ] Click filename → `InboxImportPreviewSheet` opens with the PDF rendered.
- [ ] Approve a contract note → status flips to `IMPORTING` → `IMPORTED`.
- [ ] `/import` history shows the new ImportJob with `gmailDocId` set.

## Bulk + auto-approve

- [ ] Select 3 rows → "Approve selected" → all flip to `IMPORTED`.
- [ ] Click "+ Always" on a row → upserts an enabled rule.
- [ ] Run a second scan → docs from that sender land directly in `APPROVED`.

## Reject + blocklist

- [ ] Reject a doc with blocklist=true → upserts a disabled rule.
- [ ] Re-run scan → matching docs appear with status `REJECTED` immediately.

## Cancel + resume

- [ ] Start a long scan, hit `POST /api/gmail/scan-jobs/:id/cancel`. Worker stops at next checkpoint.
- [ ] Verify scan status `CANCELLED` and no orphaned files in `UPLOAD_DIR/gmail-imports/`.

## Budget cap

- [ ] Set `AppSetting.llm.monthly_cap_inr=1` (or any tiny value).
- [ ] Start a scan → hits cap → scan completes with errorMessage describing the cap.
- [ ] Reset cap to 1000, hit `POST /api/gmail/scan-jobs/:id/resume` → remaining docs classify.

## Failure modes

- [ ] Disconnect the Gmail account mid-scan → scan FAILS with "reconnect Gmail".
- [ ] Upload a password-protected PDF as an attachment → doc status `PENDING_APPROVAL` with `classifierNotes='locked'`.
