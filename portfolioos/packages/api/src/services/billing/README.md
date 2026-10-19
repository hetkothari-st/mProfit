# services/billing/

Paid plans. `razorpay.service.ts` creates Razorpay orders and verifies payment signatures. `planActivation.service.ts` switches a user's plan once payment is confirmed. Plan limits and gating: `lib/planLimits.ts`, `lib/effectivePlan.ts`, `middleware/requirePlan.ts`. HTTP: `routes/billing.routes.ts`.
