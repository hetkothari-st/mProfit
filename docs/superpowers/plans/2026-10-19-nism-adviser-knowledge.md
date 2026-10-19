# NISM Adviser Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the in-app AI assistant own-words coverage of NISM Series X-A (Jun 2025) and X-B (Dec 2025), switch off four classic books, and prove it with a ~200-question NISM-style exam scored ≥ 90% overall / ≥ 75% per chapter.

**Architecture:** New `NISM` source kind and one entries file per chapter under `src/ai/knowledge/nism/`, merged into the existing in-process BM25 library. A short system-prompt section for assistant vs adviser mode, and an `ai.advice_scope` setting (only `ALL` now). Exam = JSON fixtures + a spend-guarded script that runs each question through the real `runAdvisorTurn` pipeline.

**Tech Stack:** TypeScript (NodeNext, `.js` imports), Vitest, `tsx` scripts, `@anthropic-ai/sdk` via the existing `claudeClient.ts`.

**Spec:** `docs/superpowers/specs/2026-10-19-nism-adviser-knowledge-design.md`

## Global Constraints

- Own words only: no passage, table or question copied from the workbooks; a quoted span ≤ 12 words (existing test); 0 shared 10-word runs with the workbook text (overlap script).
- Workbook text lives only in the scratchpad (`…/scratchpad/nism-txt/xa-exam.txt`, `xb-exam.txt`); never in the repo.
- `principle` 40–700 chars; one idea per entry; every NISM entry credits `series`, `edition`, `chapter`.
- Entries stating a rate, limit, date or regulation carry `asOf` = the edition (`'2025-06'` X-A, `'2025-12'` X-B).
- No exam question stem may appear in the library or prompts.
- No new infrastructure; no embeddings. Paid exam runs only after the user says yes, each time.
- Authoring: one chapter at a time by the executor; no parallel subagents (user default).
- Gate: `pnpm -r run lint && pnpm -r run typecheck && pnpm -r run build`, the API tests touched, and `--check` of moveFiles unaffected. Baselines: api lint 547/6, one pre-existing typecheck error (`backfillRentalLedger.ts:379`).
- Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Retrieval drowning**: with ~10× entries, a classic-planning question (emergency fund, SIP panic) now returns NISM trivia instead of the framework entry → the existing three retrieval tests in `test/services/aiKnowledge.test.ts` must still pass unchanged.
2. **Stale law**: an NISM entry states a 2025 rate the app's tax service has since changed → every rate-bearing entry has `asOf`, and the prompt credit shows the edition so the model knows its age (test: every entry whose principle contains `%` or `₹` has `asOf`).
3. **Test leakage**: an exam stem pasted into an entry while authoring → test `no exam stem appears in the library`.
4. **Disabled books still referenced**: the prompt or tests name Graham/Bogle/Malkiel/Housel → grep check in Task 1; system prompt wording reviewed.
5. **Exam script spending by accident**: run without the flag, or in CI → script refuses without `--confirm-spend` and `ANTHROPIC_API_KEY`; covered by a unit test with a fake client.

---

### Task 1: Source kind, disabled books, ADVICE_SCOPE

**Files:**
- Modify: `packages/api/src/ai/knowledge/library.ts` (types, comment out Graham/Bogle/Malkiel/Housel entries, `KNOWLEDGE_LIBRARY` merge point)
- Modify: `packages/api/src/ai/knowledge/search.ts` (`credit()` for NISM)
- Create: `packages/api/src/ai/knowledge/nism/index.ts` (`export const NISM_LIBRARY: readonly KnowledgeEntry[] = []`)
- Create: `packages/api/src/ai/adviceScope.ts`
- Test: `packages/api/test/services/aiKnowledge.test.ts`, `packages/api/test/ai/adviceScope.test.ts`

**Interfaces:**
- Produces: `KnowledgeSource` adds `{ kind: 'NISM'; series: 'X-A' | 'X-B'; edition: '2025-06' | '2025-12'; chapter: number; chapterTitle: string }`; `KnowledgeEntry.asOf?: string`; `KnowledgeTopic` adds `'markets' | 'equity' | 'bonds' | 'derivatives' | 'mutual-funds' | 'pms-aif' | 'portfolio-theory' | 'performance' | 'operations' | 'regulation' | 'ethics' | 'grievance' | 'estate' | 'risk-profiling' | 'products'`; `ACTIVE_BOOKS` (titles still enabled); `getAdviceScope(): Promise<'ALL' | 'AGREEMENT'>`.

- [ ] Tests first: replace "draws on all five books" with `it('keeps only the enabled books: Halan + the framework')` (every BOOK entry's book is `"Let's Talk Money"`); add `it('credits NISM entries with series, edition and chapter')` (via a fixture entry passed as `library` to `knowledgeForPrompt`: output contains `NISM Series X-B (Dec 2025), ch. 8`); add `it('dates every NISM entry that states a rate or amount')` (principle/inPractice containing `%` or `₹` ⇒ `asOf` set); `adviceScope.test.ts`: no row ⇒ `'ALL'`, row `{value:'AGREEMENT'}` ⇒ `'AGREEMENT'`, junk ⇒ `'ALL'`.
- [ ] Run `pnpm --filter @everypaisa/api exec vitest run test/services/aiKnowledge.test.ts test/ai/adviceScope.test.ts` → FAIL.
- [ ] Implement. Comment out the four books' entries in a block headed `// Switched off 2026-10-19 (user): Graham, Bogle, Malkiel, Housel — re-enable by uncommenting`; keep their `KNOWLEDGE_BOOKS` rows but mark `enabled: false`. `getAdviceScope` reads AppSetting `ai.advice_scope` (`prisma.appSetting.findUnique`), memo 60 s.
- [ ] Run again → PASS; the three existing retrieval tests still pass (Review Focus 1 — if one fails because its expected entry was a disabled book, re-point it to the Halan/framework entry and note it).
- [ ] `git grep -nE "Graham|Bogle|Malkiel|Housel" -- packages/api/src` → only the commented block and `KNOWLEDGE_BOOKS`.
- [ ] Commit `feat(ai): NISM source kind, switch off four classic books, advice-scope setting`.

### Task 2: Assistant vs adviser mode in the system prompt

**Files:** Modify `packages/api/src/ai/systemPrompt.ts`; Test `packages/api/test/ai/systemPrompt.mode.test.ts` (or the existing systemPrompt test file).

- [ ] Test: prompt contains a `How to tell help from advice` section naming both modes, and the instruction to use library passages first for concept/exam-style questions and to say the edition when a passage carries `asOf`.
- [ ] FAIL → implement (≤ 15 lines, no change to existing guard rails) → PASS → commit `feat(ai): assistant and adviser modes in the system prompt`.

### Tasks 3–12: Author the library, one module per task

Each task = one module of chapters → files `nism/xa-NN-<slug>.ts` / `nism/xb-NN-<slug>.ts`, each exporting `XA_NN` / `XB_NN: readonly KnowledgeEntry[]`, added to `nism/index.ts`. Ids `xa-NN-<slug>` / `xb-NN-<slug>`.

| Task | Chapters (source text in scratchpad) |
|---|---|
| 3 | X-A 1–4 (planning, TVM, financial position, debt) |
| 4 | X-A 5–8 (markets, segments, investment intro, stocks) |
| 5 | X-A 9–11 (fixed income, derivatives, mutual funds) |
| 6 | X-A 12–16 (PMS, AIFs, MPT, portfolio construction, performance) |
| 7 | X-A 17–20 (operations, regulations, ethics, grievance) |
| 8 | X-B 1–3 (insurance basics, life, non-life) |
| 9 | X-B 4–6 (retirement basics, products, misc) |
| 10 | X-B 7–10 (tax concepts, capital gains, other sources, debt products) |
| 11 | X-B 11–13 (equity, other products, special cases) |
| 12 | X-B 14–20 (estate, behavioural, risk profiling, product comparison, cases) |

Per task:
- [ ] Read the chapters' text from the scratchpad; write entries (≈ 10–15 per chapter): concept, formula + worked figure, product features, rules (with `asOf`), processes. Exam vocabulary in `keywords`.
- [ ] Add one retrieval test per chapter to `test/services/aiKnowledgeNism.test.ts`: a natural question → expected id in top 5 (written as `expect(ids(searchKnowledge(q,{limit:5}))).toContain('xa-09-ytm')`).
- [ ] Run `vitest run test/services/aiKnowledge.test.ts test/services/aiKnowledgeNism.test.ts` → PASS (all library invariants + retrieval).
- [ ] Run the overlap script (Task 13) once it exists; for Tasks 3–12 before it exists, run it retroactively in Task 13.
- [ ] Commit `feat(ai): NISM <series> chapters <a>–<b> in the adviser library`.

### Task 13: Overlap guard script

**Files:** Create `packages/api/scripts/nismOverlap.ts`; Test `packages/api/test/scripts/nismOverlap.test.ts`.
- Produces: `sharedRuns(a: string, b: string, n = 10): string[]` (normalised lowercase word n-grams present in both); CLI `tsx scripts/nismOverlap.ts <workbook.txt>...` prints shared runs across library + exam fixtures, exit 1 if any.
- [ ] Tests: identical 10-word phrase found; 9-word overlap not; punctuation/case ignored. FAIL → implement → PASS.
- [ ] Run it on both workbook texts → `0 shared runs`; fix any entry it flags. Commit `chore(ai): workbook overlap guard`.

### Task 14: Exam fixtures

**Files:** Create `packages/api/test/fixtures/nism-exam/xa.json`, `xb.json`; Test `packages/api/test/ai/nismExam.fixtures.test.ts`.
- Question shape: `{ id, series, chapter, kind: 'mcq'|'case', stem, options: [4 strings], answer: 'A'|'B'|'C'|'D', why, workbookRef: number, lawSensitive: boolean }`.
- [ ] Tests: schema valid; ids unique; every chapter of both series has ≥ 4 questions; total ≥ 200; answers spread across A–D (none > 40%); **no stem (or any 10-word run of it) appears in the library or system prompt**. FAIL (no fixtures) → write questions chapter by chapter, checking each answer against its `workbookRef` page → PASS.
- [ ] Overlap script includes the fixtures → 0. Commit `test(ai): NISM-style exam bank`.

### Task 15: Exam runner

**Files:** Create `packages/api/scripts/nismExam.ts`; Test `packages/api/test/scripts/nismExam.test.ts`.
- Produces: `scoreExam(questions, ask: (q) => Promise<string>): Promise<ExamReport>` where `ExamReport = { model, total, correct, pct, byChapter: Record<string,{n,correct,pct}>, lawSensitive: {n, correct}, misses: {id, got, want}[] }` (law-sensitive excluded from `pct` and `byChapter`); `parseLetter(text): 'A'|'B'|'C'|'D'|null` (last standalone letter in a final `Answer: X` line).
- `ask` in the CLI = `runAdvisorTurn` with the real system prompt, the same knowledge injection the route uses, the `search_knowledge` tool only, no user facts; the question formatted with options and "end with `Answer: <letter>`". Model = `env` default; printed in the report.
- [ ] Tests (fake `ask`): scoring and per-chapter maths; law-sensitive excluded; `parseLetter` cases; CLI refuses without `--confirm-spend` (exit 2, prints estimated cost). FAIL → implement → PASS.
- [ ] Options: `--series xa|xb`, `--chapter N`, `--only-failed <report.json>` for cheap reruns. Writes `docs/ai/nism-exam/<date>-<model>.md` + `.json`.
- [ ] Commit `feat(ai): NISM exam runner (spend-guarded)`.

### Task 16: Paid exam run and tuning (STOP — ask the user before every run)

- [ ] Ask: "Full exam run ≈ $X — go?" Then `tsx scripts/nismExam.ts --confirm-spend`.
- [ ] Below bar → levers in order: fix/add entries for missed concepts; retrieval weighting (title/keywords boost in `search.ts`, pinned by tests); injected hits 3 → max 5 (constant `ASSISTANT_KNOWLEDGE_HITS` in `aiAssistant.routes.ts`); prompt wording. Rerun only failed chapters (`--only-failed`), each run approved.
- [ ] Bar met (≥ 90% overall, ≥ 75% each chapter) → commit report `docs(ai): NISM exam report — <pct>% on <model>`; list law-sensitive disagreements for the user.

### Task 17: Finish

- [ ] Full gate (Global Constraints) + all touched tests; overlap 0.
- [ ] PR `feat(ai): NISM X-A/X-B adviser knowledge`, body with coverage table, exam score, law-sensitive list; merge after checks (user-approved flow).
