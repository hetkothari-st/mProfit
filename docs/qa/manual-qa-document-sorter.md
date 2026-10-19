# Manual QA — Documents (auto-sorting vault)

Spec: `docs/superpowers/specs/2026-10-14-document-sorter-design.md`. Needs a PLUS-plan user, Redis, and a local Postgres.
Automated coverage: `test/docSorter/*` (87 tests). This list is what a person still has to look at.

## Sorting

- [ ] Drop a real, text-based bank statement PDF → lands in `<Your name> / Bank Statement`, named `Bank Statement_<period end>.pdf`.
- [ ] Drop a real ITR-V acknowledgement → `ITR_<FY end>.pdf` (e.g. AY 2025-26 → `ITR_2025-03-31.pdf`).
- [ ] Drop a Form 16, a salary slip and an income certificate → each in its own type folder.
- [ ] Drop a **photo or scan** (JPG/PNG/HEIC) of an income certificate → read by OCR, filed under the name on it.
- [ ] Drop a **scanned PDF** (no text layer) → OCR reads the first pages and files it.
- [ ] Drop 10+ files at once → each shows Uploading → Reading… → Filed into … without a page reload.
- [ ] Documents for two different people → two folders; a misspelt name makes a separate "auto-created" folder.

## Safety nets

- [ ] Drop the same file twice (also from two tabs at once) → still one copy; the second says "Already in your Documents".
- [ ] Password-protected PDF → "Needs a password" under *Needs attention*; a wrong password keeps it there; the right one files it.
- [ ] A file with no readable name (blank scan, plain note) → *Needs attention* with a reason; **Assign** moves, renames and files it.
- [ ] An unsupported type (DOCX/XLSX) → stored under *Needs attention*, not lost and not "read".
- [ ] Drop 21 files at once → the page sends them in batches of 20, none lost.
- [ ] AI budget capped (set the monthly cap to ₹1) → files that need the AI fallback land in *Needs attention* ("AI reading is over budget"), never *Failed*.
- [ ] Corrupt PDF → *Needs attention* ("Could not read this file") and a row in the import failures list.

## Folders

- [ ] Rename an auto-created folder; renaming onto an existing folder's name is refused with a "merge instead" message.
- [ ] Merge folder A into B → files move, same-name files get `-2`, A disappears.
- [ ] Move a file to another person/type → it is renamed to the new type and keeps its date.
- [ ] Delete a file (two-step confirm) removes it from the folder and from the vault list.

## Download

- [ ] Download one file → opens with the sorted name.
- [ ] Download a type folder, a person, and everything as zips → structure is `Person/Type/file`.
- [ ] Download works months later (files are in Postgres, encrypted per user — confirm after a redeploy).

## Access and plan

- [ ] FREE plan user sees the locked Documents page and the API returns the plan-gate error.
- [ ] Another user's file ids (file, person, zip filter) return not-found, never data.
- [ ] Sidebar: **Tools → Documents**; page works at 375px with no horizontal scroll.
- [ ] The same files also show in the existing document vault list (`ownerType PERSON_DOCS`) — intended.

## Known limits (v1)

- OCR can misread look-alike letters (capital I vs lowercase l), which makes a near-duplicate folder → use Rename/Merge.
- Scanned PDFs: only the first 3 pages are read.
- DOCX/XLSX/CSV are stored but not read.
