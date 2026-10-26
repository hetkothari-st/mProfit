[Index](../INDEX.md)

# Settings — Cash Activity

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-cash-001"></a>
### Direction tab (All / Inflows / Outflows)
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | **Cash Activity** |
| Purpose | Filter entries by direction |
| Default | All (source: `apps/web/src/pages/cashflows/CashFlowsPage.tsx:17`) |
| Values | All, Inflows, Outflows (resets to page 1) |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `type` query parameter |
| Who can change | Anyone viewing |
| Sources | `apps/web/src/pages/cashflows/CashFlowsPage.tsx:57` |
