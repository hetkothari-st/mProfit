[Index](../INDEX.md)

# Settings — Gmail connection and inbox scans

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-mail-001"></a>
### Dismiss (Gmail auto-connect banner)
| Attribute | Value |
|---|---|
| Control type | Button (cross) |
| Location | Banner at the top of every signed-in page |
| Purpose | Hide the "Auto-import statements from your inbox." banner |
| Default | Not dismissed |
| Values | Dismissed: banner never shows on this browser · Not dismissed: shows when its other conditions hold |
| Depends on | Banner shows only for @gmail.com/@googlemail.com sign-in emails with no active Gmail connection and Gmail sign-in configured |
| Persists | This device only |
| Stored in | localStorage `gmail-auto-connect-dismissed` |
| Backend effect | None |
| Who can change | Any signed-in user who sees the banner |
| Sources | `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:11`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:72` |

<a id="s-mail-002"></a>
### Scan from / Scan until
| Attribute | Value |
|---|---|
| Control type | Date pickers + presets (**Last 7 days**, **Last 30 days**, **Last 1 year**, **Last 5 years**) |
| Location | `/gmail/scan-setup` (after connecting Gmail) |
| Purpose | Date window of the inbox scan |
| Default | From 5 years ago to today (source: `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:31`) |
| Values | Any range ending today or earlier; the server requires **Scan until** after **Scan from** |
| Depends on | An active Gmail |
| Persists | Stored on the scan job only |
| Stored in | `GmailScanJob.lookbackFrom` / `lookbackTo` |
| Backend effect | Gmail query `after:` / `before:` (until + 1 day) |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) |
| Sources | `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:46`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:61` |
