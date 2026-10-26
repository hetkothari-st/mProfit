# Settings and Toggles Reference — Mutual Funds (B02)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Mutual Funds, Mutual Fund Analytics

No setting in this area is saved to your account or browser: every control below is a per-dialog or per-visit choice that resets when the dialog closes or the page reloads.

<!-- BEGIN SETTINGS -->
## Mutual Funds → Sync MF via CASParser dialog

### Period <!-- S-MF-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Mutual Funds → Sync MF via CASParser** |
| Purpose | Date range of the requested CAS |
| Default | `All to Date` (source: `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:66`) |
| Values | `All to Date`: 1 January 1990 → today · `Last 12 months` / `Last 6 months` / `Last 3 months`: today minus that many months → today |
| Depends on | — |
| Persists | No — reset when the dialog closes |
| Stored in | Not stored; sent as `fromDate`/`toDate` |
| Backend effect | Passed to casparser.in as `from_date`/`to_date`; server defaults to 1990-01-01 → today when absent |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:41`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:48`, `packages/api/src/services/mf/mfCasparser/mfCasparser.service.ts:350` |

### Portfolio <!-- S-MF-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Mutual Funds → Sync MF via CASParser** |
| Purpose | Shown as the destination portfolio |
| Default | `Default` (source: `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:207`) |
| Values | `Default` or any of your portfolios — **no effect**: the value is never sent |
| Depends on | — |
| Persists | No |
| Stored in | Not stored |
| Backend effect | None (request body has only pan, email, fromDate, toDate) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:85`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:200` |

### Nickname <!-- S-MF-003 -->
| Attribute | Value |
|---|---|
| Control type | Text (max 80) |
| Location | **Mutual Funds → Sync MF via CASParser** |
| Purpose | Shown as an optional label |
| Default | empty |
| Values | Any text — **no effect**: never sent |
| Depends on | — |
| Persists | No |
| Stored in | Not stored |
| Backend effect | None |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:216`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:85` |

## Mutual Funds → Sync via CAMS / KFintech dialog

### Period <!-- S-MF-004 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Mutual Funds → Sync via CAMS / KFintech** |
| Purpose | Date range of the requested CAS |
| Default | `All to Date` (source: `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:75`) |
| Values | `All to Date`: no dates sent (portal default range) · `Last 12/6/3 months`: today minus that many months → today |
| Depends on | — |
| Persists | Stored on the request record |
| Stored in | MFCasMailbackJob.periodFrom / periodTo |
| Backend effect | Filled into the CAMS/KFintech forms at submit |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:50`, `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:181` |

### Portfolio <!-- S-MF-005 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Mutual Funds → Sync via CAMS / KFintech** |
| Purpose | Destination portfolio recorded on the request |
| Default | `Default` — server uses your default portfolio, else your first (source: `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:39`) |
| Values | `Default` or any portfolio you own |
| Depends on | — |
| Persists | Stored on the request record |
| Stored in | MFCasMailbackJob.portfolioId |
| Backend effect | Validated (must be yours) and stored; nothing later reads it, so the arriving PDF is imported wherever the Gmail import pipeline puts it |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:306`, `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:28` |

### Nickname <!-- S-MF-006 -->
| Attribute | Value |
|---|---|
| Control type | Text (max 80) |
| Location | **Mutual Funds → Sync via CAMS / KFintech** |
| Purpose | Label for the request |
| Default | empty |
| Values | Any text up to 80 characters |
| Depends on | — |
| Persists | Stored on the request record |
| Stored in | MFCasMailbackJob (nickname) |
| Backend effect | None visible — no UI lists mailback requests |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:322`, `packages/api/src/controllers/mfCasMailback.controller.ts:24` |

## Mutual Funds → Finvu (Account Aggregator) card

### Unique identifier <!-- S-MF-007 -->
| Attribute | Value |
|---|---|
| Control type | Text |
| Location | **Mutual Funds → Finvu (Account Aggregator)** |
| Purpose | Identifier sent to every Finfactor call and to the import |
| Default | The Finfactor sandbox sample identifier (source: `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:33`) |
| Values | Any non-empty text; empty disables all buttons |
| Depends on | Finfactor configured or demo mode on (operator) |
| Persists | No |
| Stored in | Not stored |
| Backend effect | Sent as `uniqueIdentifier`; not checked against your own consent |
| Who can change | Everyone can type; calls need R-PLUS or higher |
| Sources | `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:62`, `packages/api/src/controllers/finfactor.controller.ts:53` |

### Destination portfolio <!-- S-MF-008 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Mutual Funds → Finvu card → Import into EveryPaisa** |
| Purpose | Where imported Finvu transactions go |
| Default | `+ New "Finvu Imports" portfolio (auto-create)` (source: `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:123`) |
| Values | auto-create: reuse or create a portfolio named "Finvu Imports" · a portfolio: merge into it (must be yours) |
| Depends on | S-MF-007 |
| Persists | No |
| Stored in | Not stored |
| Backend effect | Decides the portfolio of created transactions |
| Who can change | R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:279`, `packages/api/src/ingestion/finfactor/sync.service.ts:117` |

### Statement filter chips <!-- S-MF-009 -->
| Attribute | Value |
|---|---|
| Control type | Chip group |
| Location | **Mutual Funds → Finvu card → Statement** result |
| Purpose | Filter statement rows |
| Default | `All` (source: `apps/web/src/pages/mutualFunds/finvu/StatementView.tsx:34`) |
| Values | `All` · `BUY` · `SELL` · `SIP only` · `DEMAT` · `SOA` (holding mode) |
| Depends on | A Statement result shown |
| Persists | No |
| Stored in | Component state |
| Backend effect | None |
| Who can change | R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/finvu/StatementView.tsx:22`, `apps/web/src/pages/mutualFunds/finvu/StatementView.tsx:101` |

## Fund page → View

### Overview / Detailed calculations <!-- S-MF-010 -->
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | Fund page `/mutual-funds/<scheme code>` |
| Purpose | Plain summary vs full evidence |
| Default | `Overview` (source: `apps/web/src/pages/mf/FundDetailPage.tsx:56`) |
| Values | `Overview`: verdict, strengths, three numbers, holding periods, alternatives · `Detailed calculations`: score card, horizon metrics, findings, portfolio, fund facts |
| Depends on | — |
| Persists | No — every visit opens on Overview |
| Stored in | Component state |
| Backend effect | None (same data) |
| Who can change | R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mf/FundDetailPage.tsx:189` |

### Horizon tabs (1Y, 3Y, 5Y, 7Y, 10Y) <!-- S-MF-011 -->
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | Fund page → **Detailed calculations → Performance and risk** |
| Purpose | Choose the measurement window |
| Default | The shortest horizon with metrics; 3Y if none (source: `apps/web/src/pages/mf/FundDetailPage.tsx:138`) |
| Values | 1, 3, 5, 7, 10 years — all always shown; an empty one says "No N-year record" |
| Depends on | S-MF-010 = Detailed calculations |
| Persists | No |
| Stored in | Component state |
| Backend effect | None |
| Who can change | R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mf/FundDetailPage.tsx:218`, `packages/shared/src/mfAnalytics.types.ts:98` |
<!-- END SETTINGS -->

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
<!-- BEGIN CLIENT-STORAGE -->
| React Query cache `mf-analytics` keys (in memory, not persisted) | Portfolio analysis, fund analytics, findings, verdicts, methodology | On page load | Analysis/fund data on focus/remount; methodology after 1 hour; whole namespace after **Refresh analysis** | Yes — methodology up to 1 hour; cache entries are separated per family view |
| React Query cache `portfolio-holdings`, `transactions`, `imports` (in memory) | Holdings and imports on the Mutual Funds page | On page load | After imports finish, deletes, AMFI sync | Finvu import does not refresh these keys (page reload needed) |
<!-- END CLIENT-STORAGE -->

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
<!-- BEGIN OPERATOR-CONFIG -->
| `CASPARSER_API_KEY` | Purpose: credential for casparser.in (KFintech mailback, CDSL OTP, credits) | Requests fail; users see "Internal server error" in production |
| `CASPARSER_BASE_URL` | casparser.in API base | Defaults to the public casparser.in API |
| `CAMS_MAILBACK_URL` / `KFIN_MAILBACK_URL` | Portal form URLs for the CAMS / KFintech mailback | Defaults to the public portal pages |
| `MFMAILBACK_FIXTURE_MODE` | `1` runs the portal mailback against fixtures | Real portals used |
| `FINFACTOR_API_TOKEN` | Purpose: Finfactor Wealthscape credential | Finvu card shows **Token missing** and disables buttons (unless demo mode) |
| `FINFACTOR_DEMO_MODE` | `true`/`1`/`yes` returns built-in sample payloads | Real Finfactor calls |
| `FINFACTOR_BASE_URL` | Finfactor API base | Built-in default URL |
| `RIA_VERDICTS_ENABLED` | `true` shows Switch candidate verdicts and named replacements (requires RIA registration settings) | Switch candidates shown as Review with the "Analysis only" note |
| `ENABLE_MF_ANALYSIS_JOB` | `false` disables the analysis queue start | Enabled |
| `ENABLE_MF_METRICS_CRON`, `ENABLE_MF_PEER_RANK_CRON`, `ENABLE_MF_SCORE_CRON`, `ENABLE_MF_METADATA_CRON`, `ENABLE_MF_NAV_HISTORY_CRON`, `ENABLE_MF_RECONCILIATION_CRON`, `ENABLE_MF_OPS_ALERTS_CRON`, `ENABLE_MF_FACTSHEET_CRON`, `ENABLE_MF_PROSE_JOB` | `false` disables that MF job | Enabled |
| `ENABLE_LLM_ADVISOR_PROSE` | `true` (with an Anthropic key) lets the prose job narrate verdicts | No narration; verdicts unaffected |
<!-- END OPERATOR-CONFIG -->
