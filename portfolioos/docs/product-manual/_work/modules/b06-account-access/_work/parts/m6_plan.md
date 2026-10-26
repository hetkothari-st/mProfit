## Plans & billing

The **Pricing** page (route `/pricing`, reached from the header **Upgrade** button, the sidebar upgrade card, lock cards' **View plans**, and **Settings → Plan → Pricing**) shows the four plans and sells them through Razorpay. Plans are a strict ladder — Free < Plus < Family < Pro/Advisor — and each includes everything below it.

### Compare plans (Pricing page) <!-- F-PLAN-001 -->
**What it does:** Shows the four plans with prices, a feature list and your current plan, with a Monthly/Annual switch.

**Why it exists:** The page text: "Free forever for a single portfolio and the essentials. Upgrade as your needs grow — every tier includes everything in the tier below it."

**Where to find it:** **Pricing** (route `/pricing`), eyebrow "Pricing", title "Plans for every stage of your portfolio".

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Choose **Monthly** or **Annual**.
2. Compare the cards. Your plan's button reads **Current plan**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Monthly** / **Annual** | Switch | S-PLAN-001 | — |
| Plan buttons | Buttons | F-PLAN-002 | See F-PLAN-002 |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-PLAN-001 **Monthly / Annual** — Monthly: Plus ₹499, Family ₹899, Pro/Advisor ₹1,999 a month; Annual: Plus ₹4,999 a year, other paid plans "No annual plan yet".

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The prices and the Family note ("3 members included, +₹199/month per extra member (placeholder)") are marked as placeholders in code. Some listed features have no matching restriction in the app (see Plan card contents below and DOCUMENTATION_GAPS).

Plan card contents (exact):
| Plan | Tagline | Listed features |
|---|---|---|
| Free (₹0) | Get your net worth in one place. | Net worth + dashboard; Manual entry across all asset classes; 1 portfolio; Basic reports (holdings summary, XIRR, cash flow) |
| Plus ("Most popular") | Automate ingestion, unlock the full report catalog. | Everything in Free; Full 30+ tax/CA report catalog; AA/Finvu auto-import — bank, MF, stocks; Multiple portfolios; AI insights (rule-based + LLM); AI Assistant — ask it your XIRR, tax exposure, or "am I overweight in IT?" in plain English; Goal projections |
| Family | One consolidated view for the whole household. | Everything in Plus; Family portfolio sharing (3 seats included); Consolidated family net worth; Consolidated family reports |
| Pro/Advisor | For CAs and advisors running client books. | Everything in Family; Full accounting module — Trial Balance, P&L, Balance Sheet; Unlimited portfolios / clients; F&O-heavy reports (Schedule 43); Priority AA refresh frequency; PDF/ITR exports |

What the server actually gates is listed in the Roles and profiles chapter (R-FREE to R-PRO). "Priority AA refresh frequency" and "Unlimited … clients" are not enforced anywhere; "PDF/ITR exports" has no Pro-only restriction.

**How it works:** Prices come from one shared table that is also what Razorpay charges. The current plan shown is your effective plan (F-PLAN-004).

**Related features:** F-PLAN-002, F-PLAN-003, F-PLAN-004, D-AUTH-004.

**Sources:** `apps/web/src/pages/pricing/PricingPage.tsx:27`, `apps/web/src/pages/pricing/PricingPage.tsx:72`, `apps/web/src/pages/pricing/PricingPage.tsx:86`, `apps/web/src/pages/pricing/PricingPage.tsx:159`, `packages/shared/src/pricing.ts:18`, `packages/shared/src/entitlements.ts:68`, `packages/shared/src/entitlements.ts:70`

### Upgrade with Razorpay checkout <!-- F-PLAN-002 -->
**What it does:** Buys a plan for 30 days (monthly) or 365 days (annual) through Razorpay's checkout window; on success your plan changes immediately.

**Why it exists:** The code comment: upgrades happen "only through the billing flow, never by self-declaring a paid tier at signup".

**Where to find it:** **Pricing → Upgrade to <plan>**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (your own account; refused while managing someone else's).

**Steps**
1. Click **Upgrade to Plus** (or Family, Pro/Advisor). The button reads "Starting checkout…".
2. Razorpay's window opens with your name and email filled in. Pay.
3. On success: toast "Upgraded to <plan>" and features unlock at once.
4. Closing the window cancels quietly.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Upgrade to <plan>** | Button | Starts checkout | Disabled on your current plan ("Current plan"), on Free ("Included"), when that cycle has no price, and while starting |

**Fields and rules:** Not applicable — payment details are entered in Razorpay's window.

**Settings and toggles here:** S-PLAN-001 decides the cycle and duration.

**Results:** Your plan is set to the bought tier with an end date of payment time + 30 or 365 days; a fresh session is issued so the new plan applies to every request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Payments are coming soon. No checkout session was created." | Razorpay not configured on this server | — |
| "Payment failed" or Razorpay's failure text | Payment declined | Try another method |
| "Payment signature verification failed" | Tampered or invalid payment reply | Contact support |
| "This order does not belong to you" | Replaying someone else's order | — |
| "Failed to load Razorpay checkout script" | Script blocked | Allow checkout.razorpay.com |

**Limitations:** Confirmed: the buttons let a paid user buy a lower plan (for example a Pro/Advisor user can click **Upgrade to Plus**), which replaces the higher plan. You cannot renew your current plan early (its button is disabled), there is no automatic renewal, no reminder before expiry, and the end date is not shown in the app. A plan bought while another is active starts its 30/365 days from the payment, not from the old end date.

**How it works:** POST `/api/billing/checkout-intent` creates a Razorpay order for the price, with your user id, tier and cycle stored in the order's notes. After payment, POST `/api/billing/verify-payment` checks the HMAC signature, re-reads the order from Razorpay to trust only its notes, records the payment once (a replay returns your session without extending the plan) and sets plan and end date in one transaction.

**Related features:** F-PLAN-001, F-PLAN-004, W-PLAN-001.

**Sources:** `apps/web/src/pages/pricing/PricingPage.tsx:118`, `apps/web/src/pages/pricing/PricingPage.tsx:217`, `apps/web/src/lib/razorpay.ts:54`, `packages/api/src/routes/billing.routes.ts:33`, `packages/api/src/routes/billing.routes.ts:83`, `packages/api/src/services/billing/planActivation.service.ts:4`, `packages/api/src/services/billing/planActivation.service.ts:27`, `packages/api/src/services/billing/razorpay.service.ts:72`

### Admin plan switch (no payment) <!-- F-PLAN-003 -->
**What it does:** Lets an administrator set their own plan to any tier without paying, to test what each plan unlocks.

**Why it exists:** The code comment: an "ADMIN-only QA escape hatch … without spending real money on every check". Admins get no automatic bypass of plan gates.

**Where to find it:** **Pricing**, under each plan button: **Set (no payment — dev)** (administrators only).

**Who can use it:** R-ADMIN with two-factor sign-in used for this session.

**Steps**
1. Click **Set (no payment — dev)** under a plan.
2. Toast "Plan set to <PLAN> (no payment — ADMIN dev switch)".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Set (no payment — dev)** | Button | Sets your plan | Hidden for non-admins; disabled while switching |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Your plan changes with no end date (it never lapses) and a fresh session is issued.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Turn on two-factor sign-in (Settings) to use admin tools." | No two-factor | F-SET-003 |
| "Sign out and sign in again with your authenticator code to use admin tools." | Session not two-factor | Sign in again |
| "Could not switch plan" | Other failure | Retry |

**Limitations:** None.

**How it works:** POST `/api/billing/dev-set-plan` requires the ADMIN role and a two-factor session, sets the plan and clears the end date.

**Related features:** F-PLAN-001, F-SET-003.

**Sources:** `apps/web/src/pages/pricing/PricingPage.tsx:100`, `apps/web/src/pages/pricing/PricingPage.tsx:228`, `packages/api/src/routes/billing.routes.ts:133`, `packages/api/src/routes/billing.routes.ts:143`

### Plan expiry (back to Free) <!-- F-PLAN-004 -->
**What it does:** When a paid plan's end date passes, the account is treated as Free everywhere: lock cards reappear and Free limits apply. Your data is kept.

**Why it exists:** The code comment: "a lapsed subscription stops unlocking features instead of lasting forever".

**Where to find it:** Not applicable — automatic. The plan shown in **Settings → Plan** and the **Current plan** button change to Free.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO (applies to them).

**Steps:** Not applicable — buy again on **Pricing** to restore.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Paid features lock; with more than one portfolio you cannot add more (existing ones stay).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" (or FAMILY/PRO_ADVISOR) | Plan lapsed | Buy again |

**Limitations:** It takes effect at your next session refresh (within 15 minutes). Confirmed defect: connected chatbots (AI connectors) keep working after a paid plan lapses, because that check reads the stored plan, not the effective one. No email warns you before or after expiry.

**How it works:** Every place that turns the stored plan into access (access token, profile, AI Assistant quota) uses the effective plan: a paid plan whose end date is in the past counts as FREE; no end date means it stands.

**Related features:** F-PLAN-002, F-AUTH-006, F-CONN-006.

**Sources:** `packages/api/src/lib/effectivePlan.ts:16`, `packages/api/src/services/auth/auth.service.ts:92`, `packages/api/src/services/auth/auth.service.ts:65`, `packages/api/src/routes/mcp.routes.ts:48`

**What this area doesn't do**
- No invoices, receipts or payment history in the app.
- No cancellation, refund, downgrade-at-period-end or auto-renewal.
- No coupon or promo codes.
- Extra Family seats cannot be bought on this page (seat payments belong to the Family area, B03).

## Legal pages

Public pages readable without signing in.

### How EveryPaisa uses AI in advice (notice page) <!-- F-LEGAL-001 -->
**What it does:** Shows the full AI-use notice: title "How EveryPaisa uses AI in advice", a version date, a summary and sections "Where AI is used", "What the AI does not decide", "What the AI sees", "Who is responsible", "Its limits", "Records and changes".

**Why it exists:** The code comment: the notice is required under SEBI Investment Adviser Regulations 15(14) and 18(9), and is "public so it can be read before signing up".

**Where to find it:** Route `/legal/ai-use`; linked from the AI Assistant, the AI disclosure card and advisor recommendation cards ("how we use AI", "full notice").

**Who can use it:** R-VISITOR and every signed-in role.

**Steps**
1. Read the page. **← EveryPaisa** returns to the app (or Sign in when signed out).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **← EveryPaisa** | Link | Goes to `/` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The text is the version dated 2026-10-21 in code.

**How it works:** Renders a shared constant, so the same text is used wherever the disclosure appears.

**Related features:** D-CONN-003.

**Sources:** `apps/web/src/pages/legal/AiUsePage.tsx:5`, `packages/shared/src/aiDisclosure.ts:16`, `apps/web/src/components/ai/AIAssistant.tsx:740`, `apps/web/src/App.tsx:115`

**What this area doesn't do**
- There are no Terms of Service or general app privacy policy pages in the app; the `/privacy` page covers only the browser extension and has no in-app link (see DOCUMENTATION_GAPS).

<!-- END MODULES -->
