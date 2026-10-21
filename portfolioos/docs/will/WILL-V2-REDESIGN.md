# Will document v2 — redesign (2026-10-21)

Template v2 of the Will Maker document: new wording (`common.v2.ts`), a new block model
(`astV2.ts`) and a new PDF renderer (`willPdf.ts`). v1 is untouched and still locked:
every will already generated keeps its stored PDF and its text hash.

**Not legally certified.** This is drafting and typesetting work. Nothing here has been reviewed by
an advocate. The wording must be reviewed before it is relied on (see "Needs an advocate" below).

## 1. What existed (audit)

| Area | Before (v1) |
|---|---|
| Pipeline | Wizard (`apps/web/src/pages/will`) → draft JSON sealed per user (`willStore.ts`) → `runWillRules` (blockers stop generation) → `selectWillTemplate(payload).render()` → `WillBlock[]` → `renderWillPdf` (pdfkit, direct drawing) → stored `Document` + `WillVersion` (input hash, text hash, PDF hash). The preview shows the same blocks. |
| Data model | Already had specific gifts with % shares, fixed money gifts, residuary %, a person-level back-up beneficiary, executor + alternate, guardian + alternate, and ownership type per item (sole / joint / HUF / nominee-only). Validation already blocked shares not adding up to 100, over-allocated items, missing executor, missing details, gifts of excluded items and liabilities. |
| Wording | 9 short clauses. A Hindu / ISA s.57 recital chosen from the personal law. A hardcoded 30-day survival period. Specific gifts as a two-column list. |
| Schedule | One two-column list "label — value". No categories, no item numbers, no holding column, no link to the gift clauses. |
| PDF | Noto Sans, one size scale, a signature line and the disclaimer in every page footer, witnesses stacked one under the other. |

## 2. What changed

**Wording (template v2, `packages/shared/src/will/template/common.v2.ts`)**
- An opening recital names the testator, an optional "son of / wife of …", date of birth, address
  and the personal-law statement. It no longer reads as a numbered "Declaration".
- Revocation and capacity are separate sections. Capacity is stated in the terms of ISA s.59:
  sound mind, not a minor.
- Sections are numbered, with sub-clauses (4.1, 4.2 …) wherever a section has more than one paragraph.
- Every specific gift is its own sentence. It names the Schedule item number, and for a joint or
  HUF item it gives "all my share and interest in". Gifts are listed in Schedule order.
- Each residuary share is its own line.
- Survivorship period: chosen by the user (0, 7, 15, 30, 60 or 90 days). The default of 30 matches
  every v1 will. Back-up beneficiaries must meet the same period.
- New statement: if the whole residue fails, it passes to the testator's legal heirs.
- New "Interpretation" section: headings don't affect meaning, and the Schedule is an estimate
  that doesn't limit or enlarge any gift.
- The executor's powers are prefixed "Subject to the law" and include applying for probate where
  the law requires it.
- The guardian appointment is hedged "to the extent the law allows me to make this appointment".
- One execution block: testimonium, place and date, the testator's signature, the attestation
  clause, and two witnesses (Signature, Full name, Age and occupation, Address, Date).

**Schedule**
- Part A (assets) and Part B (liabilities), grouped by category. Empty categories are left out.
- Items are numbered A1… and L1….
- Asset columns: No., Description, Identifier (masked), Holding (Sole / Joint – my share x% /
  HUF – my share x% / Payable to nominee), Passes under (the clause number that disposes of the
  item, residue, or nomination), Estimated value.
- An item whose value is unknown is stored as 0 and printed as "Not valued", never "₹0".
- Insurance rows say that the value is the sum assured.
- In-app guidance notes (e.g. "check your nomination") are never printed.

**PDF (`packages/api/src/services/will/willPdf.ts`)**
- Noto Serif and Noto Serif Devanagari, embedded (OFL; hashes pinned in `test/will/fonts.test.ts`).
  The Noto Sans files were removed: nothing used them any more.
- A named type scale (title, testator, body, section head, schedule head, part head, group head,
  table header and cell, note, execution body, field label, caption, witness head, footer, running head).
- Hanging-indent sub-clauses.
- Keep-with-next for section headings, the Schedule's part and group headings, and the first table row.
- The Schedule opens on a new page. Its table header repeats on every continuation page, under
  "(CONTINUED)".
- The execution block is measured and kept on one page, with the two witnesses side by side.
- A running head ("Last Will and Testament of …") on pages 2 onwards.
- Footer: an initials strip on every page (Testator / Witness 1 / Witness 2) plus "Page x of y".
  This replaces the repeated "Signature of the Testator" line. Signing or initialling every page is
  the common practice against page substitution (see the getnyay specimen notes).
- The template disclaimer prints once, on the last page.
- Mixed Latin and Devanagari lines: centred lines are laid out by hand (pdfkit mis-centres mixed
  font runs), and mixed paragraphs are set ragged-right instead of justified.

**Inputs (backward-compatible; no DB migration; the payload is JSON with defaults)**
- `details.parentage { relation, name }`. Optional, printed only when both are set. The user picks
  the words (son of, daughter of, wife of, husband of, child of, spouse of); nothing is inferred
  from gender.
- `allocation.survivalDays`. Defaults to 30, so drafts saved before this change read exactly as before.

**Other fixes found on the way**
- `removeWillPerson` rebuilt the allocation object field by field and would have dropped `survivalDays`.
- The AI-connector `get_will_summary` tool cast a stored snapshot to `WillPayload` without parsing
  it. Old snapshots now get the schema defaults.

## 3. Final structure of a v2 will

```
LAST WILL AND TESTAMENT / of NAME
Recital: I, NAME[, son of …], born on …, residing at …, <personal-law statement>, make this my last Will …
1.  Revocation
2.  Capacity and free will
3.  My family
4.  Executor                         (only when appointed; validation blocks a will without one)
5.  Guardian of my minor children    (only with a guardian AND a child under 18)
6.  Specific gifts                   (only when there are any)
7.  Gifts of money                   (only when there are any)
8.  Residuary estate
9.  Survivorship and failed gifts
10. Debts and expenses
11. Joint assets and nominations     (only with a joint, HUF or nominee-payable item)
12. Additional wishes                (only when written)
13. Interpretation
SCHEDULE — Part A Assets (by category), Part B Liabilities
Execution: IN WITNESS WHEREOF … Place / Date / Signature of the Testator / attestation / Witness 1 + 2
```
Numbers close up when an optional section is absent. Every cross-reference (back-ups to the
survival sub-clause, the Schedule's "Passes under" column to the gift and nomination clauses) is
computed from the same numbering.

## 4. Statute vs convention

| Item | Basis |
|---|---|
| Testator of sound mind and not a minor | ISA 1925 s.59 (statute) |
| Signature by the testator; attestation by two or more witnesses, each of whom saw the testator sign (or received the testator's acknowledgement) and each signing in the testator's presence | ISA 1925 s.63 (statute). s.63 does **not** require the witnesses to sign in each other's presence; the v2 clause says they did (convention, kept from v1). |
| Witness who is a beneficiary or a beneficiary's spouse | ISA s.67: the will stays valid but that gift is void. Hence the declaration in the attestation clause. |
| Wills of Hindus, Sikhs, Jains and Buddhists | ISA s.57 applies Part VI with the modifications in Schedule III (recital kept from v1) |
| Revocation clause, executor powers, survivorship period, interpretation clause, initialling every page, the Schedule | Drafting conventions, not statutory requirements |
| Registration | Optional (Registration Act s.18); not part of this document |

The drafting references consulted for conventions were the getnyay.in will specimen and its
drafting notes. The finnovate.in, Delhi model-deed, virasatwill and lawmumbai pages were **not**
re-read in this change. No reference is an official mandatory format.

## 5. Needs an advocate (open; not resolved by code)

1. The whole v2 wording, before the first real v2 will is generated. After that, `common.v2.ts` is
   frozen and any change goes into a v3 file.
2. Survivorship: whether 30 days is a sensible default, and how it works with ISA s.105 (lapse)
   and s.109 (a gift to a child or lineal descendant does not lapse if they leave lineal
   descendants). The template does not mention s.109.
3. The "whole residue fails → legal heirs" sentence: correct for each personal law?
4. Guardian clause: HMGA 1956 s.9 limits who may appoint a testamentary guardian (for example, a
   mother's appointment where the father is alive). The hedge "to the extent the law allows" is a
   placeholder, not an analysis.
5. Nominees: the clause that a nominee "holds for the persons entitled under this Will, except
   where the law makes the nominee its owner". Check it against Insurance Act s.39 (beneficial
   nominees), the Companies Act / depository rules, EPF and PPF rules.
6. HUF / coparcenary interest, and Goa (Portuguese Civil Code; the wizard does not exclude Goa domicile).
7. Mortgaged or charged assets given as specific gifts: should the gift carry the debt, or should
   the residue pay it? The template says debts come out of the residue; the statutory position on
   charged property was not checked here.
8. The attestation wording, and whether to keep "both of us being present at the same time"
   (stricter than s.63).
9. The witness fields ("Age and occupation"), and whether to ask for a witness ID number.
10. "Son of / wife of" phrasing for the parentage recital.
11. Muslim personal law and wills of non-Indian domiciles stay blocked (unchanged from v1).

## 6. Known limits

- Unknown values: adapters store an unknown value as 0, so "Not valued" also covers a genuine
  zero balance. Telling them apart needs a nullable value in the estate adapters.
- Back-up beneficiaries are per person, not per gift. A different back-up for each gift is not
  modelled.
- Property survey or registration details print only if the user typed them into the item's label.
  There are no separate fields.
- The disclaimer wording (`WILL_PDF_FOOTER`) is unchanged.
- The web preview (`BlocksView`) was unit-tested but not inspected in a browser.

## 7. Verifying

```
cd portfolioos/packages/api
npx tsx scripts/willSamplePdfs.ts ./will-samples   # A–E, G as PDFs; prints F's blockers
```
Tests: `packages/shared/src/will/template/templateV2.test.ts` (scenarios A–D, F and G against the
text), `packages/api/test/will/willPdf.test.ts` (fonts, determinism, page furniture, scenario E
pagination, scenario H execution page at every possible page break), and the lock test.
