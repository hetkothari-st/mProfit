[Index](../INDEX.md)

# Settings — PPF & EPF

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-pf-001"></a>
### Entry Type (EPF)
| Attribute | Value |
|---|---|
| Control type | Radio tiles |
| Location | **PPF & EPF → Add → EPF entry** |
| Purpose | Kind of EPF entry |
| Default | Contribution (monthly) (source: `apps/web/src/pages/assetClasses/EPFFormDialog.tsx:154`) |
| Values | Contribution (monthly) and Opening / current balance add to the holding; Withdrawal / settlement reduces it; Annual interest credit is recorded but not added |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Transaction.transactionType |
| Backend effect | Holding recompute |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/assetClasses/EPFFormDialog.tsx:40` |

<a id="s-pf-002"></a>
### Entry Type (PPF)
| Attribute | Value |
|---|---|
| Control type | Radio tiles |
| Location | **PPF & EPF → Add → PPF entry** |
| Purpose | Kind of PPF entry |
| Default | Annual / partial deposit (source: `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:259`) |
| Values | Deposit and Opening balance add; Withdrawal and Account matured reduce; Yearly interest recorded but not added; deposits show **Account Maturity Date** |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Transaction.transactionType |
| Backend effect | Holding recompute |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:196` |

<a id="s-pf-003"></a>
### Save credentials (encrypted)
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **PPF & EPF → Refresh** |
| Purpose | Store the portal UAN and password on the account |
| Default | Off (source: `apps/web/src/pages/pf/PfRefreshDialog.tsx:36`) |
| Values | On: saved encrypted and used by the worker; Off: passed only to this job |
| Depends on | — |
| Persists | Yes — server (when on) |
| Stored in | ProvidentFundAccount.storedCredentials (encrypted blob) |
| Backend effect | The worker prefers the saved blob when no inline credentials are passed |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/controllers/pf.controller.ts:152` |

<a id="s-pf-004"></a>
### Snooze 30d
| Attribute | Value |
|---|---|
| Control type | Button |
| Location | **PPF & EPF → Auto-fetch accounts**, refresh banner |
| Purpose | Silence the refresh reminder for an account |
| Default | Not snoozed (source: `packages/api/prisma/schema.prisma:3464`) |
| Values | Snoozed for 30 days from the click |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ProvidentFundAccount.nudgeSnoozedUntil |
| Backend effect | Dismisses unread refresh alerts; daily job skips the account until the date |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/assetClasses/ProvidentFundPage.tsx:60` |

<a id="s-pf-005"></a>
### Account type and bank (Link PF Account)
| Attribute | Value |
|---|---|
| Control type | Toggle + select |
| Location | **PPF & EPF → Link account** |
| Purpose | Which portal the passbook is fetched from |
| Default | EPF; PPF bank SBI (source: `apps/web/src/pages/assetClasses/ProvidentFundPage.tsx:261`) |
| Values | EPF (EPFO), PPF at SBI, India Post, HDFC Bank, ICICI Bank, Axis Bank, Punjab National Bank, Bank of Baroda |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ProvidentFundAccount.type, institution |
| Backend effect | Chooses the scraper adapter |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/controllers/pf.controller.ts:79` |
