[Index](../INDEX.md)

# Settings — Tax Planning

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-tax-001"></a>
### Financial Year (Tax)
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Planning → Tax Planning** |
| Purpose | Year for all tabs and downloads |
| Default | Latest FY with activity, else current FY (source: `apps/web/src/pages/tax/TaxPage.tsx:146`) |
| Values | FYs with capital gains or transactions, newest first |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `fy` parameter (required by summary, schedule-43, CSVs, PDF) |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/tax/TaxPage.tsx:269`, `packages/api/src/services/tax/tax.service.ts:104` |

<a id="s-tax-002"></a>
### Download reports for
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Planning → Tax Planning** |
| Purpose | Whose CA Tax Report / CSV is downloaded |
| Default | **Me** |
| Values | Me or one member (no "Whole family") |
| Depends on | Family view; same rules as [S-REPORT-002](../settings/reports.md#s-report-002) |
| Persists | No |
| Stored in | Hook state |
| Backend effect | `subject`/`familyId` on downloads. The two CSV buttons call an endpoint that ignores it (see DOCUMENTATION_GAPS.md) |
| Who can change | As [S-REPORT-002](../settings/reports.md#s-report-002) |
| Sources | `apps/web/src/pages/tax/TaxPage.tsx:286`, `apps/web/src/pages/tax/TaxPage.tsx:293`, `packages/api/src/controllers/fmv.controller.ts:117` |

<a id="s-tax-003"></a>
### FMV / unit override
| Attribute | Value |
|---|---|
| Control type | Number per row (per ISIN) |
| Location | **Planning → Tax Planning → Grandfathering (112A FMV)** |
| Purpose | Your 31-Jan-2018 price per unit for an ISIN, replacing the seed value |
| Default | Seed value where one exists, else empty ("Enter FMV") |
| Values | Number ≥ 0 · revert = delete override |
| Depends on | Row must have an ISIN |
| Persists | Yes — server, your account |
| Stored in | User FMV override record (per user + ISIN) |
| Backend effect | Invalidates your FMV cache and starts a background capital-gains recompute; changes Schedule 112A, the summary and CSV FMV column |
| Who can change | The account owner; [R-MANAGER](../roles.md#r-manager) for the managed person |
| Sources | `apps/web/src/pages/tax/TaxPage.tsx:1083`, `packages/api/src/controllers/fmv.controller.ts:99`, `packages/api/src/controllers/fmv.controller.ts:108` |
