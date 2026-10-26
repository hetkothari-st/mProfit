---
id: F-RENT-013
title: "Rent credited to"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: [S-RENT-002]
related: [F-RENT-006, F-RENT-008, F-RENT-012]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Rent credited to

`F-RENT-013` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** Chooses which of your bank accounts a tenant's rent lands in.

**Why it exists:** Component comment: it turns a rent receipt into money moving through a named bank, in the app's cash flow and in the Tally export.

**Where to find it:** **Add tenancy** dialog, and the khata page under the balance.

**Who can use it:** All plans.

**Steps**
1. Pick an account (shown as nickname or "<bank> <type> ••<last4>") or **Not tracked**. On the khata page it saves immediately: "Rent account updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Rent credited to** | Select | Sets the account | Disabled while accounts load |

**Fields and rules:** Only your own non-closed accounts are listed; others are refused with "That bank account does not belong to you".

**Settings and toggles here:** [S-RENT-002](../settings/rental.md#s-rent-002) (this control).

**Results:** Later rent cash-flow entries carry the account. Help text: "Rent then shows as a credit to this account, here and in the Tally export." or, with no accounts, "Add a bank account first to track where this rent lands."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not update the rent account" / raw request error | Server refused | Pick another account |

**Limitations:** Changing the account does not re-tag earlier entries. Auto-matched credits keep the bank credit's own account.

**How it works:** `PATCH /api/rental/tenancies/:id` with the account id; closing the bank account later sets the link to empty.

**Related features:** [F-RENT-006](F-RENT-006.md), [F-RENT-008](F-RENT-008.md), [F-RENT-012](F-RENT-012.md), [D-RENT-004](../dependencies.md#d-rent-004).

**Sources:** `apps/web/src/components/rental/RentAccountPicker.tsx:12`, `apps/web/src/pages/rental/TenantKhataPage.tsx:337`, `packages/api/src/services/rental/rental.service.ts:379`, `packages/api/prisma/schema.prisma:2181`
