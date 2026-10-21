# NISM Adviser Knowledge for the AI Assistant — Design

Date: 2026-10-19
Status: draft, awaiting user approval

## Intent

The in-app AI assistant should know what an NISM-certified Investment Adviser
knows (Series X-A Level 1 and X-B Level 2) and use it for every user: plain
help when the user wants help, adviser-grade recommendations when they want
advice. "Knows" is proven by passing NISM-style exam questions, not asserted.

The user (a SEBI-registered investment adviser) supplied the official
workbooks. Today the assistant's library is 59 own-words entries (five classic
books + a planning framework), searched in-process with BM25
(`packages/api/src/ai/knowledge/`). That covers roughly a tenth of the NISM
syllabus.

## Goals

1. Library coverage of every chapter of NISM X-A (June 2025 edition, 20
   chapters) and X-B (December 2025 edition, 20 chapters).
2. The assistant retrieves and applies that knowledge in its answers, for all
   users, choosing assistant or adviser behaviour from the user's request.
3. A repeatable exam: ~200 NISM-style questions written fresh, covering every
   chapter; the assistant scores **≥ 90% overall and ≥ 75% in every chapter**
   (the real exam's pass mark is 60%).
4. One switch (`ADVICE_SCOPE`) so advice can later be limited to some users
   without a rewrite.

## Non-goals

- No model fine-tuning or training runs. "Training" = curated knowledge the
  assistant retrieves at answer time.
- No embeddings service, vector DB, or anything new on Railway (standing rule).
- No change to the assistant's data tools, facts, or the advice engine.
- Gating by plan / advisory agreement is not built now — only the switch.

## Anti-goals

- **No copying.** The workbooks are © NISM. No verbatim passages, tables or
  exam questions in the repo or the prompt. Everything is in our own words and
  credited ("NISM Series X-A, 2025, ch. 9"), the same rule the existing library
  follows (a test already blocks quotes over 12 words).
- **No stale law presented as current.** A rate, limit or regulation from the
  workbook is labelled with its edition date. Where the app's own services
  compute a rule (capital gains, slab rates, advance tax), the service wins.
- **No teaching-to-the-test.** The exam questions are never put into the
  library or the prompt; a test fails if an exam question's stem appears there.
- The 2014 X-A workbook supplied is **not used** — eleven years out of date
  (DDT, RGESS, pre-2023 debt-fund tax); it would teach wrong answers.

## Constraints

- In-process retrieval (BM25, `search.ts`); entries short (existing test caps
  `principle` at 700 chars).
- Existing pipeline: top-3 hits are injected per message
  (`aiAssistant.routes.ts`) and the model can call `search_knowledge`
  (`advisorTools.ts`, 4 hits). Both paths stay.
- Running the exam calls the real model and costs money (estimate: a few
  dollars per full run). Each run needs the user's go-ahead; it is a script,
  never part of `vitest`.
- Today's date is 2026-10-19. The X-B edition (Dec 2025) predates Budget 2026;
  any tax figure that changed since is the app's services' job, and gaps found
  are listed for the user (an RIA) to confirm, not guessed.
- Branch work in a worktree off `origin/main`; merge gated on local
  lint/typecheck/build/tests (GitHub runs no test CI here).

## Decided by the user

- Use the two current workbooks; prove knowledge with NISM-style exam questions.
- Everything available to every user now; gate later.
- Questions written fresh in our own words (not NISM's) and the 90% / 75% bar
  — accepted.

## Design

### 1. Library layout

```
src/ai/knowledge/
  library.ts            existing 59 entries + KNOWLEDGE_LIBRARY = [...existing, ...NISM_LIBRARY]
  search.ts             BM25 (tuned, see §3)
  nism/
    index.ts            NISM_LIBRARY = [...every chapter file]
    xa-01-financial-planning.ts … xa-20-grievance.ts
    xb-01-insurance-basics.ts … xb-20-case-studies.ts
```

New source kind on `KnowledgeEntry`:
`{ kind: 'NISM'; series: 'X-A' | 'X-B'; edition: '2025-06' | '2025-12'; chapter: number; chapterTitle: string }`
plus an optional `asOf` on entries that state a rate, limit or regulation.
`knowledgeForPrompt` credits it as "NISM Series X-B (Dec 2025), ch. 8".
`KnowledgeTopic` gains the topics the syllabus needs (derivatives, bonds,
regulation, ethics, estate, behavioural, risk-profiling, …).

Entry granularity: one idea per entry — a concept, a formula (with a worked
number), a product's features, a rule, a process. Expected 400–600 entries.
`keywords` carry the exam vocabulary (e.g. "avalanche", "hypothecation",
"Sharpe", "LTCG 112A", "nomination vs will").

### 2. Assistant vs adviser behaviour

A short system-prompt section, built from what exists:
- **Assistant mode** (definitions, how-tos, "show me", app help): answer the
  question directly, cite the library when it supplied the fact.
- **Adviser mode** (what should I do / is this right for me / compare for my
  goal): library first for the principle, the user's own facts and tools for
  the numbers, existing suitability and tax rules unchanged.
- The mode is the model's judgement from the request; no UI toggle.

### 3. Retrieval at the new scale

With ~10× the entries, top-3 BM25 may miss. The design allows: raising the
injected hit count (3 → 5–6), weighting `title`/`keywords` above `principle`,
and grouping hits from one chapter. The exam decides: retrieval settings are
tuned until the score target is met, and the chosen settings are pinned by
unit tests (known question → expected entry in top N).

### 4. ADVICE_SCOPE switch

`AppSetting` key `ai.advice_scope`: `'ALL'` (default, today's behaviour) |
`'AGREEMENT'` (later). Read in one place; for now only `'ALL'` is implemented
and tested. Gating rules are a later design.

### 5. The exam

- `packages/api/test/fixtures/nism-exam/xa.json`, `xb.json`: ~200 questions,
  every chapter ≥ 4, written fresh. Each: `id, series, chapter, kind
  (mcq|case), stem, options[4], answer, why, workbookRef (page)`.
- Correct answers are checked against the workbook pages they cite; the
  workbook page reference stays in the fixture, the workbook text does not.
- `packages/api/scripts/nismExam.ts`: runs each question through the real
  assistant pipeline (system prompt + knowledge injection + `search_knowledge`
  tool, no user facts), asks for the option letter, scores, prints per-chapter
  results and writes a dated report to `docs/ai/nism-exam/`. Needs
  `ANTHROPIC_API_KEY`; refuses without `--confirm-spend`.
- Unit tests (free, in vitest): fixture schema valid; every chapter covered;
  no exam stem appears in the library or prompt; retrieval returns the
  expected entry for a sample of questions.

### 6. Copyright guard

- Existing quote-length test stays and covers the new entries.
- `scripts/nismOverlap.ts` (local, not CI): given the user's extracted
  workbook text, reports any 10-word run shared with the library or the exam
  fixtures. Must report zero before merge. The workbook text never enters
  the repo.

## Verification

1. Library unit tests (ids, credits, length, quotes, topics) green.
2. Overlap script: 0 shared 10-word runs.
3. Exam run: ≥ 90% overall, ≥ 75% every chapter — report committed.
4. Existing assistant tests unchanged and green; lint/typecheck/build parity
   with main.

## Calls made in review (builder's, flagged for the user)

- **Source text.** Both workbooks are text PDFs (no OCR). Text is already
  extracted with `pdftotext` into the session scratchpad
  (`…/scratchpad/nism-txt/xa-exam.txt`, `xb-exam.txt`), outside the repo.
  Originals: `D:\Downloads\NISM-SERIES-X-A--…pdf`, `D:\Downloads\NISM-SERIES-X-B--…pdf`.
  The builder authors from that text; it never enters the repo.
- **Model certified.** The exam pins the model the app uses by default
  (`claude-sonnet-5`, `config/env.ts`) and records it in the report. A
  production `llm.assistant_model` override is not read (prod DB untouched);
  if production runs another model, the exam is re-run on it.
- **Answer key.** The builder checks each answer against the workbook page it
  cites; the user may spot-check, not required.
- **Law that changed after the workbook edition.** Each question is tagged
  `lawSensitive` when its answer is a rate, limit or date. Those are reported
  separately and do not count toward the 90% / 75% bar; any disagreement
  between the workbook and current law is listed for the user to confirm.
- **Levers if the bar is missed:** more or better entries, system-prompt
  wording, retrieval weighting, and injected hits up to **5** (ceiling — each
  extra hit adds per-message cost for every user). The work is not called
  done below the bar; the library may still merge in stages as progress.

## Left to the builder

- Exact entry wording, ids, keywords; chapter file names.
- Retrieval tuning values.
- Which answer-format instruction the exam script uses, as long as it goes
  through the real assistant pipeline.

## Open items for the user (not blocking)

- Post-Dec-2025 tax/regulatory changes the exam or library surface — listed
  in the exam report for the user to confirm.
- Approving each paid exam run.
