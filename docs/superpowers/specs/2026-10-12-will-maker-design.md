# Will Maker - spec (requirements + approved design)

Merged on 2026-10-12 from `.superpowers/sdd/will-maker-design/will-maker-requirements.md` (agreed with the user) and `.superpowers/sdd/will-maker-design/will-maker-design.md` (hybrid design, approved by the user). Both parts are kept verbatim below; where they differ, the design governs. Implementation plans: `docs/superpowers/plans/2026-10-12-will-maker-01-wizard.md` (Part 1, steps 1-8); Part 2 (step 9) follows separately. Rulings made while planning Part 1 are listed in that plan.

---

## Part A - Requirements

### Will Maker - requirements (agreed with user 2026-10-12)

Repo: C:\Users\ST269\Desktop\mProfit-loanchecks-wt\portfolioos (content = main 70bc3ee1). Separate from the parallel `feat/legacy-transfer` branch (Legacy uses `Legacy*` models, `/legacy`, `/api/legacy*`, migration 20261013120000_legacy_transfer). Will Maker must use `Will*` names, `/will`, `/api/will`, `services/will/`, `pages/will/`, `shared/src/will.ts`, audit actions `will_*`, entitlement `WILL_MAKER`, own migration with a later timestamp (e.g. 20261014xxxxxx), separate schema block.

### Flow (9 screens, mockups provided by user)
1. Overview: will status (Not created / Draft / Generated / Executed), estate overview (total assets, liabilities, net worth - indicative), "key things to prepare", ~15-20 min, Create my will / continue.
2. Your details & legal context: full legal name*, DOB*, country/jurisdiction (India only in v1; others -> "consult a lawyer", no generation), religion/personal law (Hindu/Sikh/Jain/Buddhist, Christian/Parsi/other -> Indian Succession Act; Muslim -> warn: generally only 1/3 bequeathable to non-heirs, legal review strongly recommended, block or gate generation), address, marital status*, children? dependents? Info box on why.
3. People & roles: tabs Beneficiaries / Executor / Guardian (minor children) / Others. Add person or organisation (charity). Quick-pick from existing EveryPaisa family members + add new. Fields: name, relationship, type (individual/organisation), DOB/age (minor detection), contact optional; contingent beneficiary optional. Executor (+ alternate). Guardian required if minor children.
4. Review assets & liabilities: auto-fetched itemised list (bank accounts, holdings by class incl. stocks/MF/FD/gold/crypto/NPS/PPF, PF accounts, owned property, rental property (no double count), vehicles, insurance (sum assured + nominee note), loans given) and liabilities (loans outstanding, credit cards). Ownership column (Sole / Joint x% / Policy-nominee) and status (Confirmed / Needs review). User can confirm, edit ownership, exclude, add asset manually. Snapshot stored in the draft (values at time of will).
5. Allocate inheritance: tabs By percentage (residuary, donut, sliders/inputs, total must be 100%), Specific asset gifts (asset -> person), Fixed monetary gifts. Highlight unallocated / conflicts.
6. Additional instructions: free text (max 1000 chars), optional.
7. Review & validation: checks list (allocation 100%, executor appointed, guardian if minors, joint ownership flagged, insurance/bank nominee note, no conflicting assignments, required fields), estate summary, "Legal review recommended" box. Passing checks != legally valid.
8. Preview: plain-language summary + full "LAST WILL AND TESTAMENT" document; download PDF.
9. Execute & store: India steps (print, sign, 2 witnesses not beneficiaries, optional registration), "Find a lawyer" with LEGITIMATE links (verified): Tele-Law (Govt of India, Dept of Justice) https://www.tele-law.in/ (free for eligible, small fee otherwise; citizens app), NALSA free legal aid helpline 15100 and online application https://nalsa.gov.in/ ; advice to verify advocate's State Bar Council enrolment. Upload signed/executed copy (vault, sealed), record execution date/witnesses, status tracking; review reminder every 2 years + manual "my circumstances changed".

### Decisions (user)
- Paid feature: gate with entitlement `WILL_MAKER` (pricing tiers exist in shared/src/entitlements.ts; Legacy uses PLUS).
- Legal text: fixed template with filled values (no AI drafting).
- Versions: keep history; a new will supersedes the previous (statuses).
- Own profile only in v1 (no wills for managed family profiles).
- PDF: bundle Noto Sans (₹ glyph + Devanagari/other Indian scripts names).
- Reminder: every 2 years + manual.
- Sidebar: new collapsible "Planning" group: Goals (moved from Overview), Will Maker, Tax Planning (links /tax).
- Delivery in parts: Part 1 = steps 1-8 (data model, wizard, assets, allocation, validation, preview + PDF); Part 2 = step 9 (execute guide, upload, status, reminders) + Planning sidebar group.

### Constraints (repo conventions)
- Money Decimal; strings on wire (serializeMoney). dd/mm/yyyy via formatDateOnly/formatDateIST. Plain "-" in code strings.
- Draft data contains PII -> seal with per-user key (lib/userKeys sealForUser/openForUser) or field encryption; never log it.
- New user tables: USER_SCOPED_MODELS + RLS migration (template 20261006170000_document_blob) + explicit guarded GRANT to portfolioos_app + account deletion purge.
- Audit will_* actions. Vault reuse (Document/DocumentBlob, DocumentOwnerType gets WILL).
- Web: no jest-dom in tests; dark-mode tokens; 375 px no sideways scroll.
- Server-side draft (resume on any device), autosave per step.

---

## Part B - Chosen design

### Will Maker — chosen design (hybrid, approved by user 2026-10-12)

Base = pragmatic: ONE sealed JSON payload per `Will` row (all PII inside; plain columns only for status/version/dates/step/revision). Plus from the clean design:

### Data model
- `enum WillStatus { DRAFT GENERATED EXECUTED SUPERSEDED DISCARDED }`
- `model Will { id, userId (FK cascade), version Int (per user, @@unique([userId, version])), status, revision Int @default(0) (optimistic lock), currentStep Int @default(1), payload Bytes (sealForUser(userId, "will:<id>", JSON)), payloadSchemaVer Int @default(1), supersededById String?, generatedAt?, executedAt? @db.Date (Part 2), nextReviewAt? @db.Date (Part 2), createdAt, updatedAt; @@index([userId, status]) }` + raw-SQL partial unique index: one DRAFT per user.
- `model WillVersion` (IMMUTABLE generated copy): `id, willId, userId, versionNo, regime, templateId, templateVersion, rulesetVersion, inputHash (sha256 canonical model), textHash (sha256 rendered text), snapshotSealed Bytes (canonical model sealed, slot "willversion:<id>"), documentId (-> Document ownerType WILL), pdfSha256, findingsJson (rule ids + severities only, no PII), generatedOn @db.Date, createdAt; @@unique([willId, versionNo])`. Trigger rejects UPDATE; GRANT SELECT, INSERT (+ DELETE only under app_is_system() for account purge).
- `DocumentOwnerType` gets `WILL` via `ALTER TYPE ... ADD VALUE IF NOT EXISTS` in its OWN earlier migration (e.g. 20261014110000_will_document_owner) — repo already uses ADD VALUE IF NOT EXISTS pattern.
- Main migration e.g. 20261014120000_will_maker: tables, ENABLE+FORCE RLS owner policy (template 20261006170000_document_blob), guarded explicit GRANT to portfolioos_app (guard pattern from 20260922140000_feed_run_log), partial unique index, immutability trigger. Timestamps later than Legacy's 20261013120000.
- Register `Will`, `WillVersion` in USER_SCOPED_MODELS (lib/prisma.ts); account deletion purge (WillVersion -> Will; Documents of type WILL handled by existing document purge - verify).
- Entitlement `WILL_MAKER: 'PLUS'` in shared/src/entitlements.ts FEATURE_MIN_TIER; `requireFeature('WILL_MAKER')`.
- Audit actions (closed union lib/audit.ts): will_created, will_viewed, will_generated, will_downloaded, will_discarded (Part 2: will_execute_upload).

### Payload (shared zod schemas, `packages/shared/src/will/`)
Sections: `details` {legalName, dob, jurisdiction 'IN'|other, personalLaw HINDU|SIKH|JAIN|BUDDHIST|CHRISTIAN|PARSI|MUSLIM|OTHER, address, maritalStatus, hasChildren, hasDependents}, `people` [{id, partyType INDIVIDUAL|ORGANISATION, name, relationship, dob?, contact?, sourceFamilyMemberId?, contingentForId?}], `roles` {executorId, altExecutorId?, guardianId?, altGuardianId?}, `estate` {asOf, items: WillAssetItem[]}, `allocation` {residuary:[{personId, sharePct (string decimal), contingentId?}], specificGifts:[{itemId, personId, sharePct?}], fixedGifts:[{personId, amount}]}, `instructions` {text <=1000}.
WillAssetItem: {sourceKey, side ASSET|LIABILITY, kind, label, maskedRef?, value (string), valueAsOf, ownership {type SOLE|JOINT|NOMINEE_ONLY|HUF, sharePct}, review NEEDS_REVIEW|CONFIRMED|EXCLUDED|STALE, userEdited, note?}.

### API `/api/will` (routes/will.routes.ts; authenticate + requireFeature('WILL_MAKER') + reject X-Act-As (403) + no request-body logging; zod errors mapped to {path, code} only — no PII echo)
- GET / -> versions list (metadata), current draft id/step, indicative estate totals.
- POST /drafts {fromWillId?} -> create or clone (409 if DRAFT exists).
- GET /drafts/:id -> {revision, currentStep, payload, findings}.
- PUT /drafts/:id/sections/:section {revision, data, currentStep} -> autosave; 409 on revision mismatch.
- POST /drafts/:id/estate/refresh -> itemiser + reconcile.
- GET /people/suggestions -> family members quick-pick (names/relations of own family).
- GET /drafts/:id/preview -> rendered AST (summary + document).
- POST /drafts/:id/generate -> rerun validation (422 on BLOCKER) -> render -> PDF -> createDocument (WILL) -> WillVersion -> status GENERATED, supersede previous GENERATED/EXECUTED, all in runInTransaction where possible.
- GET /versions/:vid/pdf -> stream + audit will_downloaded.
- DELETE /drafts/:id -> DISCARDED.

### Estate itemiser (services/will/estate/): adapter per source behind `EstateAdapter {id, version, side, collect(ctx)}`, registry runs with Promise.allSettled (failed adapter -> ESTATE_SOURCE_FAILED warning finding, never swallowed); adapters: holdings (HoldingProjection own portfolios, currentValue ?? totalCost, group per portfolio+class or assetKey), bankAccounts (ACTIVE, jointHolders -> JOINT+NEEDS_REVIEW, nominee note), pfAccounts (suppress/flag EPF/PPF holding classes when PF accounts exist), ownedProperty (non-SOLD, ownershipType/percent), rentalProperty (skip if referenced by OwnedProperty.rentalPropertyId), vehicles (plateOf for masked ref), insurance (sumAssured, NOMINEE_ONLY, excluded from totals), loansGiven, loans (extract `loanOutstanding(loan)` from dashboard.service inline logic into loans.service and make dashboard call it), creditCards. Pure `reconcile(existing, candidates)` keeps user overrides, marks vanished STALE, new NEEDS_REVIEW. Parity test: adapter totals == getDashboardNetWorth totals for a fixture user (document any intentional differences, e.g. bank balances/owned property which dashboard omits — then parity on the overlapping classes only).

### Validation (packages/shared/src/will/validation/): pure rule objects `{id, severity BLOCKER|WARNING|INFO, step, check(model, {today})}`, RULESET_VERSION. Rules: JURISDICTION_INDIA_ONLY(B), MUSLIM_LAW_UNSUPPORTED(B: explain 1/3 rule, recommend legal review — block generation), TESTATOR_ADULT(B), REQUIRED_FIELDS(B), RESIDUARY_SUMS_100(B, Decimal exact 100.00), EXECUTOR_APPOINTED(B), GUARDIAN_IF_MINOR_CHILDREN(B), SPECIFIC_ITEM_OVERALLOCATED(B), GIFT_ON_EXCLUDED_OR_LIABILITY(B), EXECUTOR_GUARDIAN_INDIVIDUAL(B), CONTINGENT_IS_SELF(B), FIXED_GIFTS_EXCEED_NET_ESTATE(W), JOINT_OWNERSHIP_ONLY_SHARE(W), NOMINEE_IS_TRUSTEE_NOTE(I), MINOR_BENEFICIARY(W), HUF_COPARCENARY_SHARE(W), ITEMS_NEED_REVIEW(W), ESTATE_STALE(W, >30 days), UNALLOCATED_ASSETS(W), DOB_MISSING_FOR_PERSON(W), LEGAL_REVIEW_RECOMMENDED(I). Table-driven tests, golden case per rule. Web runs live; API reruns on generate.

### Template (packages/shared/src/will/template/ so web preview == PDF text): typed clause modules per regime `isaHindu.v1.ts` (Hindu/Sikh/Jain/Buddhist -> Indian Succession Act s.57 applies) and `isaGeneral.v1.ts` (Christian/Parsi/other); clause = {id, when?(m), render(m, fmt): Block[]}; AST blocks Heading/Para/NumberedClause/Schedule/SignatureBlock/WitnessBlock; clauses: declaration+revocation, sound mind, executor+alternate, guardian (if minors), specific gifts, fixed gifts (amount in figures + words — move services/receipts/amountInWords.ts to shared), residuary + contingents, lapse/survivorship, debts & liabilities, joint/nominee note, additional instructions (verbatim), attestation (2 witnesses, not beneficiaries); `summary.v1.ts` plain-language summary from the same model; deterministic (`generatedOn` injected, people sorted); `textHash` of renderText(ast); `LOCK.json` with sha256 per template file — test fails if a template changes without version bump; golden snapshot tests per regime. Disclaimer ("not legal advice; passing checks does not guarantee validity; get it reviewed by a qualified advocate") on step 1, review box, PDF footer, and generate confirmation (explicit acknowledgement checkbox, audited).

### PDF (packages/api/src/services/will/willPdf.ts): pdfkit, receiptPdf-style plain white document; bundle fonts in packages/api/assets/fonts/ (NotoSans Regular+Bold for ₹, NotoSansDevanagari; others optional later) + OFL.txt; resolve via import.meta.url path valid from src and dist; script-run splitting for Devanagari; Dockerfile copies packages/api/assets; pinned CreationDate to generatedOn; store via createDocument (WILL) sealed in DocumentBlob.

### Web (apps/web/src/pages/will/): WillOverviewPage (/will), WillWizardPage (/will/:id/:step) wrapped in the existing locked-feature/paywall component; WillStepper (desktop stepper, mobile "Step x of 8"), steps Details/People(tabs Beneficiaries/Executor/Guardian/Others, family quick-pick)/Estate(cards <640px, table above)/Allocation(tabs %/specific/fixed, donut, live total)/Instructions/Review/Preview(summary + document view + download); useWillDraft autosave (debounce ~800ms, flush on Next/Back, expectedRevision, 409 reload banner); live validation via shared rules; dark-mode tokens; 375 px no sideways scroll; no jest-dom. Part 1 nav: add "Will Maker" item next to Goals (Part 2 builds the collapsible Planning group).

### Parts
Part 1 = steps 1-8 (this plan). Part 2 = step 9 (execution guide with verified links: Tele-Law https://www.tele-law.in/ (Govt of India, Dept of Justice; free for eligible, small fee otherwise; citizens app), NALSA https://nalsa.gov.in/ helpline 15100 + online legal aid application; advise checking advocate's State Bar Council enrolment), signed-copy upload, execution details, EXECUTED status, 2-year review reminder + "circumstances changed", Planning sidebar group (Goals, Will Maker, Tax Planning -> /tax).

### Release gate
Template reviewed by a qualified Indian advocate before launch (owner action). v1 India only; Muslim personal law blocked with explanation.
