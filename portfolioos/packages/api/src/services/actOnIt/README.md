# services/actOnIt/

Act on it + track record (`docs/superpowers/specs/2026-11-06-act-on-it-design.md`).
The advice itself comes from the advisor engine (`services/advisor`): every rule
now states a headline, a **promise** (gain, risk, cost, liquidity, confidence)
and a **measurement** (how the result is priced against doing nothing). This
folder is what happens to a recommendation after it is made.

- `lifecycle.ts` — accept, not now (7-day snooze), dismiss (skipped), "I already
  did this" (DONE, confirmedBy USER), and expiry (EXPIRED = skipped). The engine
  never replaces ACCEPTED advice, and withdraws open advice that stopped being
  true (WITHDRAWN; it comes back as new advice if it becomes true again).
- `confirm.ts` — "seen in your data": per measurement method, a matcher looks
  for the move in the user's own records within 45 days (a liquid-fund
  purchase of ≥ 80% of the amount, the direct plan bought, the SIP resumed, the
  holding sold, the loan rate lowered). Confirms skipped advice done anyway too.
- `measure.ts`, `measureMath.ts` — at the horizon, acted (confirmed by data):
  acting minus doing nothing; skipped: minus what acting would have earned.
  Real NAVs / rates only; a missing price keeps it PENDING. Not priced in v1:
  rebalancing, FD renewals, advance tax (payments invisible), a weak fund with
  no named alternative, and anything the user only says they did.
- `ruleHealth.ts` — a type whose last 10 confirmed results include 3 under half
  its promised gain is paused (AdviceRuleHealth.pausedAt): open advice
  withdrawn, the engine skips it. Unpause = clear pausedAt.
- `prompts.ts` — pop-up + bell (Alert type ADVICE) + email per prompt; at most 2
  a week (rolling, NEW/NUDGE/RESULT together); urgent (hard deadline within 7
  days) bypasses and does not count. Order: urgent, new advice, nudges,
  results, then size × confidence. Nudge once, 30 days after accepting.
- `view.ts` — the page: current advice, waiting, track record (the ₹ total sums
  measured confirmed results only; skipped results are shown as missed), history.
- `compliance.ts` — the registration line; INA from AppSetting
  `advice.ria_registration`, else "registration in progress".

Job: `jobs/actOnItJob.ts` (05:30 IST; `ENABLE_ACT_ON_IT_JOB=false` disables) —
for users whose plan has ADVICE_ENGINE: engine → expire → confirm → measure →
prompts; then rule health. HTTP: `routes/actOnIt.routes.ts` (`/api/act-on-it`).

New suggestion types live in `services/advisor/rules/` with their inputs in
`services/advisor/actOnItFacts.builder.ts`; contradictory pairs are settled in
`services/advisor/reconcile.ts`. The idle-cash rule uses a bank account's own
rate (`BankAccount.interestRatePct`) when given, else a typical 3%, said so.
