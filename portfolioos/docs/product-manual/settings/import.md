[Index](../INDEX.md)

# Settings — Import

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-import-001"></a>
### Target portfolio (optional)
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Import → Upload a file** |
| Purpose | Portfolio that receives the transactions of the next uploaded file |
| Default | **Default / first portfolio** (empty value) (source: `apps/web/src/pages/imports/ImportPage.tsx:41`) |
| Values | A portfolio: every row goes there · Empty: server uses your portfolio marked default, else your first portfolio (`packages/api/src/services/imports/import.service.ts:343`) |
| Depends on | You must own the portfolio ("Portfolio not found" otherwise) |
| Persists | No — page state only; stored on the import job (`ImportJob.portfolioId`) for that file |
| Stored in | `ImportJob.portfolioId` |
| Backend effect | Rows of that job are written to the portfolio; reprocessing keeps it |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/imports/ImportPage.tsx:155`, `packages/api/src/services/imports/import.service.ts:74` |

<a id="s-import-002"></a>
### Remember this password for future locked files
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Tools → Import → Import history → Needs password** dialog |
| Purpose | Keep a working file password for automatic use on later locked files |
| Default | `on` (source: `apps/web/src/components/upload/PasswordPromptDialog.tsx:42`); server default `true` (`packages/api/src/controllers/imports.controller.ts:179`) |
| Values | `on`: a password that unlocked the file is added at the front of your saved list (max 10); a PAN-shaped password is saved as profile PAN instead, only if you have none · `off`: used once (a PAN-shaped password is still saved to an empty profile PAN) |
| Depends on | Only applied when the password actually unlocked the file |
| Persists | Yes — server |
| Stored in | `User.savedFilePasswordsEnc` (encrypted list) or `User.pan`/`panEnc` |
| Backend effect | Saved passwords are tried first on every future locked import (`packages/api/src/lib/decryptIfNeeded.ts:189`) |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/components/upload/PasswordPromptDialog.tsx:97`, `packages/api/src/controllers/imports.controller.ts:206`, `packages/api/src/lib/userDocPasswords.ts:39` |
