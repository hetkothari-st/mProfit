[Index](../INDEX.md)

# Settings — Goals

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-goal-001"></a>
### Category
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Goals → New goal / Edit** |
| Purpose | Kind of goal |
| Default | Custom (source: `apps/web/src/pages/goals/GoalDialog.tsx:79`) |
| Values | Retirement, Child education, Home purchase, Emergency fund (counts only cash, FDs, RDs and post-office savings/RD/TD), FIRE corpus, Vehicle, Travel, Wealth building, Custom |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.category |
| Backend effect | Emergency fund restricts counted holdings; Child education goals are ticked by default in Coverage check |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/goals/goalMath.ts:63` |

<a id="s-goal-002"></a>
### Priority
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Goals → New goal / Edit** |
| Purpose | Label only |
| Default | Medium (source: `apps/web/src/pages/goals/GoalDialog.tsx:80`) |
| Values | High, Medium, Low (badge colour only) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.priority |
| Backend effect | None |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/goals/GoalsPage.tsx:37` |

<a id="s-goal-003"></a>
### Status
| Attribute | Value |
|---|---|
| Control type | Select (edit only) |
| Location | **Goals → Edit** |
| Purpose | Which section the goal is in |
| Default | Active (source: `apps/web/src/pages/goals/GoalDialog.tsx:81`) |
| Values | Active, Achieved (stamps the achieved date), Paused, Abandoned |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.status, achievedAt |
| Backend effect | Achieved date set or cleared on each save |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/goals/goals.service.ts:115` |

<a id="s-goal-004"></a>
### Inflation rate (decimal)
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Goals → New goal / Edit** |
| Purpose | Expected inflation for the target |
| Default | 0.06 (source: `apps/web/src/pages/goals/GoalDialog.tsx:84`) |
| Values | Fraction below 10; blank = none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.inflationRate |
| Backend effect | Computes an inflation-adjusted target that no screen shows; the needed return ignores it |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/goals/goals.service.ts:210` |

<a id="s-goal-005"></a>
### Expected return (decimal)
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Goals → New goal / Edit** |
| Purpose | The return you expect, to judge on/off track |
| Default | 0.12 (source: `apps/web/src/pages/goals/GoalDialog.tsx:85`) |
| Values | Fraction below 10; blank = no on/off-track verdict |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.expectedReturn |
| Backend effect | **Off-track** when needed return > this |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/goals/goals.service.ts:246` |

<a id="s-goal-006"></a>
### Linked portfolios
| Attribute | Value |
|---|---|
| Control type | Checkboxes |
| Location | **Goals → New goal / Edit** |
| Purpose | Portfolios whose value counts toward the goal |
| Default | None (source: `apps/web/src/pages/goals/GoalDialog.tsx:89`) |
| Values | Any of your portfolios |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.portfolioIds |
| Backend effect | Current value = initial amount + linked holdings' value |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/goals/goals.service.ts:180` |
