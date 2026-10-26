---
id: F-AUTH-006
title: "Staying signed in: resume, refresh and expiry"
module: "Sign-in & session"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-AUTH-001]
related: [F-AUTH-001, F-AUTH-007, F-PLAN-004]
---

[← Sign-in & session](../modules/sign-in-session.md) · [Index](../INDEX.md)

# Staying signed in: resume, refresh and expiry

`F-AUTH-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Keeps you signed in without asking again: it renews your access every 15 minutes in the background, picks your session back up after a reload or in a new tab, and signs you out only when the server rejects the session.

**Why it exists:** The code comments: a rate limit, a server error or "a phone that has lost signal" must not sign you out; only the server rejecting the session may.

**Where to find it:** Not applicable — it runs on every signed-in page. While your session is being resumed you see a spinner.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (any signed-in person).

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-AUTH-001](../settings/sign-in-session.md#s-auth-001) decides whether the stored session survives closing the browser.

**Results:** You stay signed in for up to 30 days of inactivity on a remembered device. If the session is rejected you are sent to **Sign in**, and after signing in you return to the page you were on.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Sent to Sign in unexpectedly | Refresh token expired (30 days), revoked (signed out, password reset, account deletion), or reused | Sign in again |
| Signed out on every device at once | A refresh token was presented twice — the server treats this as a copied session and revokes all sessions ("Session invalidated — please sign in again") | Sign in again; consider changing your password |
| Endless spinner on load | The network is down; the app keeps retrying with backoff up to 30 seconds | Wait for the connection |

**Limitations:** A plan change made elsewhere (for example a plan that expired) is reflected only at the next refresh, up to 15 minutes later. A non-admin calling an admin-only API gets a "401" which makes the app refresh the session once before showing the error (see DOCUMENTATION_GAPS).

**How it works:** The session (access token, refresh token, expiry) is kept in local or session storage under `everypaisa.auth`; your profile is not stored and is re-fetched from GET `/api/auth/me` on load. A timer refreshes 2 minutes before the 15-minute access token expires (POST `/api/auth/refresh`). Any API call answered 401 (other than `/api/auth/*`) triggers one refresh and a retry. Only one refresh runs at a time, because refresh tokens are single-use. Each refresh revokes the used refresh token, issues a new pair, keeps the "second factor" mark, and refuses deactivated accounts ("Account deactivated"), client records with no login, and accounts scheduled for deletion ("Account scheduled for deletion"). A refresh also counts as activity for Succession inactivity tracking (B03).

**Related features:** [F-AUTH-001](F-AUTH-001.md), [F-AUTH-007](F-AUTH-007.md), [F-PLAN-004](F-PLAN-004.md).

**Sources:** `apps/web/src/components/layout/ProtectedRoute.tsx:12`, `apps/web/src/hooks/useResolvedSession.ts:24`, `apps/web/src/hooks/useResolvedSession.ts:37`, `apps/web/src/hooks/useTokenRefresh.ts:5`, `apps/web/src/components/layout/AppShell.tsx:33`, `apps/web/src/api/client.ts:64`, `apps/web/src/api/client.ts:86`, `apps/web/src/api/client.ts:98`, `apps/web/src/stores/auth.store.ts:120`, `packages/api/src/services/auth/auth.service.ts:411`, `packages/api/src/services/auth/auth.service.ts:427`, `packages/api/src/services/auth/jwt.service.ts:20`
