# Contract-Note Ingestion — Pending Work & Requirements

**Status:** scaffold + LLM parser + recipe cache **shipped**. Sample collection + several extensions still open.
**Last updated:** 2026-05-06
**Owners:** broker-ingestion track

---

## 1. What's already shipped

| Module | Path | What it does |
|---|---|---|
| Broker registry | `packages/api/src/data/brokers.ts` | Top-25 Indian-broker metadata: sender patterns, PDF keywords, password rule, exchanges. Helpers `detectBrokerFromEmail`, `detectBrokerFromPdfText`, `getBrokerById`. |
| Mailbox routing | `packages/api/src/jobs/mailboxPoller.ts` (`inferBroker`) | Email → broker label via registry. |
| Fixture scaffold | `packages/api/test/fixtures/contract_note/<broker>/` | 25 dirs (Zerodha pre-existing, 24 new). README documents anonymisation rules + naming. |
| Generic LLM parser | `packages/api/src/services/imports/parsers/genericBrokerContractNote.parser.ts` | PDF → broker detect → reuse `parseEmailWithLlm` → map `ParsedEvent[]` → `ParsedTransaction[]`. Registered after Zerodha in `FILE_IMPORT_ADAPTERS`. |
| System-prompt extension | `packages/api/src/ingestion/llm/system-prompt.txt` | Added explicit equity-row guidance for PDF text accuracy. |
| Recipe cache | `packages/api/src/ingestion/contractNoteTemplates.ts` | Sample storage + column-position synthesis + applier + miss/decay. Reuses `LearnedTemplate` keyed by `senderAddress = "cn:<brokerId>"`. Promotes after 3 same-(broker, hash) agreeing samples. |

**Run-time pipeline (live):**

```
PDF arrives → readPdfText (PAN/DOB unlock)
            → detectBrokerFromPdfText
            → bodyStructureHash
            → findActiveContractNoteRecipe
                ├ HIT  → applyContractNoteRecipe → trades (zero LLM)
                │       on miss → recordMiss → fall through
                └ MISS → parseEmailWithLlm (Haiku 4.5)
                       → recordContractNoteSample (fire-forget)
            → ParsedTransaction[]
```

---

## 2. Pending work — by priority

### P0 — Sample collection (BLOCKER for everything below)

**Status:** dirs exist, all empty (except Zerodha).

**Required:** Drop ≥3 anonymised contract notes per broker into `packages/api/test/fixtures/contract_note/<broker>/`. Without these, recipe synthesis can't promote anything for the other 24 brokers and golden-test snapshots can't be generated.

**Anonymisation rules** (already documented in fixture README — copy here for reference):

| Field | Replace with |
|---|---|
| Full PAN | `XXXXX1234` (preserve last 4) |
| Aadhaar | `XXXX XXXX 1234` |
| Account / DP / client codes >6 digits | `XXXX1234` |
| Investor name | `TEST USER` |
| Phone | `XXXXXXX1234` |
| DOB | `01-Jan-1990` |
| Email | `test@example.com` |

**Filename convention:** `<broker>-<segment>-<sequence>.{txt,pdf,html}` e.g. `groww-eq-01.txt`.

**Per-broker minimum (5 samples each):**
1. Equity delivery BUY
2. Equity delivery SELL
3. Equity intraday round-trip
4. F&O futures (if broker supports)
5. F&O options CE + PE (if broker supports)

**Brokers awaiting samples (24):**
groww · upstox · angel-one · icici-direct · hdfc-securities · kotak-securities · sharekhan · motilal-oswal · 5paisa · edelweiss · iifl · sbi-securities · axis-direct · paytm-money · dhan · fyers · religare · anand-rathi · geojit · ventura · nirmal-bang · choice · aliceblue · mstock

---

### P1 — Golden-test snapshots per broker

**Status:** infra exists (`packages/api/test/fixtures/parsers.fixtures.test.ts`), only Zerodha snapshots present.

**Work:** once samples for each broker land, run the test suite once to seed snapshots, then commit. CI will then fail on parser drift.

**Acceptance:** every broker fixture file has a corresponding entry in `parsers.fixtures.test.ts.snap`.

---

### P1 — F&O recipe synthesis

**Status:** v1 recipe cache covers equity rows only. F&O contract notes always burn LLM budget.

**Why deferred:** F&O contract-note layouts vary per broker:
- Some put symbol on one line (`BANKNIFTY26NOV24500CE`), qty + price on next.
- Some inline everything: `BANKNIFTY26NOV24500CE B 50 245.30`.
- Strike + expiry encoding varies (monthly vs weekly).

**Required design:**
- Multi-line row pattern: capture group across 2-3 consecutive lines, with `\n` allowed.
- Recipe shape extension: `tradeLinePattern` becomes `tradeLinePatterns: string[]` OR `multiLine: { rowSpan: number, pattern: string }`.
- Strike/expiry decoder per option-symbol convention (already in Zerodha parser — generalise).

**Acceptance:** drop 3 same-format F&O contract notes from one broker → recipe promotes → 4th F&O PDF extracts trades without LLM call.

---

### P2 — OCR for scanned-image PDFs

**Status:** parser warns "PDF contains no extractable text — OCR not yet supported".

**Why open:** Some users still get image-only PDFs (older brokers, fax-relayed contract notes).

**Required design:**
- Lazy-load `tesseract.js` (already in repo for EPFO captcha — `packages/api/src/lib/captchaSolver.ts` uses it).
- Detect zero-text PDFs in `readPdfText`; if zero text but pages > 0, render each page to PNG via `pdfjs-dist` viewport, OCR the PNG.
- Bounded by per-job timeout (5 min).

**Acceptance:** scanned Zerodha contract note → text extracted → existing Zerodha regex parser runs.

---

### P2 — Per-broker LLM-budget tracking

**Status:** existing `LlmSpend` ledger is per-user, not per-broker. Hard to see "which broker is burning budget?" without ad-hoc SQL.

**Required:**
- Add a per-broker breakdown view to the existing `/settings` LLM-budget panel.
- Group `LlmSpend` rows by `purpose` (already prefixed `contract_note_parse:<brokerId>`).
- Surface "promote-stuck brokers" — brokers with sampleCount ≥ 3 but `cn-sampling` state still (synthesis disagreement loop).

**Acceptance:** settings page shows `<broker>: <count> LLM calls, ₹<inr>/mo, recipe state: <sampling/promoted/disagreed>`.

---

### P2 — Recipe debugging UI

**Status:** recipe state lives only in `LearnedTemplate.extractionRecipe` JSON. No way for end-user to inspect or reset.

**Required:**
- `/settings/templates` page listing every `LearnedTemplate` row for the user.
- Per-row: broker, structureHash, state (sampling/promoted), sampleCount, confidenceScore, lastUsedAt.
- Actions: "view samples", "deactivate template", "force re-promotion".
- Forced re-promotion clears samples but keeps the row inactive — next eligible PDF starts a new sampling cycle.

**Acceptance:** user can see why their broker is still calling LLM on every PDF, and can manually reset a stuck recipe.

---

### P3 — Confidence-based template fallback

**Status:** v1 deactivates on 2 consecutive misses. Coarse.

**Required:**
- Soft-confidence: track rolling success rate over last N applications.
- If success rate < 80%, mark template as "weak" — use it but ALSO call LLM, compare results, log discrepancies.
- After M weak applications, force re-sampling.

**Acceptance:** silent format drift (e.g. broker adds new column that pushes existing columns by 1) is detected without user complaint.

---

### P3 — Multi-user template sharing

**Status:** every recipe is per-user (RLS enforced). Same Groww format learned independently for every user.

**Why open:** wasteful on LLM budget. If user A has a promoted recipe for Groww-format-X, user B's first Groww PDF could reuse it.

**Required:**
- New `SharedLearnedTemplate` table (or `LearnedTemplate.scope = 'GLOBAL'` flag).
- Privacy: shared recipes carry NO sample payload (only column tuple + structureHash + brokerId).
- Per-user override: if user has a personal recipe for same `(brokerId, structureHash)`, prefer it.

**Acceptance:** user B's first Groww PDF extracts via recipe (zero LLM) because user A already promoted that hash.

---

### P3 — Adapter framework retrofit (CLAUDE.md §5.1 task 7)

**Status:** parsers still use legacy `Parser` interface; CLAUDE.md spec wanted them wrapped in the canonical `Adapter<TInput, TOutput>` interface.

**Required:** wrap `genericBrokerContractNoteParser` (and Zerodha) in the `Adapter` interface, emit `CanonicalEvent[]` first, project to `Transaction[]` second.

**Note:** big refactor — not blocking new feature work. Defer until §5.1 hardening sprint formally restarts.

---

## 3. Operational requirements

### Environment variables (production)

| Var | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (for LLM path) | — | Claude API auth |
| `ENABLE_LLM_PARSER` | Yes | `false` (prod) | Belt-and-suspenders gate per CLAUDE.md §16 G5 |
| `ANTHROPIC_ZERO_RETENTION_CONFIRMED` | Yes | `false` | Confirms zero-retention toggle is on in Anthropic console |
| `LLM_MODEL` | No | `claude-haiku-4-5-20251001` | Override via `AppSetting.llm.model` |

### AppSetting rows (already seeded)

- `llm.monthly_warn_inr` — default `500` (₹500 user-warning threshold)
- `llm.monthly_cap_inr` — default `1000` (₹1000 hard cap; over → `IngestionFailure`)
- `ingestion.default_auto_commit_threshold` — `5` events before auto-commit offered
- `ingestion.discovery_scan_lookback_days` — `730` (Gmail backfill window)

### User profile prerequisites (for password-locked PDFs)

User must set in `/settings`:
- **PAN** — primary password for Zerodha, most CAS, Groww, Upstox, etc.
- **DOB** — fallback password (Kotak, SBI Securities use `PAN+DDMMYYYY`)

`getUserPdfPasswords()` in `packages/api/src/lib/pdf.ts` derives the candidate list from these — no per-broker password storage needed.

### Cost expectations

| Scenario | LLM calls | Approx monthly cost |
|---|---|---|
| Single user, 1 active broker, 1 contract note/week, **no recipe yet** | 4/mo | ~₹1 |
| Single user, 1 active broker, 1 contract note/week, **promoted recipe** | 0/mo | ₹0 |
| Single user, 5 brokers, 5 contract notes/week each, learning phase (3 weeks) | ~75 | ~₹15 |
| Single user, 5 brokers, **all recipes promoted** | 0/mo | ₹0 |
| Single user, format change on one broker (relearning) | +3 | +₹0.50 |

Hard cap (₹1000/mo) is far above any realistic single-user load.

---

## 4. Open architectural questions

### Q1 — Should sample storage retain raw PDF text or only the redacted version?

**Current:** `recordContractNoteSample` stores `redactForLlm(pdfText).text`. Synthesis runs against the redacted version.

**Risk:** if redaction happens to strip a token that synthesis needs (e.g. an account-number column gets `XXXX1234` substituted, breaking the column-position match across samples that have different account numbers), recipe will never promote.

**Mitigation idea:** redact ONLY values that vary across samples for synthesis purposes. The PII redactor today doesn't know about cross-sample correlation.

**Decision needed:** acceptable trade-off, or build a smarter redactor?

### Q2 — F&O recipe shape

See P1 above. Two camps:
- **Pattern-based:** capture multi-line rows with `[\s\S]*?` between known anchors.
- **State-machine:** parse line-by-line, track current row's accumulated tokens.

The state-machine approach is closer to how `zerodhaContractNote.parser.ts` already works for Zerodha F&O — could be generalised.

### Q3 — Template auto-deactivation aggression

**Current:** 2 consecutive misses deactivate a recipe.

**Risk:** noisy PDFs (one row malformed, rest fine) shouldn't kill the whole recipe. Today they would.

**Mitigation idea:** only deactivate when ENTIRE PDF returns no trades, not when a single row fails Zod.

---

## 5. Test coverage status

| Test | File | Status |
|---|---|---|
| Zerodha equity golden | `parsers.fixtures.test.ts` | ✅ 5 fixtures |
| Zerodha F&O golden | `parsers.fixtures.test.ts` | ✅ included |
| Generic CN canHandle | — | ❌ missing |
| Recipe synthesis unit test | — | ❌ missing |
| Recipe applier unit test | — | ❌ missing |
| Cross-broker mailboxPoller routing | — | ❌ missing |

**Recommended next test additions** (do BEFORE shipping any P1+ work):
1. `contractNoteTemplates.test.ts` — synthetic 3-sample input → assert promoted recipe → apply → assert trades.
2. `genericBrokerContractNote.test.ts` — mock `readPdfText` + `parseEmailWithLlm` → drive each branch (gate-disabled, broker-not-found, recipe-hit, recipe-miss, LLM-success, LLM-fail).

---

## 6. Migration / rollout plan when samples land

1. **Drop 3 samples** for one broker (start with Groww — highest user count after Zerodha).
2. **Local LLM run:** set `ENABLE_LLM_PARSER=true`, `ANTHROPIC_API_KEY=...`, run import on each sample.
3. **Verify samples accumulated:** `SELECT * FROM "LearnedTemplate" WHERE "senderAddress" = 'cn:groww';` — expect 1 row, `sampleCount=3`, `extractionRecipe.state='cn-promoted'` (or `cn-sampling` if synthesis disagreed).
4. **Verify cache hit:** drop 4th Groww sample → log shows `[broker-cn] recipe hit`, no `LlmSpend` row written.
5. **Snapshot test:** `pnpm --filter @portfolioos/api test parsers.fixtures` → seeds new snapshot.
6. **Repeat** for each of the 24 brokers.

---

## 7. Reference — file map

```
portfolioos/
  packages/api/
    prisma/schema.prisma                                    # Alert, LearnedTemplate, MailboxAccount, etc.
    src/data/brokers.ts                                     # 25-broker registry + helpers
    src/ingestion/
      contractNoteTemplates.ts                              # cn recipe cache (this work)
      hash.ts                                               # bodyStructureHash, slot extraction
      pii.ts                                                # redactForLlm
      templates.ts                                          # email recipes (single-event lane)
      llm/
        client.ts                                           # parseEmailWithLlm, gate, budget, ledger
        schema.ts                                           # Zod + Anthropic tool schema
        budget.ts                                           # per-user monthly cap
        system-prompt.txt                                   # parser instructions
    src/services/imports/parsers/
      types.ts                                              # Parser interface, ParsedTransaction
      zerodhaContractNote.parser.ts                         # specific Zerodha regex
      genericBrokerContractNote.parser.ts                   # universal LLM/recipe path
    src/adapters/fileImport/adapters.ts                     # FILE_IMPORT_ADAPTERS registry
    src/jobs/mailboxPoller.ts                               # email → ImportJob with broker label
    src/lib/pdf.ts                                          # readPdfText, getUserPdfPasswords
    test/fixtures/contract_note/                            # per-broker fixture dirs
```

---

## 8. Acceptance for "feature complete"

The feature ships when:

- [ ] All 25 broker fixture dirs have ≥3 anonymised samples.
- [ ] Each broker has a promoted recipe OR a documented reason it can't (e.g. F&O-only broker).
- [ ] Golden snapshot tests green for every broker fixture.
- [ ] Production env vars set + verified (`ANTHROPIC_API_KEY`, `ENABLE_LLM_PARSER=true`, `ANTHROPIC_ZERO_RETENTION_CONFIRMED=true`).
- [ ] User-facing: settings page shows per-broker recipe state + LLM cost.
- [ ] Per-user monthly LLM cost trends to ₹0 within 30 days of broker onboarding (proves recipes promote and stick).
- [ ] OCR path lit up — at least one scanned-PDF fixture passes (P2).
- [ ] F&O recipe path lit up — at least Zerodha + one other broker (P1).
