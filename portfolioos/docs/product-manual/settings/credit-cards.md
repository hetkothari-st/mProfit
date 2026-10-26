[Index](../INDEX.md)

# Settings — Credit Cards

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-card-001"></a>
### Status (card)
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Card lifecycle |
| Default | `Active` (form `apps/web/src/pages/creditCards/CreditCardListPage.tsx:288`; server `packages/api/src/services/banking/creditCards.service.ts:180`) |
| Values | `Active`: counted in the summary strip and dashboard, high-utilisation warning, reminders · `Blocked` / `Closed`: listed under **Blocked / Closed**, excluded from totals and reminders; **Payment due** only when an unpaid statement exists. (`INACTIVE` is accepted by the API but not offered.) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.status` |
| Backend effect | Filters for reminders and dashboard |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:546`, `packages/api/src/services/banking/creditCards.service.ts:26`, `packages/api/src/services/banking/creditCards.service.ts:450` |

<a id="s-card-002"></a>
### Network
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Card network shown on the card face |
| Default | `— select —` (none); filled from the catalogue when a catalogue card is picked |
| Values | Visa, Mastercard, RuPay, American Express, Diners Club (`OTHER` accepted by the API) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.network` |
| Backend effect | None beyond display |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:258`, `packages/api/src/services/banking/creditCards.service.ts:24` |

<a id="s-card-003"></a>
### Statement day
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Day of the month the bill is generated |
| Default | `1` (source: `apps/web/src/pages/creditCards/CreditCardListPage.tsx:284`) |
| Values | 1–31; shown on the card page ("Statement day: N") |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.statementDay` |
| Backend effect | None found (display only) |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:515`, `packages/api/src/controllers/creditCards.controller.ts:34` |

<a id="s-card-004"></a>
### Due day
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Day of the month payment is due |
| Default | `20` (source: `apps/web/src/pages/creditCards/CreditCardListPage.tsx:285`) |
| Values | 1–31; with no unpaid statement, **Payment due** on the list is the next occurrence of this day (clamped to the month's last day) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.dueDay` |
| Backend effect | None (reminders use statement due dates) |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:520`, `apps/web/src/lib/creditCardDue.ts:67` |
