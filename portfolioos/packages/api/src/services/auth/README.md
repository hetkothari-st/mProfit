# services/auth/

Sign-up, login, sessions and second factor.

- `auth.service.ts` — registration with email code, login (incl. the 2FA step), refresh, logout; `issueSession` mints every session.
- `jwt.service.ts` — access-token signing/verification and refresh-token generation.
- `password.service.ts` — password hashing and verification (bcrypt).
- `twoFactor.service.ts` — TOTP enrolment, verification and backup codes.

HTTP: `routes/auth.routes.ts` → `controllers/auth.controller.ts`. Middleware that checks the token: `middleware/authenticate.ts`.
