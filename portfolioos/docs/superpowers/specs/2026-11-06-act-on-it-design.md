# Act on it + Track record — design

Date: 2026-11-06. Status: draft for owner approval.
Mockups (throwaway): brainstorming session `surfaces-v4.html` (section, pop-up, alerts).

## 1. Intent

EveryPaisa watches the user's own money and, at the right moment, puts one
specific, well-backed step in front of them that earns or saves them money.
Every suggestion shows the gain, risk and cost, and its reasons. Every
suggestion is logged and later measured against doing nothing, so the app
builds a public-to-the-user track record: how much was gained by acting, how
much was missed by skipping. The track record is what earns the user's trust.

Example: savings have stayed well above 3 months of spending for 9 months,
earning the savings rate. Suggest moving the surplus to a liquid or overnight
fund, show the extra per year, the risk and the cost, and later show what it
actually earned compared with staying put.

The firm's SEBI RIA registration is in progress and will be in place at public
release. Suggestions are made as registered investment advice; the INA number
is a placeholder until then.

## 2. Goals

- One home for all advice: "Act on it" replaces the recommendation list on the
  Advisor page. Every existing advisor-engine recommendation type and every
  new type below goes through it.
- Suggestions are reliable, honest and backed by the user's own data; each
  shows expected gain, risk, cost, confidence and "why now".
- Suggestions appear at the right time (when actionable, before deadlines).
- A track record: given, accepted, confirmed, skipped; a "₹ vs doing nothing"
  total; and a per-suggestion history with the actual result next to the
  promise.
- Fully automatic. No person reviews or signs off anything at run time (owner
  decision). The system decides what, when, how confident, and whether a
  suggestion type is still trustworthy.

## 3. Non-goals

- Moving money or placing orders. "Accept advice" records intent; the user
  acts elsewhere (or in the app's existing flows).
- Replacing the adviser chat. The chat stays and may point to a suggestion; it
  does not keep its own list.
- Advice on things the app holds no data for.

## 4. Anti-goals (failure even if it "works")

- Wrong advice: a suggestion whose facts are wrong, whose numbers don't add
  up, or that conflicts with another suggestion.
- Advice that doesn't do what it said: "≈ ₹6,300 more", "money back in 1 day",
  "₹0 commission" must hold, and are checked afterwards.
- Noise: more than 2 prompts a week (see §9).
- A track-record total inflated by taps, guesses or unmeasured items.
- Any figure written by an LLM.

## 5. Decisions made with the owner

| # | Decision |
|---|---|
| D1 | Track both "accepted" (tap) and "confirmed" (seen in the user's data). The ₹ total counts only confirmed moves and skipped ones; accepted-but-unconfirmed are listed, not counted. |
| D2 | Every viable, reliable, honest, backed suggestion type is in scope (catalogue §7). |
| D3 | Suggestions whose outcome cannot be priced (e.g. health cover) are still made, shown as "not measured", excluded from the ₹ total. |
| D4 | Surfaces: a section (own page), an in-app pop-up, and alerts (bell + email). |
| D5 | Visual direction: mockup v4 — app dark theme, lime accent, Fraunces headings, all numbers in the app's numeric face (Inter Tight, tabular figures, as `.numeric-display`). Straight (honest) projection lines. |
| D6 | Replace the Advisor page's recommendations; merge everything into Act on it. |
| D7 | Fully automatic; no human sign-off at run time. |
| D8 | At most 2 prompts (pop-up or alert) per user per week, unless urgent. |

## 6. How it works

### 6.1 Lifecycle of one suggestion

```
detected → shown (OPEN) ──Accept──▶ ACCEPTED ──seen in data──▶ CONFIRMED ──▶ RESULT
                  │                     └─ not seen after wait ─▶ ACCEPTED_UNSEEN (nudge once)
                  ├──Not now──▶ SNOOZED (returns later, not counted as skipped)
                  ├──Dismiss / expires──▶ SKIPPED ──▶ RESULT (what was missed)
                  └──user acts anyway (seen in data) ──▶ CONFIRMED
"I did this elsewhere" ──▶ CONFIRMED_BY_USER (labelled as the user's claim; counted? see §12)
```

- Each suggestion freezes, at creation: the facts it used, the code-written
  rationale, the promised figures (gain, risk band, cost, liquidity), the
  measurement method and the do-nothing baseline.
- A suggestion that is no longer true before the user acts (cash spent, FD
  already renewed) is withdrawn and recorded as "withdrawn, no longer
  applies", not as skipped.

### 6.2 Confirmation ("seen in data")

Per type, a matcher looks for the action in the user's data after acceptance
(or after creation, for skipped-but-done): e.g. a liquid/overnight fund
purchase within ±20% of the suggested amount within 45 days; the direct
plan replacing the regular one in holdings; a SIP instalment in the dip month;
a realised gain booked before 31 March. Matchers are deterministic and
versioned.

### 6.3 Measuring the result against doing nothing

At the suggestion's horizon (type-specific: e.g. 12 months for idle cash, the
FY end for tax items, each anniversary for regular→direct), compute:

- acted path: what the user's money actually did (real NAVs, real rates,
  real tax rules);
- do-nothing path: the frozen baseline replayed with real data (savings rate
  from the account, the regular plan's NAV, the tax that would have been due).

Result = acted − do-nothing (or, for skipped, do-nothing's shortfall against
the acted path = "missed"). Interim results may show "so far" before the
horizon. Each result shows the promise beside it, including when the result is
worse than promised. Unpriceable types are "not measured".

### 6.4 Self-policing (replaces human review, D7)

- Evidence bar per type: minimum months of data, data freshness, required
  sources agreeing. Unmet ⇒ the type stays silent for that user. Unknown
  spending ⇒ no idle-cash advice (existing engine rule, kept).
- Conflict check across all open suggestions before anything is shown; a
  conflicting pair is reconciled or both held back.
- Promise-keeping: each type's measured results across all users are compared
  with what it promised. If a type misses its own promise too often (proposed:
  3 of its last 10 measured results, or a systematic shortfall), the type is
  paused automatically and its open suggestions withdrawn, logged for the
  record. Builder sets exact thresholds and documents them.
- Named funds: kept behind the existing signed-methodology gate (assistant's
  call, see §12); without it, advice names the category ("a liquid fund,
  direct plan").

## 7. Suggestion catalogue (v1)

All types use the user's own data only. "Existing" = an advisor-engine rule
or insight that already exists and moves into Act on it.

| Type | Trigger (when) | Evidence it needs | Measured by |
|---|---|---|---|
| Idle savings → liquid/overnight fund (new) | Balance above N months of spending for ≥ M months | Bank balance history; monthly spending (spending store / Safe to Invest) | Fund NAV vs account's savings rate |
| Cash deployment into underweight assets (existing) | Surplus above emergency fund, allocation drift | Risk profile, holdings, expenses | NAVs vs cash |
| Rebalance drift (existing) | Drift beyond band | Holdings, model portfolio | Rebalanced vs held portfolio |
| Concentration trim (existing) | Single holding over limit | Holdings | Not measured or vs trimmed path (builder decides, document) |
| Tax-loss harvesting (existing) | Unrealised losses + realised gains, before FY end | Capital gains, holdings | Tax saved |
| Book gains up to the LTCG exemption (new) | Feb–Mar, unused exemption | Capital gains, holdings | Tax saved vs not booked |
| Regular → direct switch (new, from MF analytics) | Regular plan held, direct exists | Holdings, scheme master, TER | Direct vs regular NAV |
| Underperforming fund (new, from MF findings) | High-confidence finding | MF findings with confidence | Fund vs suggested alternative/category |
| Stopped SIP after a dip (new) | SIP missed during/after a fall | SIP plans/transactions, index | SIP units bought vs not |
| FD maturing (new, from insights) | ≤ 14 days to maturity | FD records | Renewal vs alternative rate |
| Loan refinance (new, from loan checks) | Market rate materially below the user's | Loans, loan rates | Interest saved |
| Goal shortfall SIP (existing) | Goal off track | Goals, holdings | Goal progress vs without |
| Advance-tax due (new) | ≤ 7 days to an instalment | Advance tax service | Interest (234B/C) avoided |
| Emergency fund too thin (new) | Cash below N months of spending | Balances, spending | Not measured |
| Health cover too low (new) | Cover below a city/age benchmark | Insurance policies | Not measured |
| Risk profile review (existing) | Profile stale | Risk assessment | Not measured |

Builder may add types later only if they meet the same bar.

## 8. Surfaces (mockup v4)

- **Section** (own sidebar page, replaces Advisor recommendations): the
  current top suggestion as a large card — plain headline, two-paths chart
  (do-nothing vs acting, honest straight lines), "why now" panel, risk meter,
  cost, money-back time, confidence; Accept advice / Ask why / Not now; "N more
  waiting". Below: track record (₹ vs doing nothing, given → acted →
  confirmed) and the dated history with states and results (gains right in
  lime, misses left in coral, hatched = accepted not seen, blank = not
  measured).
- **Ask why**: the frozen code-written rationale, the facts used (with dates),
  assumptions, and how it will be measured. Optional LLM narration only via
  the existing prose-consistency guard.
- **Pop-up**: corner card on any page, once, the next session after a new
  suggestion is ready; "See the advice" / "Later".
- **Alerts**: bell + email; three kinds — new advice, "did you do it?" nudge
  (once, after the confirmation window), "result is in".
- Compliance line on card and email: "SEBI-registered investment adviser, INA
  [placeholder]. Advice, not a guarantee of returns." Existing AI-use
  disclosure applies.

## 9. Frequency (D8)

- Max 2 prompts (pop-ups + alerts combined) per user per rolling 7 days.
  The section itself always shows everything open; the cap only limits
  interruptions.
- Urgent bypasses the cap: assistant's proposal — a hard deadline within 7
  days with money at stake (FY-end tax actions, advance-tax instalment, FD
  maturing). Builder documents the exact list.
- Ordering when more than the cap is ready: biggest ₹ impact × confidence
  first; the rest wait in the section.

## 10. Constraints

- Money is Decimal; API money as strings; RLS on every new user table
  (existing conventions).
- Rationale and every figure are code-generated and deterministic; LLM text,
  if any, cannot introduce numbers (existing guard).
- Uses only data the app already holds; respects the spending consent (bank
  spending-derived facts only for users who agreed).
- No new Railway services; jobs run in the existing API process.
- Public repo: no real user figures in tests, fixtures or docs.

## 11. Migration

- Existing AdvisorRecommendation rows appear in the history as "given, before
  tracking" with no ₹ result and are excluded from the total.
- The Advisor page's recommendation list is removed; the page links to Act on
  it (or Act on it takes its place in the sidebar — builder's choice).

## 12. Calls the assistant made (owner to check)

- Named funds stay behind the existing signed-methodology gate; otherwise
  category-level advice. (Owner said "no one does anything"; this gate is the
  one existing exception — reverse if unwanted.)
- "Not now" snoozes instead of counting as skipped; a suggestion counts as
  skipped when dismissed or when it expires.
- The "did you do it?" nudge goes once, after a type-specific window
  (default 30 days).
- "I did this elsewhere" is allowed and labelled as the user's claim; proposal:
  listed but NOT counted in the ₹ total (consistent with D1).
- Auto-pause threshold proposal: 3 misses in a type's last 10 measured results.
- Urgent = hard deadline within 7 days with money at stake.

## 13. Left to the builder

Exact data model (likely extending AdvisorRecommendation/AdvisorRun with
states, promises, baselines, matcher and result records), per-type matcher and
measurement code and horizons, thresholds per evidence bar (documented), job
scheduling, the confirmation windows, and how the sidebar entry is named and
placed. Build in phases: (1) the store + lifecycle + section with the existing
engine types; (2) new types; (3) measurement and track record; (4) pop-up,
alerts and the frequency cap; (5) self-policing auto-pause.

## 14. Open items that need the owner

- RIA: INA number and compliance wording at release; the firm remains legally
  responsible for system-generated advice under SEBI's adviser rules.
