---
id: F-FAM-005
title: "Family dashboard: needs attention"
module: "Family"
status: Live
roles: "Members on FAMILY+ plan"
settings: [S-FAM-004, S-FAM-005]
related: [F-FAM-004, F-FAM-021]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Family dashboard: needs attention

`F-FAM-005` · Live · Roles: Members on FAMILY+ plan

**What it does:** A feed titled **Needs attention** listing open items across members: deposits maturing within 90 days, insurance premiums due within 30 days, loan EMIs overdue or due within 30 days, members with stale prices, and members who have added no account at all. The header shows "N overdue of M open".

**Why it exists:** Code comment ("FAIRNESS POLICY"): the feed is built so "one member with a messy month cannot occupy the whole feed".

**Where to find it:** **Overview → Family → Overview** tab, second card.

**Who can use it:** Same as [F-FAM-004](F-FAM-004.md).

**Steps**
1. Open the **Overview** tab and read the list. Not applicable beyond reading — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Item rows | Display | One open item each, with member, urgency and amount | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-FAM-004](../settings/family.md#s-fam-004), [S-FAM-005](../settings/family.md#s-fam-005) (your caps) filter siblings' items.

**Results:** Read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load the household's alerts. Try again shortly." | Request failed | Reload |
| "Nothing needs attention among the members you can see. Items belonging to the hidden members would not appear here." | Empty feed while some members are fully hidden from you | Ask an owner for wider visibility |
| "Nothing needs attention right now." | Empty feed, nothing hidden | — |

**Limitations:** At most 5 items per member are shown. Items cannot be dismissed or opened from here. "Has not added any account yet" is only claimed for members whose data is not filtered for you.

**How it works:** `GET /api/families/:familyId/dashboard/attention`. Per member: FD/RD/NSC/KVP/SCSS/SSY/Post Office deposit transactions (BUY, DEPOSIT, OPENING_BALANCE) maturing in the next 90 days (urgency HIGH ≤ 7 days, MEDIUM ≤ 30, LOW otherwise); ACTIVE insurance policies with next premium due within 30 days and loan EMIs (first unpaid instalment of the amortisation schedule) — urgency HIGH if overdue or ≤ 7 days, MEDIUM ≤ 15, LOW otherwise; overdue EMIs are always HIGH; one "N holdings with a stale price" row per member (LOW); "X has not added any account yet" (MEDIUM) when a member has no active bank account and no holding. Each member's items are sorted by urgency then soonest, capped at 5, then interleaved round-robin (every member's first item before anyone's second), each round sorted by urgency.

**Related features:** [F-FAM-004](F-FAM-004.md), [F-FAM-021](F-FAM-021.md), [D-FAM-008](../dependencies.md#d-fam-008).

**Sources:** `apps/web/src/pages/family/widgets/FamilyAttentionCard.tsx:60`, `packages/api/src/services/family/familyAggregate.service.ts:801`, `packages/api/src/services/family/familyAggregate.service.ts:828`, `packages/api/src/services/family/familyAggregate.service.ts:849`, `packages/api/src/services/family/familyAggregate.service.ts:899`
