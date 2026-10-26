[Index](../INDEX.md)

# Insurance

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Insurance** area (sidebar **Asset Classes → Insurance**, route `/insurance`) keeps every policy you hold — term, whole life, ULIP, endowment, health, motor, home, travel and personal accident — with its premiums, nominees, claim contacts and claims. EveryPaisa works out when each premium falls due from the policy's start date and frequency, reminds you before it is due and during the grace period, tracks claims against the regulator's time limits, and shows what the premiums are worth at tax time. Three companion pages hang off it: **Coverage check** (`/insurance/coverage`), **Family insurance sheet** (`/insurance/emergency-sheet`) and **Help and rights** (`/insurance/help`). Nothing in this area is plan-gated.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-INS-001](../features/F-INS-001.md) | Insurance page overview | Live | Shows your policies as certificate-style cards, with a three-figure summary on top — Life cover (sum assured of active term, whole life, … |
| [F-INS-002](../features/F-INS-002.md) | Add a policy | Live | Opens the Add a policy dialog to record a policy: an optional catalogue pick that fills insurer, plan and type, then insurer, policy … |
| [F-INS-003](../features/F-INS-003.md) | Edit a policy | Live | Opens Edit policy with the saved values (the policy number box is empty and shows "Saved, ending 1234 — type to replace"). |
| [F-INS-004](../features/F-INS-004.md) | Delete a policy | Live | Deletes a policy together with its premium payments and claims, after confirmation. |
| [F-INS-005](../features/F-INS-005.md) | Show the full policy number | Live | Policy numbers are shown masked as "●●●● 1234". |
| [F-INS-006](../features/F-INS-006.md) | Coming up and recording a premium payment | Live | The Coming up panel lists active policies with a premium due within 30 days or overdue, most at risk first, each with what to do and a … |
| [F-INS-007](../features/F-INS-007.md) | Premium schedule | Live | The Premiums card on a policy page lists every premium from the start date to the next three upcoming ones (newest first, first 12 shown), … |
| [F-INS-008](../features/F-INS-008.md) | Policy page | Live | Shows one policy in full: a certificate-style header (insurer, plan, type, policyholder, Sum assured or Cover, masked policy number), an … |
| [F-INS-009](../features/F-INS-009.md) | Nominees | Live | The Nominees card lists who receives the money (name, relation, share and appointee for a minor). |
| [F-INS-010](../features/F-INS-010.md) | Who to call | Live | The Who to call card holds your own contacts for the policy — Insurer helpline, Claims email, Claims web page, TPA and TPA helpline (health … |
| [F-INS-011](../features/F-INS-011.md) | Start a claim | Live | Start a claim asks "What happened?" with the claim kinds that fit the policy type, shows who to tell first (your saved helpline or the … |
| [F-INS-012](../features/F-INS-012.md) | Claim tracker | Live | Each claim on the policy page shows what is claimed, when it was reported and its status; a "next" box (Waiting — until <date>, Waiting on … |
| [F-INS-013](../features/F-INS-013.md) | Claims in progress | Live | On the Insurance page, lists every claim not yet closed across all policies, those needing a push first (Ombudsman, then complaint, then … |
| [F-INS-014](../features/F-INS-014.md) | Tax on your premiums | Live | A foldable card that works out what the premiums recorded in a financial year are worth under the Income-tax Act, 2025, old regime only: … |
| [F-INS-015](../features/F-INS-015.md) | Surrender value | Live | For whole life, endowment and ULIP policies, records the insurer's surrender quote (Quoted value (₹), Quoted on) and compares it with the … |
| [F-INS-016](../features/F-INS-016.md) | Premiums from imported statements | Live | The From your imported statements card lists premiums found in imported insurance statements that may belong to this policy, matched by … |
| [F-INS-017](../features/F-INS-017.md) | Find my insurance documents in Gmail | Live | A per-Gmail-account permission. |
| [F-INS-018](../features/F-INS-018.md) | Insurance documents from Gmail | Live | Shows what the Gmail search found and what became of it: Policies found (N) to review and add, Renewals to confirm (N) with proposed … |
| [F-INS-019](../features/F-INS-019.md) | Coverage check | Live | Answers "Are you covered enough, and where are the gaps?" for four areas — Life cover, Health cover, Vehicles, Home — each with a verdict … |
| [F-INS-020](../features/F-INS-020.md) | Family insurance sheet | Live | One printable page of your active policies grouped as Life cover, Health cover and Other cover: for each, the cover, type, Policyholder, … |
| [F-INS-021](../features/F-INS-021.md) | Help and rights | Live | A searchable library of 16 topics in four groups — Buying, Owning, Claiming, When things go wrong — explaining what IRDAI's rules say you … |
| [F-INS-022](../features/F-INS-022.md) | Premium and claim reminders | Live | Creates alerts in Alerts for each active policy's next premium: 30, 15, 7 and 1 days before and on the due day ("<insurer> — <plan> premium … |
| [F-INS-023](../features/F-INS-023.md) | Premiums matched from bank and payment emails | Live | When an approved email event of type "premium paid" is turned into a cash-flow entry, EveryPaisa tries to link it to one of your active … |

Settings for this module: [settings/insurance.md](../settings/insurance.md)

### What this area doesn't do

- You can't change a policy's status (Lapsed, Surrendered, Matured, Claimed) from any screen.
- You can't enter health-cover details (members, room rent, co-pay, sub-limits) or link a vehicle from the policy form.
- Recording a claim, nominee or premium here doesn't notify the insurer.
- There is no bulk import of policies other than the Gmail search.
- Family view does not show other members' policies on these pages.
