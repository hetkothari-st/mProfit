[Index](../INDEX.md)

# Settings — Sign-in & session

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-auth-001"></a>
### Remember me on this device
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Sign in** page, under the password field |
| Purpose | Decides whether your session survives closing the browser |
| Default | Ticked, unless this browser last stored "not remembered" (source: `apps/web/src/pages/auth/LoginPage.tsx:67`, `apps/web/src/stores/auth.store.ts:14`). A new account created on the sign-up page is always remembered (`apps/web/src/pages/auth/RegisterPage.tsx:117`). |
| Values | Ticked: the session tokens are kept in the browser's local storage and survive closing the browser. Unticked: they are kept in session storage and end when the tab is closed; any copy in local storage is deleted. |
| Depends on | None. The Google button on the sign-in page uses the same choice (`apps/web/src/pages/auth/LoginPage.tsx:228`). |
| Persists | This device only |
| Stored in | localStorage key `everypaisa.auth.remember` (`apps/web/src/stores/auth.store.ts:10`); the session itself under `everypaisa.auth` (`apps/web/src/stores/auth.store.ts:110`) |
| Backend effect | None — the server issues the same 30-day refresh token either way |
| Who can change | [R-VISITOR](../roles.md#r-visitor) (at sign-in) |
| Sources | `apps/web/src/stores/auth.store.ts:30`, `apps/web/src/pages/auth/LoginPage.tsx:199` |
