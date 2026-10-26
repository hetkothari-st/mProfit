[Index](../INDEX.md)

# Settings — Gold & Silver

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-gold-001"></a>
### Gold purity
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Asset Classes → Gold & Silver**, rate bar next to **Gold** (aria label "Gold purity") |
| Purpose | Choose which gold karat's price per gram the bar shows |
| Default | `24` (24K · 999) — first option (source: apps/web/src/lib/metalPurity.ts:32, apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:43) |
| Values | `24` 24K · 999 (factor 1) · `22` 22K · 916 (22/24) · `18` 18K · 750 (18/24) · `14` 14K · 585 (14/24) |
| Depends on | Live gold price available |
| Persists | This device only |
| Stored in | localStorage `everypaisa.goldTicker.karat` |
| Backend effect | None; does not change holding values |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (any signed-in user) |
| Sources | apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:37, apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:53 |

<a id="s-gold-002"></a>
### Silver purity
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Asset Classes → Gold & Silver**, rate bar next to **Silver** (aria label "Silver purity") |
| Purpose | Choose which silver grade's price per gram the bar shows |
| Default | `999` (999 Fine) — first option (source: apps/web/src/lib/metalPurity.ts:39) |
| Values | `999` 999 Fine (×1) · `925` 925 Sterling (×0.925) · `800` 800 (×0.8) |
| Depends on | Live silver price available |
| Persists | This device only |
| Stored in | localStorage `everypaisa.goldTicker.silverPurity` |
| Backend effect | None |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) |
| Sources | apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:39, apps/web/src/lib/metalPurity.ts:38 |
