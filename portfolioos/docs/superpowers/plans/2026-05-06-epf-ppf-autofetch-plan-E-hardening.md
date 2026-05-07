# EPF + PPF Auto-Fetch — Plan E: Production Hardening + Real-World Inputs

> **Deferred from Plans A–D.** Plans A–D shipped the framework, schema, parsers, server-headless adapters, browser extension skeleton, and 8 institution adapters in mock-runnable state. This plan covers the remaining work that requires real-world inputs (live portal access, real PDFs, store accounts, production telemetry).

**Status:** Partially complete. See progress table below.

**Last updated:** 2026-05-07.

**Prerequisites:** Plans A, B, C, D shipped (tags `pf-plan-{a,b,c,d}-*`).

---

## Progress snapshot (2026-05-07)

| Track | Status | What's done | What remains |
|-------|--------|-------------|--------------|
| 1 — Real DOM selectors | ⛔ NOT STARTED | — | Full track. Blocked on live portal access. |
| 2 — Parser tuning | ⛔ NOT STARTED | — | Full track. Blocked on real PDFs. |
| 3 — Extension store-readiness | 🟡 PARTIAL | Icons (placeholder rendered), `PRIVACY.md` + `/privacy` route, `STORE_LISTING.md`, `RELEASE.md` | Real designer icons + screenshots, store dev account signups, real privacy email, content scripts for 6 banks |
| 4 — Bot-detection hardening | 🟡 PARTIAL | `stealth.ts` shared helper (UA pool, viewport pool, click/type delays, Bezier mouse). Applied to EPFO + SBI adapters. | Apply to remaining 6 bank adapters (after their real DOM selectors land in Track 1). Residential proxy rotation (after detection telemetry collected). |
| 5 — Monthly nudge | ✅ DONE | Schema fields, `pfNudges.service.ts`, daily 9am IST cron, snooze endpoint, yellow banner UI on ProvidentFundPage | — |
| 6 — DLQ ops UI | ✅ DONE | List/get/retry/resolve endpoints, `IngestionFailuresPage.tsx`, sidebar nav entry | Admin overlay (deferred — not yet needed) |
| 7 — Account Aggregator | ⛔ NOT STARTED | — | Full track. Blocked on TSP partnership + NBFC-AA license decision + legal review. |
| 8 — Performance + scale | 🟡 PARTIAL | pino `duration_ms` logging, `@sentry/node` SDK + `lib/sentry.ts` (no-op until DSN set), `lib/metrics.ts` counter scaffold, `pf.fetch.success/failure/duration_ms` counters in worker | Real Sentry DSN registration (user action), production telemetry collection, query-plan analysis (needs ≥100 concurrent users), browser pool sizing |

**Tags shipped so far:** `pf-plan-{a,b,c,d}-*` + `pf-plan-e-tracks-5-6`. Plan E partial work for Tracks 3/4/8 is on `main`, untagged.

---

## Input requirements summary

Updated 2026-05-07. Inputs needed to unblock the remaining work on each track.

| Track | Status | Outstanding blocking inputs |
|-------|--------|-----------------------------|
| 1 — Real DOM selectors | BLOCKED | Live netbanking accounts × 8 institutions; UAN with passbook access; CAPTCHA samples; mobile + email for OTP |
| 2 — Parser tuning | BLOCKED | ≥5 anonymized real passbook PDFs per institution (40 PDFs total); CII table |
| 3 — Extension full + store | PARTIAL — store-prep done | Real designer icons + screenshots; Chrome WebStore $5 dev account; Firefox AMO account; real privacy contact email; Track 1 inputs (for the 6 bank content scripts) |
| 4 — Bot-detection hardening | PARTIAL — preemptive hardening shipped | Production telemetry baseline (≥100 fetches across institutions); residential proxy budget ($50–200/mo); DLQ telemetry from Track 6 |
| 5 — Monthly nudge | ✅ DONE | — |
| 6 — DLQ ops UI | ✅ DONE | — |
| 7 — Account Aggregator | BLOCKED | TSP partnership; NBFC-AA license decision; legal review; per-fetch fee budget |
| 8 — Performance + scale | PARTIAL — APM scaffolded | Real Sentry DSN (free-tier signup at sentry.io); production users for telemetry collection; APM dashboards built once data flows |

### Categorized procurement list

**User actions (cannot be automated):**
- Chrome Web Store dev account ($5)
- Firefox AMO dev account (free)
- Hosted privacy policy URL
- Decision on TSP partnership for AA
- Decision on access-control model for DLQ UI

**Procurement (paid):**
- Designer (icons + store hero/screenshots): one-shot ~$500–1500
- Residential proxy pool (post-detection): ~$50–200/month ongoing
- APM tooling (Sentry, Datadog, New Relic): free tier ok initially
- TSP partnership (AA): per-fetch fees ~₹2–10 each, scale-dependent

**Field collection (privacy-sensitive):**
- ≥40 anonymized real passbook PDFs across 8 institutions
- 20–50 CAPTCHA images per portal (8 portals)
- HAR recordings of login → download flows per portal
- ≥1 OTP-receivable mobile + email per institution test account

**Compliance:**
- Anonymization workflow for passbook PDFs (no real PII to staging/dev)
- DPDPA 2023 review before AA work
- RBI Master Direction on AA review (if pursuing FIU license)
- PII redaction audit on `IngestionFailure.rawPayload` before opening DLQ to non-admins

**Outstanding user-blocking actions (gate everything else):**

1. **Sentry DSN** — sign up free at sentry.io → create project → set `SENTRY_DSN` in Railway env. Unlocks Track 8 telemetry. Zero cost.
2. **Live netbanking discovery walks** — schedule one focused session per institution (45–90 min each). Unlocks Tracks 1, 2 (per-bank), and the rest of 3 (content scripts).
3. **Chrome Web Store dev account** ($5) + **Firefox AMO** (free). Unlocks Track 3 final submission.
4. **Real privacy email** + **support email** — register `privacy@portfolio-os.in` and `support@portfolio-os.in` (or pick alternates). Unlocks store submission listing.
5. **Designer hand-off** — icons (16/48/128 + svg) + store hero (1280×800) + screenshots (1280×800 × 4–5). Unlocks store submission visuals.
6. **TSP partnership decision** for AA (Track 7) — multi-month, separate planning cycle.

---

## Track 1: Real Playwright DOM selectors per bank

Each scrape adapter currently uses placeholder selectors (`<login-url>`, `<username-selector>`, etc.) and runs only in `PF_SCRAPE_MOCK=1` mode. Real selectors must be discovered via live portal walks.

### Required inputs

- **Live netbanking accounts** at each of: SBI, India Post, HDFC, ICICI, Axis, PNB, Bank of Baroda. Test accounts ideal; real personal accounts work but limit to verified-non-destructive read-only flows.
- **Live EPFO UAN** with passbook access enabled (mobile linked, KYC complete).
- **Browser DevTools recording** of one full successful login → PPF/passbook → download cycle per portal. Save HAR files to `packages/api/test/portal-walks/<inst>/` for reference.
- **CAPTCHA samples** — collect 20–50 CAPTCHA images per portal (saved as PNG) for OCR confidence tuning.
- **Mobile + email** for OTP receipt on every test account.
- **VPN if Railway egress IP gets blocked during discovery walks** — discovery should ideally happen from the Railway egress, not a developer laptop, to surface IP-based blocking early.

### Per-bank task (template)

For each of: `EPFO`, `SBI`, `INDIA_POST`, `HDFC`, `ICICI`, `AXIS`, `PNB`, `BOB`:

- [ ] **Discovery walk** — log into portal manually with a real account. Record:
  - Login URL (post-redirect)
  - Username/UAN field selector
  - Password field selector
  - CAPTCHA image selector (if present)
  - CAPTCHA input field selector
  - OTP step trigger (URL or DOM marker)
  - OTP input selector + submit
  - PPF/passbook navigation path (URL or click chain)
  - Statement download trigger (button/link selector)
  - Multi-account selector if user has multiple accounts at same bank
- [ ] **Update adapter** at `packages/api/src/adapters/pf/{epf|ppf}/<inst>.v1.ts`:
  - Replace `<login-url>` with real URL
  - Replace each `<...-selector>` with real selector
  - Validate event flow (CAPTCHA → OTP → navigate → download)
  - Add per-bank quirks (popup blockers, modal dismissals, terms-and-conditions checkboxes, etc.)
- [ ] **End-to-end smoke** — fetch real passbook with `PF_SCRAPE_MOCK=` unset
- [ ] **Bump adapter version** if any DOM/structure assumption changed (`v1` → `v2`)
- [ ] **Commit**: `feat(pf): real DOM selectors for <Bank> PPF adapter`

### Discovery priority order

1. EPFO (already partially real — needs verification of every selector)
2. SBI (largest PPF market share)
3. ICICI
4. HDFC
5. Axis
6. India Post (most fragile portal — likely needs custom retry logic)
7. PNB
8. Bank of Baroda

---

## Track 2: Real passbook parser tuning

Each parser uses a synthetic pdfkit-generated fixture. Real PDFs differ in column widths, header layout, and date formats. Parser regexes need tuning when real samples arrive.

### Required inputs

- **≥5 real anonymized passbook PDFs per institution** (8 × 5 = 40 PDFs minimum). Anonymization rules:
  - Mask account number → keep last 4 digits only
  - Mask name → "TEST USER"
  - Mask PAN → "XXXXX" + last 4 chars
  - Mask employer name (EPFO) → "TEST EMPLOYER PRIVATE LIMITED"
  - Keep ALL dates, amounts, descriptions, transaction codes, balances unchanged
  - Keep page layout, font, column widths intact (do NOT re-render from text — preserves true PDF structure)
- **Anonymization tool** — `pdftk` + `qpdf` for in-place text edits, or rasterize-and-OCR-rewrite via `pdf2image` + Tesseract.
- **Edge-case sample seeking:** PPF accounts opened pre-2014, EPFO multi-establishment passbooks, withdrawal entries, transfer-in/out rows.
- **CII (Cost Inflation Index) table** — current CBDT-notified values, FY 2001-02 through current FY. Source: incometax.gov.in or NSDL.

### Per-bank task

For each institution:

- [ ] Collect ≥5 anonymized real passbook PDFs (mask account number, name, PAN — keep dates + amounts + descriptions)
- [ ] Add to `packages/api/test/fixtures/pf/<inst>/real/`
- [ ] Run existing parser against real PDFs. If row regex misses lines:
  - Inspect tokenizer output (`tokenizePassbookPdf`) for that bank
  - Tighten or loosen `ROW_RE` per real-statement format
  - Re-run snapshot tests with `-u` to lock new behavior
- [ ] Add a "real-format" snapshot test alongside the existing synthetic snapshot
- [ ] Commit: `feat(pf): tune <Bank> passbook parser for real-statement formats`

### CII table (deferred from Plan A bug list)

EPFO interest credit lines need year-specific interest rate validation (FY-aware). Add `lib/epfoInterestRates.ts` with per-FY rate table (8.15%, 8.25%, …) for sanity-check at parse time.

---

## Track 3: Browser extension full coverage + store packaging

**Status (2026-05-07):** PARTIAL — store-prep + privacy + listing copy + placeholder icons shipped on `main`. Real content scripts for 6 banks + designer artwork + store submission still pending.

### Done

- `extension/scripts/generate-icons.mjs` — generates 16/48/128 PNGs (teal background + white "P"). Output committed at `extension/icons/icon-{16,48,128}.png` (placeholder, designer-replaceable).
- `extension/PRIVACY.md` — full privacy policy text.
- `apps/web/src/pages/legal/PrivacyPage.tsx` + public `/privacy` route in `App.tsx` — privacy policy hosted at `https://portfolio-os.up.railway.app/privacy`.
- `extension/STORE_LISTING.md` — Chrome Web Store name, short/detailed description, keywords, category, languages.
- `extension/RELEASE.md` — pre-release checklist + Chrome Web Store + Firefox AMO submission runbook.

### Required inputs

- **Live netbanking access** for content-script DOM walks (same accounts as Track 1)
- **Designer-supplied icons:** 16/48/128 PNG (square, transparent bg, app-style) + source `.svg`
- **Designer-supplied store assets:** hero (1280×800), small tile (440×280), marquee tile (1400×560 optional), 4–5 screenshots (1280×800)
- **Privacy policy hosted at a stable URL.** Draft text in `CLAUDE.md` §15. Extract to `extension/PRIVACY.md`, host at `https://portfolio-os.up.railway.app/privacy`.
- **Chrome Web Store dev account** — $5 one-time, Google account + 2FA. **User action.**
- **Firefox AMO dev account** — free, Mozilla account. **User action.**
- **Listing copy** — name (≤45 chars), short description (≤132 chars), detailed description (≤16k chars), 3–5 keywords. Localize EN-US + EN-IN if budget allows.
- **Support email + website URL** for store listing.
- **CSR / CRX signing** — Chrome auto-signs on submit; Firefox optionally signs via `web-ext sign`.

### Content scripts for remaining 6 banks

Currently shipped: EPFO (real), SBI (placeholder). Remaining 6 banks need real content scripts.

For each: `INDIA_POST`, `HDFC`, `ICICI`, `AXIS`, `PNB`, `BOB`:

- [ ] Add to `extension/manifest.json` `host_permissions` and `content_scripts`
- [ ] Create `extension/src/content/<inst>.ts` — DOM walk for that bank's PPF passbook page
- [ ] Add `<inst>` entry to `extension/build.mjs`
- [ ] Verify `npm run build` produces `dist/content-<inst>.js`
- [ ] Commit per bank: `feat(extension): <Bank> content script`

### Real extension icons + branding

Currently 1×1 transparent PNG placeholders.

- [ ] Designer hands off 16/48/128 PNG icons (square, app-style)
- [ ] Hands off store hero (1280×800), small tile (440×280), screenshots (1280×800 × 4–5)
- [ ] Drop into `extension/icons/` and `extension/store-assets/`
- [ ] Commit: `feat(extension): real icons + store assets`

### Chrome Web Store submission

Requires user action (paid + manual upload):

- [ ] Create Chrome Web Store dev account ($5 one-time fee)
- [ ] Privacy policy hosted (text already drafted in `CLAUDE.md` §15 — extract to `extension/PRIVACY.md` and host on portfolio-os marketing site)
- [ ] Run `npm run build` then zip `extension/dist/`
- [ ] Upload to dev console → fill listing → submit for review (~3–7 days)
- [ ] Note assigned `extension_id` — update web pairing instructions to "Install from Chrome Web Store" once approved

### Firefox AMO submission

- [ ] Create AMO dev account (free)
- [ ] Mozilla MV3 quirks: service worker → background page fallback in some Firefox versions; check `manifest.json` compatibility
- [ ] Submit XPI for review
- [ ] Update pairing instructions

### Auto-update channel

Once on stores, store distribution handles updates. For unpacked-dev installs, document manual update procedure in `extension/README.md`.

---

## Track 4: Bot-detection hardening

Server-headless Playwright adapters can be detected by anti-bot WAFs (Cloudflare, Akamai, PerimeterX). Production telemetry will reveal which banks block.

**Status (2026-05-07):** PARTIAL — preemptive hardening shipped on `main`. Production tuning (proxy rotation, headed-fallback) still pending.

### Done

- `packages/api/src/adapters/pf/shared/stealth.ts` — UA pool (5 real Chrome strings), viewport pool (5 desktop sizes), `newStealthContext()`, `jitter()`, `clickDelay()`, `typeDelay()`, Bezier-curve `humanMouseMoveTo()`.
- Applied to `epfo.v1.ts` and `sbi.v1.ts`: `browser.newPage()` replaced by `newStealthContext(browser)`; `page.fill()` calls replaced by `page.type()` + `typeDelay()` for per-char human-typing delays; `clickDelay()` added to every `page.click()`.

### Required inputs

- **Production traffic baseline** — ≥100 real fetch attempts across the 8 institutions before deciding what to harden. Without telemetry, hardening is speculative.
- **Per-institution detection threshold defined up front** — e.g. "rotate to residential proxies once block rate >20% over a rolling 7-day window."
- **Residential proxy budget** — BrightData / Smartproxy / Oxylabs. Pricing ≈ $5–10 per GB; PPF fetch is ~2–5 MB per session, so budget ≈ $50–200/month for full 7-bank coverage at moderate frequency.
- **DLQ telemetry** (depends on Track 6) — must be live before this track can be data-driven.
- **Headed-browser fallback infra** — if WAFs catch headless even with stealth, may need Playwright in headed mode on a VNC-accessible Linux container. Cost + complexity higher; defer until evidence demands.

### Tasks

- [ ] **Stealth plugin verification** — `playwright-extra` + `puppeteer-extra-plugin-stealth` already installed. Check version is current; many newer detection vectors patched in recent stealth releases.
- [ ] **UA rotation** — pool of 5–10 real Chrome desktop UA strings; pick at random per session; pin per session for consistency
- [ ] **Realistic timing** — `page.click({ delay: random(50, 200) })`, `page.fill({ delay: random(30, 100) })` between every action
- [ ] **Mouse trajectory** — `page.mouse.move()` along a non-linear path before clicks (most stealth plugins miss this)
- [ ] **Viewport randomization** — pick from common desktop sizes (1920×1080, 1536×864, 1440×900)
- [ ] **Egress IP** — Railway shared egress will eventually get listed. Plan budget for residential proxy pool (BrightData, Smartproxy) once detection rate exceeds threshold (>20% per bank).

### Per-bank detection telemetry

Add a `detection_signal` field to `PfFetchSession.errorMessage` parsing:
- "Forbidden" / 403 → `WAF_BLOCKED`
- "Cloudflare" challenge page → `CF_CHALLENGE`
- "session expired" mid-flow → `SESSION_KILLED`
- DOM mismatch → `DOM_DRIFT` (likely just a selector update needed, not detection)

Surface in DLQ ops UI for triage.

---

## Track 5: Monthly nudge + alert center wiring

Spec §12 milestone 11. Cadence per Q5 decision = on-demand + monthly nudge.

**Status (2026-05-07):** ✅ DONE — tag `pf-plan-e-tracks-5-6`.

### Done

- Migration `20260506150000_pf_nudge_fields` added `PF_REFRESH_DUE` to `AlertType` and `lastNudgedAt` / `nudgeSnoozedUntil` columns to `ProvidentFundAccount`.
- `packages/api/src/services/pfNudges.service.ts` — `emitStaleAccountAlerts()` (30-day stale threshold, 7-day re-nudge interval, snooze-aware, dedup on metadata key) and `snoozeNudge()`.
- `packages/api/src/jobs/pfNudgeJob.ts` — daily 9am IST cron via BullMQ repeatable. Registered in `startupSync.ts`.
- `POST /api/epfppf/accounts/:id/snooze-nudge` endpoint.
- `apps/web/src/pages/assetClasses/ProvidentFundPage.tsx` — yellow banner above stale account cards with "Snooze 30d" + "Refresh now" buttons.

### Tasks

- [ ] **Nudge cron** — daily Bull job that scans `ProvidentFundAccount` rows where `lastRefreshedAt < now() - 30 days` AND `status = ACTIVE`. Emit `Alert` row of type `PF_REFRESH_DUE` per stale account.
- [ ] **Alert UI** — `ProvidentFundPage` shows yellow banner per stale account: "Last refreshed 47 days ago. Refresh now?" with one-click button that opens `PfRefreshDialog`.
- [ ] **Email digest** — once weekly digest email summarizing all stale accounts (opt-in via user preferences page).
- [ ] **Snooze** — user can snooze a nudge per-account for 30 days; stored as `lastNudgedAt` + `nudgeSnoozedUntil` on `ProvidentFundAccount`.
- [ ] Commit: `feat(pf): monthly nudge for stale PF accounts`

---

## Track 6: DLQ ops UI

Currently `IngestionFailure` rows are written but no admin UI to triage them.

**Status (2026-05-07):** ✅ DONE — tag `pf-plan-e-tracks-5-6`.

### Done

- `GET /api/ingestion-failures` — cursor pagination + `adapter` / `since` / `resolved` filters.
- `GET /api/ingestion-failures/:id` — full detail.
- `POST /api/ingestion-failures/:id/retry` — re-fetches Gmail emails and re-runs `processEmail`. PF/vehicle/valuation adapters return `BadRequestError` (not re-runnable without live sessions).
- `POST /api/ingestion-failures/:id/resolve` — accepts `manual_entry | ignored | fixed_externally`.
- `apps/web/src/pages/ops/IngestionFailuresPage.tsx` — adapter search, filter chips (All / Unresolved / Resolved), retry button (Gmail-only), expand-to-detail dialog, cursor "Load more" pagination.
- Sidebar nav entry "Failures (DLQ)" under Tools; `/ops/ingestion-failures` route alias in `App.tsx`.

### Deferred (not yet needed)

- Admin overlay (cross-user view) — gated behind a future `User.isAdmin` flag if/when an internal-ops use-case appears.
- Auto-purge cron for resolved entries (>90 days) — defer until table size warrants.

### Tasks

- [ ] **Page** `apps/web/src/pages/ops/IngestionFailuresPage.tsx`:
  - List failures grouped by `sourceAdapter`
  - Filter by date range, institution, error class
  - Per-row: view raw payload (collapsible JSON), error message, source ref, "Retry" button, "Mark resolved" button
- [ ] **Server retry endpoint** `POST /api/ingestion-failures/:id/retry`:
  - Re-runs the same adapter with stored raw payload (skip scrape, only re-parse)
  - Useful when parser was updated and old failures should now succeed
- [ ] **Manual entry shortcut** — link from a failure to the "Add transaction" dialog with raw payload pre-populated as best-effort defaults
- [ ] Commit: `feat(ops): DLQ triage page for ingestion failures`

---

## Track 7: Account Aggregator (AA) integration — far future

Spec §1 mentioned AA as the strongest long-term path. Plan E does NOT cover this — separate planning cycle once Plans A–D + this Plan E's hardening tracks stabilize.

### Required inputs

- **TSP partnership decision** — pick one: Setu, Finvu, OneMoney, CAMS Finserv, NESL, Anumati. Each has different pricing + onboarding speed.
- **NBFC-AA license decision** — become an FIU yourself (RBI license, 6+ months, ₹2 cr capital) OR consume via TSP white-label (faster, recurring fee).
- **Per-fetch fee budget** — typical ₹2–10 per FI fetch via TSP. At 10k users × monthly fetch × 7 institutions ≈ ₹14–700/month at scale. Manageable.
- **Pricing-model decision** — pass cost to user, eat as COGS, or gate behind paid tier?
- **Compliance review** — RBI Master Direction on AA + DPDPA 2023 alignment. Engage fintech-compliance lawyer.
- **Production cohort** — 50–100 beta users to validate AA UX before broad rollout.

Touchpoints when ready:
- Partnership with TSP (Setu / Finvu / OneMoney / CAMS Finserv)
- New `AAConnection` model alongside `ProvidentFundAccount` for AA-sourced accounts
- New adapter id space `pf.aa.<tsp>.<inst>.v1`
- Consent + revocation lifecycle (FIP/FIU spec)

---

## Track 8: Performance + scale

**Status (2026-05-07):** PARTIAL — APM + metrics scaffolding shipped on `main`. Real-world telemetry tuning still pending.

### Done

- `packages/api/src/index.ts` pinoHttp now emits `duration_ms` per request log line (machine-parseable for log shipping).
- `@sentry/node` v10 installed; `packages/api/src/lib/sentry.ts` with `initSentry()` (no-op when `SENTRY_DSN` unset) + `Sentry.setupExpressErrorHandler(app)` wired into Express middleware chain.
- `SENTRY_DSN=` placeholder added to `.env.example`.
- `packages/api/src/lib/metrics.ts` — counter scaffold with `incCounter()` / `getCounters()` / `dumpAndResetCounters()`.
- `pf.fetch.success` / `pf.fetch.failure` / `pf.fetch.duration_ms` counters emitted from `pfFetchWorker.ts`.

### Required inputs (remaining)

- **Real Sentry DSN** — sign up free at sentry.io → create Node.js project → set `SENTRY_DSN` in Railway env vars. Zero cost on the free tier (5k events/month). User action.
- **Realistic user load** — 100+ concurrent active users with 1000+ transactions each before perf work matters.
- **Database query plan visibility** — Postgres `pg_stat_statements` extension enabled (Neon supports this; flip on via Neon console).
- **Browser pool sizing target** — pick max concurrent fetches per worker (e.g. 5). Drives memory budget for Railway service plan.

Once telemetry exists:

- [ ] Index audit: `EXPLAIN ANALYZE` on `CanonicalEvent` queries by `(userId, sourceHash)`, `(userId, eventDate)` — most likely already covered by existing indexes from Plan A schema
- [ ] Bull worker concurrency tuning — currently default; raise to 5–10 concurrent fetches per worker
- [ ] Playwright browser pool — keep 2–3 browser contexts warm to avoid cold-start overhead per fetch
- [ ] HTTP request rate-limit per user per institution — already implemented as 1 fetch / 6 hr per account; verify in production

---

## Execution order recommendation

Updated 2026-05-07 — Tracks 5, 6 done; Tracks 3, 4, 8 partial.

1. ~~**Track 5 (Nudge)**~~ ✅ shipped
2. ~~**Track 6 (DLQ UI)**~~ ✅ shipped
3. ~~**Track 4 preemptive hardening**~~ ✅ shipped (UA pool + delays + Bezier mouse on EPFO + SBI). Real-world tuning waits on telemetry.
4. ~~**Track 8 APM scaffolding**~~ ✅ shipped. Activate by setting `SENTRY_DSN`.
5. ~~**Track 3 store-prep**~~ ✅ shipped (placeholder icons, privacy policy, listing copy, release runbook). Real submission waits on designer + store dev accounts.
6. **Track 1 + Track 2 in parallel, per bank** — discover selectors + tune parser together; bank-by-bank. Largest remaining work.
7. **Track 3 final** — content scripts for 6 banks (after Track 1) + real designer artifacts + store submission.
8. **Track 4 production tuning** — proxy rotation once any bank shows >20% detection rate.
9. **Track 8 production tuning** — query plan analysis once ≥100 concurrent users.
10. **Track 7 (AA)** — long-tail, separate planning cycle.

---

## What's NOT in Plan E

- New asset class beyond PF (NPS, EPF–FD hybrids, etc.) — separate spec
- Multi-currency PPF (NRI accounts) — out of v2 scope
- Cross-bank aggregated dashboard widgets — Plan F polish

---

## Self-review

Plan E covers: real-world inputs (Tracks 1, 2), browser extension full delivery (Track 3), bot-detection (Track 4), nudge UX (Track 5), ops tooling (Track 6), and far-future AA (Track 7), plus performance (Track 8).

All tasks are testable individually; each track is a candidate for a separate sub-plan when the user is ready to execute it.
