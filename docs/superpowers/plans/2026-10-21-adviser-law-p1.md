# Adviser Law P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The adviser answers from current Indian tax law (Income-tax Act 2025 as amended by Finance Act 2026) and SEBI's adviser / product rules, and never lets an older NISM passage override a newer rule.

**Architecture:** Extend the BM25 knowledge library (`src/ai/knowledge/`) with a `LAW` source kind and a `supersededBy` link on entries. Law entries live in `src/ai/knowledge/law/<instrument>-<topic>.ts`, spread into `KNOWLEDGE_LIBRARY` via `law/index.ts`. Retrieval drops a superseded entry whenever its successor is also in the hit list.

**Tech Stack:** TypeScript (NodeNext `.js` imports), Vitest, existing `searchKnowledge` / `knowledgeForTurn` / `credit`.

**Spec:** `docs/superpowers/specs/2026-10-21-adviser-law-p1-design.md`

## Global Constraints

- Entries in our own words; `principle` ≤ 900 chars, `inPractice` ≤ 500; topics from the existing list.
- Every LAW entry has `asOf` and a `source.ref` (section / para / circular number).
- Sources: official text only (gazette, incometaxindia, sebi.gov.in). Source text stays in the session scratchpad, never committed.
- Overlap guard (`scripts/nismOverlap.ts`) must report 0 shared runs against the downloaded source text.
- Ask before every paid exam run.

## Review Focus

1. A question about buyback / STT / dividend deduction / SGB returns the LAW entry, and never the superseded NISM entry alone with no successor → tests in Task 2.
2. A superseded NISM entry is still found for questions about the old rule's history ("how were buybacks taxed before 2026") — supersession only filters when the successor is present → Task 1 test.
3. Credit text for a LAW entry names the instrument, the section and the as-of date → Task 1 test.
4. Section-number confusion: a LAW entry citing the 2025 Act also names the 1961 section once → Task 3 check per entry ("formerly s.").
5. Retrieval drowning again as the library grows → existing `knowledgeForTurn` tests stay green unchanged.

---

### Task 1: LAW source kind + supersession

**Files:** Modify `src/ai/knowledge/library.ts` (source union, `supersededBy?: string`), `src/ai/knowledge/search.ts` (credit + filter). Create `src/ai/knowledge/law/index.ts` (empty `LAW_LIBRARY`). Test: `test/services/aiKnowledgeLaw.test.ts`.

**Interfaces — Produces:** `source: { kind: 'LAW'; instrument: string; ref: string; date: string }`; `credit()` → `from <instrument>, <ref> (as of <Mon YYYY>)`; superseded NISM credit gains `; older rule, superseded by <id>`; `searchKnowledge` drops `e` when `e.supersededBy` is among the scored hits; `LAW_LIBRARY` spread after `NISM_LIBRARY`.

- [ ] Failing tests (fixture library passed via `opts.library`): credit format; superseded entry dropped when successor scores; kept when successor absent; every `supersededBy` id exists in `KNOWLEDGE_LIBRARY`; every LAW entry has `asOf` and `ref`.
- [ ] Implement; run `pnpm exec vitest run test/services/aiKnowledgeLaw.test.ts test/services/aiKnowledge.test.ts test/services/aiKnowledgeNism.test.ts`; commit.

### Task 2: Finance Act 2026 changes

**Files:** Create `src/ai/knowledge/law/fa2026-changes.ts`; modify the NISM files whose rule changed (add `supersededBy`). Test: extend `aiKnowledgeLaw.test.ts`.

Verified against the gazette (Act 4 of 2026, assent 30 Mar 2026; ss.2–129 from 1 Apr 2026):
- Buyback (ITA 2025 s.69 as substituted by FA 2026 s.42): proceeds taxed as capital gains for every shareholder; promoters pay additional tax — STCG 2% (domestic-company promoter) / 10% (other), LTCG 9.5% / 17.5%.
- Dividend / MF income (s.93(2) substituted by FA 2026 s.44): no deduction at all against dividend or MF income (the 20% interest deduction is gone).
- SGB (s.70(1)(x) substituted by FA 2026 s.43): redemption exempt only if an individual held the bond from original issue till maturity.
- STT (Finance (No.2) Act 2004 s.98, amended by FA 2026 s.159): option sold 0.1% → 0.15% of premium; option exercised 0.125% → 0.15%; futures 0.02% → 0.05%.

- [ ] Failing tests: each of four questions returns its `fa26-*` entry in `knowledgeForTurn` and not the superseded NISM entry; each superseded NISM entry carries `supersededBy`.
- [ ] Write entries; mark NISM entries; tests green; overlap guard 0; commit.

### Task 3: Income-tax Act 2025, investor chapters

**Files:** `src/ai/knowledge/law/ita25-<topic>.ts` (residence, regimes-rates, capital-gains, other-sources, house-property, deductions, clubbing-huf, fo-business, advance-tax-tds). Retrieval test per file.

- [ ] Obtain Act text (incometaxindia section pages block curl; use browser fetch or the enacted PDF + FA 2026 amendments).
- [ ] Per topic: failing retrieval test → entries → green. Commit per 2–3 topics.

### Task 4: SEBI IA Regulations + IA Master Circular

**Files:** `src/ai/knowledge/law/sebi-ia-*.ts`. Retrieval tests.

### Task 5: SEBI MF / PMS / AIF / RA master circulars (investor-facing)

**Files:** `src/ai/knowledge/law/sebi-{mf,pms,aif,ra}-*.ts`. Retrieval tests.

### Task 6: Exam bank + guard + final review + PR

- [ ] `test/fixtures/law-exam/law.json` ~60 questions; extend leakage test; runner accepts `--bank law`.
- [ ] Overlap guard against all source text: 0.
- [ ] Final whole-branch review (most capable model); fix pass; PR; merge gated on tests.
