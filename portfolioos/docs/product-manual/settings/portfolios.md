[Index](../INDEX.md)

# Settings — Portfolios

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-port-001"></a>
### Portfolio type
| Attribute | Value |
|---|---|
| Control type | Select (**Type**) |
| Location | Portfolios → New portfolio / Edit |
| Purpose | Label the portfolio |
| Default | Investment (source: `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:28`, server `packages/api/src/services/holdings/portfolio.service.ts:329`) |
| Values | Investment, Trading, Goal-based, Strategy — shown on the card; no calculation uses it |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Portfolio.type` |
| Backend effect | None beyond storage |
| Who can change | Portfolio creator; family OWNER for family-shared portfolios |
| Sources | `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:134`, `packages/api/prisma/schema.prisma:640` |

<a id="s-port-002"></a>
### Portfolio currency
| Attribute | Value |
|---|---|
| Control type | Select (**Currency**) |
| Location | Portfolios → New portfolio / Edit |
| Purpose | The portfolio's currency code |
| Default | INR (source: `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:29`) |
| Values | INR, USD, EUR, GBP |
| Depends on | Portfolio groups accept only one currency |
| Persists | Yes — server |
| Stored in | `Portfolio.currency` |
| Backend effect | Group membership check ("Group members must share a currency"); values are still shown in rupees |
| Who can change | Portfolio creator; family OWNER for family-shared portfolios |
| Sources | `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:143`, `packages/api/src/services/holdings/portfolioGroup.service.ts:57` |

<a id="s-port-003"></a>
### Set as default portfolio
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | Portfolios → New portfolio / Edit |
| Purpose | Mark one portfolio as your default |
| Default | Off (source: `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:31`) |
| Values | On: listed first with a star; any other default of yours is cleared · Off |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Portfolio.isDefault` |
| Backend effect | Clears `isDefault` on your other portfolios in the same transaction |
| Who can change | Portfolio creator |
| Sources | `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:156`, `packages/api/src/services/holdings/portfolio.service.ts:346` |

<a id="s-port-004"></a>
### XIRR sort
| Attribute | Value |
|---|---|
| Control type | Sort button (**XIRR**) |
| Location | Portfolio detail → Holdings table header |
| Purpose | Rank holdings by return |
| Default | Off (source: `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:73`) |
| Values | Descending → Ascending → Off; holdings without XIRR always last |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | None |
| Who can change | Anyone who can see the portfolio |
| Sources | `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:59`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:108` |
