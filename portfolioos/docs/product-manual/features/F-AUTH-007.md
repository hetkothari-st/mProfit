---
id: F-AUTH-007
title: "Sign out"
module: "Sign-in & session"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-AUTH-006, F-AUTH-009]
---

[← Sign-in & session](../modules/sign-in-session.md) · [Index](../INDEX.md)

# Sign out

`F-AUTH-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Ends the session in this browser and revokes its refresh token on the server.

**Why it exists:** Inferred from behavior: lets you leave a shared or public device safely.

**Where to find it:** Header user menu (your initials/avatar, top right) → **Sign out**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click your avatar in the header. The menu shows "Signed in as <email>".
2. Click **Sign out**. You land on **Sign in**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Sign out** | Menu item (red) | Signs out | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** This browser's session is removed (including the "viewing as family" selection) and the refresh token is revoked. Other devices stay signed in.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| None shown | A failed revoke call is ignored; the browser session is still cleared | None needed |

**Limitations:** There is no "sign out of all devices" button; resetting your password or deleting the account is the only way to end every session. Sign-outs are not recorded in the audit log (see DOCUMENTATION_GAPS).

**How it works:** POST `/api/auth/logout` with the refresh token marks it revoked. The route has no session check, so the server never knows who signed out: the audit entry and the "everywhere" option ([F-AUTH-009](F-AUTH-009.md)) never run.

**Related features:** [F-AUTH-006](F-AUTH-006.md), [F-AUTH-009](F-AUTH-009.md), [D-AUTH-004](../dependencies.md#d-auth-004).

**Sources:** `apps/web/src/components/layout/Header.tsx:51`, `apps/web/src/components/layout/Header.tsx:261`, `apps/web/src/stores/auth.store.ts:84`, `packages/api/src/routes/auth.routes.ts:37`, `packages/api/src/controllers/auth.controller.ts:156`, `packages/api/src/services/auth/auth.service.ts:446`
