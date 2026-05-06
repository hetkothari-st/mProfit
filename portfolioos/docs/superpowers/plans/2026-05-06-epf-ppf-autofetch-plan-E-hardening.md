# EPF + PPF Auto-Fetch — Plan E: Production Hardening + Real-World Inputs

> **Deferred from Plans A–D.** Plans A–D shipped the framework, schema, parsers, server-headless adapters, browser extension skeleton, and 8 institution adapters in mock-runnable state. This plan covers the remaining work that requires real-world inputs (live portal access, real PDFs, store accounts, production telemetry).

**Status:** Pending. Each task block can be executed independently as inputs become available.

**Prerequisites:** Plans A, B, C, D shipped (tags `pf-plan-{a,b,c,d}-*`).

---

## Track 1: Real Playwright DOM selectors per bank

Each scrape adapter currently uses placeholder selectors (`<login-url>`, `<username-selector>`, etc.) and runs only in `PF_SCRAPE_MOCK=1` mode. Real selectors must be discovered via live portal walks.

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

### Tasks

- [ ] **Nudge cron** — daily Bull job that scans `ProvidentFundAccount` rows where `lastRefreshedAt < now() - 30 days` AND `status = ACTIVE`. Emit `Alert` row of type `PF_REFRESH_DUE` per stale account.
- [ ] **Alert UI** — `ProvidentFundPage` shows yellow banner per stale account: "Last refreshed 47 days ago. Refresh now?" with one-click button that opens `PfRefreshDialog`.
- [ ] **Email digest** — once weekly digest email summarizing all stale accounts (opt-in via user preferences page).
- [ ] **Snooze** — user can snooze a nudge per-account for 30 days; stored as `lastNudgedAt` + `nudgeSnoozedUntil` on `ProvidentFundAccount`.
- [ ] Commit: `feat(pf): monthly nudge for stale PF accounts`

---

## Track 6: DLQ ops UI

Currently `IngestionFailure` rows are written but no admin UI to triage them.

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

Touchpoints when ready:
- Partnership with TSP (Setu / Finvu / OneMoney / CAMS Finserv)
- New `AAConnection` model alongside `ProvidentFundAccount` for AA-sourced accounts
- New adapter id space `pf.aa.<tsp>.<inst>.v1`
- Consent + revocation lifecycle (FIP/FIU spec)

---

## Track 8: Performance + scale

Once telemetry exists:

- [ ] Index audit: `EXPLAIN ANALYZE` on `CanonicalEvent` queries by `(userId, sourceHash)`, `(userId, eventDate)` — most likely already covered by existing indexes from Plan A schema
- [ ] Bull worker concurrency tuning — currently default; raise to 5–10 concurrent fetches per worker
- [ ] Playwright browser pool — keep 2–3 browser contexts warm to avoid cold-start overhead per fetch
- [ ] HTTP request rate-limit per user per institution — already implemented as 1 fetch / 6 hr per account; verify in production

---

## Execution order recommendation

1. **Track 5 (Nudge)** — small, ships immediately, improves stickiness
2. **Track 6 (DLQ UI)** — needed before Track 1 begins (otherwise can't triage failures)
3. **Track 1 + Track 2 in parallel, per bank** — discover selectors + tune parser together; bank-by-bank
4. **Track 4 (Hardening)** — kicks in once any bank shows >20% detection rate in production
5. **Track 3 (Extension full + store)** — independent track; can start any time once designer + dev account ready
6. **Track 7 (AA)** — long-tail, separate planning cycle
7. **Track 8 (Perf)** — driven by production telemetry, post-launch

---

## What's NOT in Plan E

- New asset class beyond PF (NPS, EPF–FD hybrids, etc.) — separate spec
- Multi-currency PPF (NRI accounts) — out of v2 scope
- Cross-bank aggregated dashboard widgets — Plan F polish

---

## Self-review

Plan E covers: real-world inputs (Tracks 1, 2), browser extension full delivery (Track 3), bot-detection (Track 4), nudge UX (Track 5), ops tooling (Track 6), and far-future AA (Track 7), plus performance (Track 8).

All tasks are testable individually; each track is a candidate for a separate sub-plan when the user is ready to execute it.
