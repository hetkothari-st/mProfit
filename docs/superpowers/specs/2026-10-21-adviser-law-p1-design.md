# Adviser knowledge, priority 1: current law (design)

Date: 2026-10-21. Follows `2026-10-19-nism-adviser-knowledge-design.md` (merged as #282); that spec's method, guards and entry format carry over unchanged unless this one says otherwise.

## Why

The NISM workbooks summarise the law as of mid/late 2025. Two things have moved since:

1. **The Income-tax Act, 2025 replaced the 1961 Act on 1 April 2026**, with new section numbers, and **Finance Act 2026** changed rules the library now teaches wrongly: buyback proceeds are capital gains again (not dividend), STT on options went up, the 20% interest deduction against dividend / MF income is gone, and the SGB exemption was restricted. About 10 NISM files and 43 lines of section references are affected.
2. **SEBI's rules for the owner's own RIA practice** (Investment Advisers Regulations 2013 as amended, and the IA Master Circular, latest Feb 2026) are only summarised in X-A. The adviser should answer from the rule itself.

## Goals

- The adviser answers Indian tax questions for individuals and HUFs as of FY 2026-27 under the Income-tax Act 2025, citing its sections, and never contradicts a newer rule with an older NISM passage.
- The adviser answers questions on SEBI regulation of advisers, mutual funds, PMS, AIFs and research analysts from the regulations and master circulars, credited by name and date.
- Same own-words, credited, dated, copy-checked method as NISM. Government text is not copyrighted for reproduction of Acts (Copyright Act s.52(1)(q)), but we still paraphrase so entries stay short and searchable.

## Non-goals

- Corporate, international and transfer-pricing tax; GST; TDS mechanics beyond what an investor sees; procedure (assessment, appeals) beyond a one-line pointer.
- Intermediary-side SEBI compliance that never reaches a client (net-worth computation, inspection procedure), except for IA rules the owner's practice must follow.
- RBI/FEMA, ICAI material, succession law (priority 2 and 4).

## Anti-goals

- A newer law entry and an older NISM entry both injected and disagreeing, with nothing telling the model which wins.
- Rates quoted without the Act/Finance Act and date they come from.

## Sources (all free, official)

| Source | Where | Scope taken |
|---|---|---|
| Income-tax Act, 2025 as amended by Finance Act 2026 | incometaxindia.gov.in (section pages) | Residence, heads of income for individuals/HUF, salary perquisites relevant to ESOPs, house property, capital gains (all asset classes, holding periods, exemptions, set-off/carry-forward), other sources (dividend, interest), clubbing, deductions available under each regime, new vs old regime slabs/rebate/surcharge, presumptive basis for F&O traders, advance tax and TDS as the investor sees them |
| Finance Act 2026 + memorandum | incometaxindia.gov.in / indiabudget.gov.in | What changed from FY 2025-26, so the adviser can say "changed from 1 Apr 2026" |
| CBDT circulars/notifications 2026 | incometaxindia.gov.in | CII for FY 2026-27; any clarifications that change investor answers |
| SEBI (Investment Advisers) Regulations 2013, as amended | sebi.gov.in | All of it |
| SEBI Master Circular for Investment Advisers (Feb 2026) and later IA circulars | sebi.gov.in | All client-facing obligations: fees, agreement, risk profiling, suitability, segregation, MITC, investor charter, grievance |
| SEBI Master Circulars for Mutual Funds, PMS, AIFs, Research Analysts (latest) | sebi.gov.in | Investor-facing parts only: categories, TER/fees, exit loads, disclosures, minimum ticket sizes, investor rights |

## Entry model changes

- `source.kind: 'LAW'` with `{ instrument: 'Income-tax Act 2025' | 'Finance Act 2026' | 'SEBI IA Regulations 2013' | 'SEBI Master Circular' | 'CBDT', ref: string (section/para/circular no.), date: 'YYYY-MM-DD' }`. Credit renders e.g. "Income-tax Act 2025, s.67 (as amended to Apr 2026)".
- `asOf` required on every LAW entry.
- **Supersession:** a NISM entry whose rule changed gets `supersededBy: '<law entry id>'`. Retrieval drops a superseded entry whenever its successor is in the same result set, and the credit line of a superseded entry tells the model "older rule; see current law". The four confirmed Finance Act 2026 changes are fixed this way first.
- Section numbers: NISM entries keep the 1961 references (that is what the workbook teaches and what clients still quote); LAW entries carry 2025 numbers and mention the old number once ("formerly s.112A").

## Guards and verification

- Overlap guard runs against the downloaded source text as well (expect near-zero; the Acts are terse).
- New exam bank: ~60 questions (40 tax under the 2025 Act, 20 SEBI), same fixture format, never shown to the library; same leakage test.
- Retrieval tests: one natural question per topic finds its LAW entry; superseded NISM entries never appear alongside their successor.
- Exam run (paid, ~$1.20) only on the owner's go; bar ≥90% overall.

## Order of work

1. Finance Act 2026 changes + supersession mechanism (fixes live wrong answers).
2. Income-tax Act 2025, investor-relevant chapters.
3. SEBI IA Regulations + IA Master Circular.
4. SEBI MF / PMS / AIF / RA master circulars, investor-facing parts.
5. Exam bank, guard run, final review, PR.

## Left to the builder

Exact entry count (estimate 150–250), wording, which circular paragraphs are investor-facing, keyword choice.
