# services/ca/

Chartered Accountant (professional) workspace.

- `caAccess.service.ts` — CA ↔ client grants: who a CA may act for, and how that starts and ends.
- `caProjection.service.ts` — the client books a CA sees.
- `caAudit.service.ts` — audit trail of CA actions.
- `caInviteEmail.service.ts` — inviting a client.

HTTP: `routes/ca.routes.ts` (`ca.controller.ts`, `caAccounting.controller.ts`).
