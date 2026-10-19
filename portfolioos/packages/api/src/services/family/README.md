# services/family/

Family / household features: viewing and managing relatives' portfolios.

- `family.service.ts` — families, members and per-member permissions.
- `familyScope.service.ts` — **the read scope**: which portfolios a request may see (own, family view, or acting as someone). Used by almost every read query.
- `familyAggregate.service.ts` — family-wide wealth, goals, protection and "needs attention".
- `managedProfile.service.ts` — profiles you manage for relatives (the `X-Act-As` header).
- `familyClaim.service.ts`, `familyInviteEmail.service.ts` — inviting a relative to claim their profile.

HTTP: `routes/families.routes.ts`, `routes/managedProfiles.routes.ts`, `familyDashboard.controller.ts`.
