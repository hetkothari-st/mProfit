[Index](../INDEX.md)

# Settings — Forex

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-fx-001"></a>
### Currency (balance)
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Forex → Cash → Add balance / Edit** |
| Purpose | Currency of the balance |
| Default | USD (source: `apps/web/src/pages/forex/ForexCashTab.tsx:263`) |
| Values | USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ForexBalance.currency |
| Backend effect | INR equivalent uses that currency's latest rate |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/forex/constants.ts:3` |

<a id="s-fx-002"></a>
### Purpose (LRS)
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Forex → LRS & TCS → Record remittance** |
| Purpose | Reason for the remittance |
| Default | INVESTMENT (source: `apps/web/src/pages/forex/LrsTab.tsx:291`) |
| Values | INVESTMENT, EDUCATION, TRAVEL, GIFT, MAINTENANCE, MEDICAL, OTHER (stored only; no calculation differs) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | LrsRemittance.purpose |
| Backend effect | None beyond storage |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/forex/forex.service.ts:38` |

<a id="s-fx-003"></a>
### Currency (remittance)
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Forex → LRS & TCS → Record remittance** |
| Purpose | Currency sent |
| Default | USD (same line as [S-FX-002](../settings/forex.md#s-fx-002)) |
| Values | The 11 supported currencies |
| Depends on | FX rate box (blank = latest stored rate for that currency) |
| Persists | Yes — server |
| Stored in | LrsRemittance.currency |
| Backend effect | INR equivalent = amount × rate |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/forex/forex.service.ts:284` |
