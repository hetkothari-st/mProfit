[Index](../INDEX.md)

# Settings — Rental

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-rent-001"></a>
### Grid / Map (Rental)
| Attribute | Value |
|---|---|
| Control type | Two-button toggle |
| Location | **Asset Classes → Rental → Properties**, above the cards |
| Purpose | Cards or map |
| Default | `grid` (source: `apps/web/src/components/property/useListView.ts:9`) |
| Values | **Grid** · **Map** |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage key `everypaisa.listView.rental` |
| Backend effect | As [S-REST-001](../settings/real-estate.md#s-rest-001) for rental properties |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/rental/RentalListPage.tsx:684`, `apps/web/src/components/property/useListView.ts:26` |

<a id="s-rent-002"></a>
### Rent credited to
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Add tenancy** dialog; tenant khata page |
| Purpose | Which bank account the rent lands in |
| Default | "Not tracked" (null) |
| Values | One of your non-closed bank accounts · **Not tracked** |
| Depends on | Bank accounts exist |
| Persists | Yes — server |
| Stored in | `Tenancy.bankAccountId` |
| Backend effect | Later rent/deposit cash flows carry this account (shown in Cash Activity and Tally export); refused for another user's account |
| Who can change | Owner |
| Sources | `apps/web/src/components/rental/RentAccountPicker.tsx:12`, `packages/api/src/services/rental/rental.service.ts:379`, `packages/api/src/services/rental/rentalLedger.service.ts:373` |

<a id="s-rent-004"></a>
### Due day of month
| Attribute | Value |
|---|---|
| Control type | Number (1–31) |
| Location | **Add tenancy** dialog |
| Purpose | Day rent is due each month |
| Default | 1 (sources: `apps/web/src/pages/rental/RentalDetailPage.tsx:639`, `packages/api/prisma/schema.prisma:2171`) |
| Values | 1–31; clamped to the last day of shorter months |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Tenancy.rentDueDay` |
| Backend effect | Sets each receipt's due date, which drives Overdue (due + 7 days), reminders and auto-match windows |
| Who can change | Owner; set once at creation in the web app |
| Sources | `packages/api/src/services/rental/rental.service.ts:178`, `packages/api/src/services/rental/rental.service.ts:408` |

<a id="s-rent-003"></a>
### Send via Email / SMS
| Attribute | Value |
|---|---|
| Control type | Two toggle chips |
| Location | **Rental → Properties** → Pending tenant reminders → **Send via** |
| Purpose | Channels for the next **Approve & send** |
| Default | Both on (source: `apps/web/src/pages/rental/RentalRemindersPanel.tsx:526`); a chip is off and disabled when the tenant lacks that contact |
| Values | Email on/off · SMS on/off; both off disables **Approve & send** |
| Depends on | Tenant email / phone; Gmail connection; operator SMS provider |
| Persists | No — one-shot override for this send; the stored per-reminder channels are unchanged |
| Stored in | Request body `channels` |
| Backend effect | Only enabled channels are attempted |
| Who can change | Owner |
| Sources | `apps/web/src/pages/rental/RentalRemindersPanel.tsx:703`, `packages/api/src/services/rental/rental.reminders.service.ts:541` |

<a id="s-rent-005"></a>
### Apply to month
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Khata → **You got**/**You gave** dialog → "Apply to month — leave blank to settle oldest first" |
| Purpose | Pin a credit to a month |
| Default | "Settle oldest first" (blank) |
| Values | Blank: fills the oldest open charge first · a month: fills that month first, remainder spills to oldest |
| Depends on | Tenancy has rent months |
| Persists | Yes — on the entry |
| Stored in | `RentLedgerEntry.forMonth` |
| Backend effect | Changes allocation and therefore month statuses |
| Who can change | Owner |
| Sources | `apps/web/src/pages/rental/TenantKhataPage.tsx:177`, `packages/api/src/services/rental/rentalLedgerMath.ts:1` |
