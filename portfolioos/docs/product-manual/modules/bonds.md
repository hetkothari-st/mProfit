[Index](../INDEX.md)

# Bonds

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Bonds** page tracks government, corporate and other bonds you record by hand. It is an optional sidebar class: it appears under **Asset Classes** only after you add it with **Add asset class** ([D-ASSET-008](../dependencies.md#d-asset-008)); the address `/bonds` works either way.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-BOND-001](../features/F-BOND-001.md) | Bonds holdings and entries | Live | Shows summary cards Invested, Current value, Unrealised P&L (with %), a holdings table (Name with ISIN, Type — Govt Bond / Corp Bond / … |
| [F-BOND-002](../features/F-BOND-002.md) | Add, edit and delete a bond entry | Live | The "Add Bond" / "Edit Bond Entry" dialog records a bond buy, sell, coupon, maturity or redemption. |

### What this area doesn't do
- No bond price feed, yield-to-maturity or accrued-interest valuation.
- No coupon schedule or coupon reminders.
