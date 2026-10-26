---
id: F-FAM-020
title: "Take over your account"
module: "Family"
status: Live
roles: "R-VISITOR (link holder)"
settings: []
related: [F-FAM-016]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Take over your account

`F-FAM-020` · Live · Roles: [R-VISITOR](../roles.md#r-visitor) (link holder)

**What it does:** The page behind a hand-over email. The person sets a password and the managed profile becomes their own account; they are signed straight in.

**Why it exists:** Code comment: "It is not a sign-up: the account already exists, with their holdings in it, and this hands it over rather than creating another."

**Where to find it:** Email link `/family/claims/:token`.

**Who can use it:** Anyone holding the link ([R-VISITOR](../roles.md#r-visitor)); the email is fixed to the one the link was sent to.

**Steps**
1. Open the link. "Take over your account" appears with "<keeper> has been keeping <name>'s finances on EveryPaisa, in <family>…".
2. Enter **Choose a password** and **Type it again**.
3. Click **Take over my account**. The toast "This account is yours now" appears and the dashboard opens.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Your email** | Read-only text | Shows the sign-in address | Always read-only |
| **Take over my account** | Button | Claims the account | Disabled until the password is ≥ 8 characters and both match |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Choose a password** | Password | Yes | 8–100 characters | Empty | "Use at least 8 characters." |
| **Type it again** | Password | Yes | Must match | Empty | "These do not match." |

**Settings and toggles here:** None.

**Results:** The profile gets the email and password, stops being managed, keeps its holdings and family place, and takes the invitation's role; an audit row "managed_profile_claimed" is written.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This link isn't open" + "That link is not valid." / "That link has expired." / "That account has already been taken over." | Bad, expired (14 days) or used link | Ask the keeper to send it again |
| "<email> already has an EveryPaisa account." | Address taken | Keeper must invite with another address |

**Limitations:** None beyond the above.

**How it works:** `GET /api/families/claims/:token/peek` and `POST /api/families/claims/:token` (both public, before authentication) — validated body email + password (8–100). Returns a session.

**Related features:** [F-FAM-016](F-FAM-016.md).

**Sources:** `apps/web/src/pages/family/ClaimProfilePage.tsx:25`, `apps/web/src/pages/family/ClaimProfilePage.tsx:72`, `packages/api/src/routes/families.routes.ts:83`, `packages/api/src/services/family/familyClaim.service.ts:142`, `packages/api/src/services/family/familyClaim.service.ts:180`
