---
id: F-ADV-014
title: "Nightly fund scoring (house methodology)"
module: "Investment Advisor"
status: Live
roles: "Automatic"
settings: []
related: [F-ADV-005, F-ADV-008]
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Nightly fund scoring (house methodology)

`F-ADV-014` · Live · Roles: Automatic

**What it does:** Each night the server scores mutual funds under the firm's ranking methodology. When the operator has turned on named-fund advice and the methodology is signed and fresh, recommendations name the top-ranked fund for a bucket (badge **House methodology**) with the evidence shown in [F-ADV-008](F-ADV-008.md).

**Why it exists:** Code comment: it runs after the AMFI NAV sync "so today's NAVs are in before anything is scored. Scoring a market on yesterday's prices would be silently wrong".

**Where to find it:** No page of its own; the result appears as the provenance badge and fund evidence on recommendation cards.

**Who can use it:** Automatic; affects [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) users with a risk profile.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None user-facing (operator `RIA_VERDICTS_ENABLED`).

**Results:** A ranked snapshot per bucket; recommendations created afterwards can name a scheme.

**Errors and troubleshooting:** If named funds never appear, the run record states why (`flag_disabled`, `no_signed_methodology`, `snapshot_stale`, `no_risk_profile`); this is not shown on the page.

**Limitations:** Named funds require `RIA_VERDICTS_ENABLED=true`, a signed methodology and a fresh snapshot; without them advice falls back to category-level or NAV-ranked products. Production configuration was not observed.

**How it works:** Cron 22:45 IST daily, run as system (market reference data has no owner); skipped if the previous run is still going; failures are logged, never thrown. Signing a methodology is a separate manual operation. At startup the server refuses to run (exits) if named-fund advice is on but the data cannot support it.

**Related features:** [F-ADV-005](F-ADV-005.md), [F-ADV-008](F-ADV-008.md).

**Sources:** `packages/api/src/jobs/fundScoring.job.ts:117`, `packages/api/src/services/advisor/advisorFacts.builder.ts:314`, `packages/api/src/index.ts:222`

**What this area doesn't do**
- It never places orders, moves money or contacts your broker.
- It does not refresh advice on a schedule; only **Refresh recommendations** does.
- You can't edit target weights, reorder the override list or see past engine runs in the page (API only).
- It does not show your past risk assessments, although they are kept.
- AI connectors (ChatGPT/Claude) cannot read your recommendations.
