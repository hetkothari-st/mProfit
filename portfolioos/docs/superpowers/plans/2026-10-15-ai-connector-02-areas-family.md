# AI Connector Part 2 (areas, family, sharing, entry points) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, chosen by the user to save tokens). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Finish the AI Connector:
- tools for the remaining nine areas
- family members (per-member sharing, opt-in for members with their own login, `member` argument on every tool)
- Edit sharing and Recent activity on the settings page
- entry points from the sidebar, the user menu and the assistant panel

**Architecture:** This builds on Part 1 (branch `feat/ai-connector`).
- **Area tools** are `ConnectorTool`s added to `CONNECTOR_TOOLS`. They call the existing list services and emit only allowlisted fields. Results pass through `maskForChatbot`.
- **Family access** is resolved per call by one module, `services/mcp/people.ts`. It decides which user ids a grant may read, and under which area limits. Each tool then runs once per person, inside that person's RLS context.

**Spec:** `docs/superpowers/specs/2026-10-14-ai-connector-design.md` (sections 6, 7.2, 8, 10 "Part 2").

**Code map:** gathered for this plan, kept in the executor's context, and summarized under each task below.

**Plan style (ruling, token budget):** tasks give exact files, interfaces, rules and test cases. They do not give full code bodies, because the executor writes the code inline. Rationale: the user asked to spend fewer tokens. Cost if wrong: the reviewer has less to compare against, which the final review covers.

## Global Constraints

Part 1's Global Constraints apply unchanged:
- worktree and test database env
- money as decimal strings, dates `dd/mm/yyyy`
- plain `-` in strings
- RLS registration for new user tables
- audit metadata never holds data
- no jest-dom
- theme tokens
- 375 px wide with no sideways scroll
- commit trailer

Also:
- **Commits are gated on green tests.** Chain test and commit with `&&` or `set -e`, never `;`.
- **Never emit these fields:**
  - full identifiers (account, card, policy or chassis numbers, registration plates beyond last 4)
  - Legacy `letter`
  - nominee emails
  - tenant phone or email
  - utility connection numbers (electricity, water, gas, khata, survey, RERA)
  - document `externalEditKey`
  - bank `customerId`

  Use `*Last4` fields, or `last4()`.
- **Free text** a user typed (notes, labels, descriptions, narration) goes in `userText`, which the mask layer redacts.
- **Member access is re-checked on every call.** Nothing is cached. Removing someone from the family, revoking a managed profile or switching opt-in off takes effect on the next call.

## Review Focus

1. **A family member's opt-in switched off mid-connection.** Their data must stop on the next call, even though `grant.memberUserIds` still lists them. Test: Task 1 "opt-out takes effect next call".
2. **A CONTRIBUTOR/VIEWER-shared member with visibility caps.** Areas outside the member's `visibleCategories` or `visibleAssetClasses` must return a plain refusal for that member, not empty data that looks real. Test: Task 1 "caps refuse an area".
3. **`member: "all"`.** Each person's block is labelled. One person failing does not hide the others: their entry carries an `error`. Test: Task 1.
4. **Will and documents.** No will clause text beyond the plain-language summary, no nominee contact details, and no file contents. Tests: Task 2 "will summary has no emails", "documents have no keys".
5. **Edit sharing that narrows areas.** The next `tools/list` from the chatbot must drop the removed tools. Test: Task 3 "narrowed areas drop tools".

---

### Task 1: Family people, opt-in, and the `member` argument

**Files:**
- Modify: `packages/api/prisma/schema.prisma` (`User.aiConnectorFamilyOptIn Boolean @default(false)`)
- Create: migration `20261015120000_ai_connector_family_optin/migration.sql` (`ALTER TABLE "User" ADD COLUMN "aiConnectorFamilyOptIn" BOOLEAN NOT NULL DEFAULT false;`)
- Create: `packages/api/src/services/mcp/people.ts`
- Modify:
  - `packages/shared/src/aiConnector.ts`: `AiConnectorMemberWire`, `AiConnectorAuthRequestWire.members`, `AiConnectionWire.memberUserIds`, and `AREA_CATEGORY` (below)
  - `oauth.service.ts` (`getAuthRequest`, `decide`, `listConnections`)
  - `connect.routes.ts`: `GET/PUT /api/connect/family-opt-in`, plus the decision body `memberIds`
  - `server.ts`: a `member` argument injected into every tool's input schema, then fan-out
  - `overview.tools.ts`: `list_people` becomes real
- Test: `packages/api/test/mcp/people.test.ts`; extend `mcpEndpoint.test.ts`

**Interfaces:**
- `AREA_CATEGORY: Record<AiConnectorArea, readonly string[] | 'ASSET_CLASSES' | null>` maps each area to the categories that gate it:

  | Area | Gate |
  |---|---|
  | investments, retirement | `'ASSET_CLASSES'` |
  | banking | `['BANK_ACCOUNT', 'CREDIT_CARD']` |
  | loans | `['LOAN']` |
  | insurance | `['INSURANCE']` |
  | property | `['OWNED_PROPERTY', 'RENTAL']` |
  | vehicles | `['VEHICLE']` |
  | goals_tax | `['GOAL']` |
  | split, will, documents | `null` |

  `null` means no family token exists for that area, so it is self and managed profiles only.
- `interface Person { userId: string; label: string; relation: string; kind: 'self' | 'managed' | 'member'; caps: { assetClasses: AssetClass[] | null; categories: string[] | null } }`
- `listShareablePeople(userId): Promise<Array<{ userId; name; relation; kind: 'managed' | 'member'; shareable: boolean; reason?: string }>>` is for the approval page.
  - It covers managed profiles (`listProfilesIManage`) and members of the caller's families (`listMyFamilies` + `listMembers`), deduplicated by userId, excluding self and PENDING members.
  - A `member` with `aiConnectorFamilyOptIn = false` gets `shareable: false, reason: 'Has not allowed family AI connectors'`.
- `resolvePeople(userId, memberUserIds): Promise<Person[]>` re-checks every member on every call.
  - Self is always first.
  - **Managed:** `resolveActAs` must still succeed, which means the caller still manages them. Caps are null.
  - **Member:** they must still be in a family with the caller (`getEffectiveScope(userId, { familyId })` includes them in `readableUserIds`) and have `aiConnectorFamilyOptIn = true`. Caps come from that scope's `allowedAssetClasses` and `allowedCategories`. For an OWNER both are null.
  - A member who no longer qualifies is silently dropped.
- `areaAllowedFor(person, area): boolean`
  - self and managed: always true
  - member: area `null` gives false; `'ASSET_CLASSES'` gives `caps.assetClasses === null || caps.assetClasses.length > 0`; otherwise caps.categories is null or includes one of the area's categories
- Tool argument `member?: string`
  - `'me'` (the default), a person's `userId` from `list_people`, or `'all'`.
  - **Single person:** run `tool.run({ ...ctx, userId: person.userId }, args)` inside `runAsUser(person.userId)`. Add `owner: person.label` to the data.
  - **`all`:** return `{ asOf, people: [{ owner, relation, data } | { owner, relation, error }] }`.
  - An unknown or no-longer-eligible member gives ToolUserError: "That person is not shared with this chatbot. Call list_people."
  - A member whose caps exclude the area gives ToolUserError: "<label> has not shared <area label> with you in EveryPaisa."
  - Investments tools for a capped member additionally filter rows by `caps.assetClasses` (holdings, transactions).
- Audit `memberCount` = the number of people run.
- `list_people` returns self plus every person `resolvePeople` keeps, as `{ id: 'me' | userId, name: 'You' | label, relation, kind }`.
- Approval page: the members section uses `AiConnectorAuthRequestWire.members`. Managed profiles start off. Non-shareable members are greyed out with the reason.
- Decision body `memberIds: string[]`. Each must be in `listShareablePeople` with `shareable: true`, otherwise 400.
- Settings page: a switch "Allow family to include me in their AI connectors", shown to users who belong to a family. Uses `GET/PUT /api/connect/family-opt-in` with `{ optIn: boolean }`, ungated by plan, and audited as `mcp_sharing_changed` with metadata `{ familyOptIn }`.

**Tests (people.test.ts, DB):**
- [ ] Managed profile shareable and readable. `list_holdings` with `member` set to the profile id returns their rows with `owner` set to their name.
- [ ] Own-login member without opt-in: `shareable: false`. The decision with their id gives 400. `member` with their id gives "not shared".
- [ ] Opt-out takes effect next call: opt in, approve, read OK. Opt out, and the same token's next call says "not shared".
- [ ] Caps refuse an area: member with `visibleCategories = []` and area `loans` gives "has not shared Loans". Investments with `visibleAssetClasses = ['MUTUAL_FUND']` returns only MF rows.
- [ ] `member: 'all'` returns a labelled block per person. A failing person yields `error` and the others still return.
- [ ] Removing a managed profile from management drops them on the next call.

---

### Task 2: Tools for the remaining areas

**Files:**
- Create in `packages/api/src/services/mcp/tools/`:
  - `banking.tools.ts`
  - `loans.tools.ts`
  - `insurance.tools.ts`
  - `property.tools.ts`
  - `vehicles.tools.ts`
  - `goalsTax.tools.ts`
  - `split.tools.ts`
  - `will.tools.ts`
  - `documents.tools.ts`
- Register them in `tools/index.ts`.
- Test: `packages/api/test/mcp/tools.part2.test.ts`

**Tool to service map:** every tool is userId-scoped and emits only the fields listed.

- **`list_bank_accounts`** (banking)
  - Source: `listAccounts(userId)`, plus `getAccount` when `history: true` is passed (snapshots capped at 200).
  - Emit: bankName, accountType, `account: XXXX+last4`, nickname→userText, status, currentBalance (`.toString()`), balanceAsOf, jointHolders count, nomineeName, history [{date, balance}].
  - Never: ifsc, customerId, debitCard*.
- **`list_credit_cards`** (banking)
  - Source: `listCards` + `getCardSummary` per card.
  - Emit: issuerBank, cardName, `card: XXXX+last4`, network, creditLimit, outstanding, utilizationPct, nextDueDate, nextDueAmount, latest statement {forMonth, amount, minimumDue, dueDate, status}.
- **`list_income`** (banking)
  - Source: `listIncomes`.
  - Emit: type, sourceName, monthlyAmount, payDay, isActive, notes→userText.
- **`list_loans`** (loans)
  - Source: `listLoans` + `getLoanSummary` per loan.
  - Emit: lenderName, loanType, `account` (the already-masked accountNumber; re-mask through `last4` of its digits), principalAmount, interestRate, emiAmount, emiDueDay, status, outstandingBalance, nextEmiDate, nextEmiAmount, remainingEmiCount, totalInterestPaid, the last 5 payments {date, amount, principalPart, interestPart}, vehicle `XXXX+registrationNoLast4`.
- **`list_loans_given`** (loans)
  - Source: `listLoansGiven`.
  - Emit: borrowerName, relationship, principalAmount, lentOn, interestRate, dueDate, status, summary {outstandingPrincipal, totalReceived, interestDue, nextDue, overdueDays}, notes→userText.
  - Never: borrowerContact.
- **`list_insurance`** (insurance)
  - Source: `listPolicies`.
  - Emit: insurer, type, planName, `policy: XXXX+policyNumberLast4`, sumAssured, premiumAmount, premiumFrequency, nextPremiumDue, status, nominees [{relation, sharePercent}] (names allowed, no other contact), claims [{kind, status, claimDate, claimedAmount, settledAmount}].
- **`list_properties`** (property)
  - Sources: realEstate `listProperties` and rental `listProperties`, plus `listExpenses`.
  - Emit, owned: name, city, propertyType, status, ownershipType, ownershipPercent, purchaseDate, purchasePrice, currentValue, annualPropertyTax.
  - Emit, rental: name, currentValue, tenancies [{tenantName, monthlyRent, securityDeposit, balanceDue, isActive, startDate}], receipts in the last 12 months [{forMonth, expectedAmount, receivedAmount, status}], expenses total for this FY.
  - Rental properties already linked from an owned property (`rentalPropertyId`) are reported once.
  - Never: address lines, utility numbers, tenant contact.
- **`list_vehicles`** (vehicles)
  - Source: `listVehicles`.
  - Emit: make, model, `registration: XXXX+registrationNoLast4`, purchaseDate, purchasePrice, currentValue, insuranceExpiry, pucExpiry, fitnessExpiry, roadTaxExpiry, challans [{offenceDate, offenceType, amount, status}].
  - Never: engineNo, the full plate, challanNo.
- **`list_goals`** (goals_tax)
  - Source: `listGoals`.
  - Emit: name, category, priority, status, targetAmount, targetDate, currentValue, remaining, progressPct, requiredCagr, notes→userText.
- **`get_tax_summary`** (goals_tax)
  - Argument: `fy?`, defaulting to the latest of `availableTaxFys`.
  - Source: `buildTaxSummary(userId, fy)`, restricted to own non-client portfolio ids when `hasClientBooks`.
  - Emit: financialYear, capitalGains {each section's gain, taxable and tax}, carryForward, otherIncome, totalRealisedGain, totalEstimatedTax, availableFys.
- **`list_split_balances`** (split)
  - Sources: `listFriends(userId)` for per person, and `listGroups` + `groupBalances` for per group.
  - Emit: friends [{name, currency, net, theyOweYou: net > 0}], and groups [{name, currency, transfers [{from, to, amount}] with member names}].
- **`get_will_summary`** (will)
  - Source: `getWillOverview`.
  - Emit: status, latest version number, generatedOn, executedOn, nextReviewAt, review due flag, and `summary`.
  - The `summary` is the plain-language summary rendered from the live version's sealed snapshot with `renderWillSummary`, using the existing will-store helpers. If no live version exists it is null. It is passed as text blocks joined with newlines, in `userText`.
- **`list_nominees`** (will)
  - Source: `getOverview(userId, true)` from legacy `plan.service`.
  - Emit: name, relationship, priority, isVerifier, categories, acknowledged (boolean).
  - Never: email, letter, documentIds.
- **`list_documents`** (documents)
  - Source: `listAllDocuments(userId, {}, { excludeWill: false })`.
  - Emit: fileName→userText, category, ownerType (as a label), mimeType, sizeKb, createdAt (dd/mm/yyyy).
  - Never: id, ownerId, externalEditKey.

**Tests (tools.part2.test.ts, DB):**
- [ ] Registers the 13 tools under their areas.
- [ ] One fixture per area, created via the services with a full identifier in each: account number, card number, policy number, registration plate, narration-style notes.
- [ ] Each tool returns the row, and `JSON.stringify(output)` contains no full identifier, no email and no tenant phone (the masking property).
- [ ] Will summary has no emails.
- [ ] Documents have no keys or ids.
- [ ] Rental-plus-owned property linked by `rentalPropertyId` appears once.
- [ ] User B sees none of user A's rows, for every tool.

---

### Task 3: Edit sharing and Recent activity

**Files:**
- Modify:
  - `oauth.service.ts`: `updateConnection(userId, grantId, { areas, memberUserIds })` and `connectionActivity(userId, grantId)`
  - `connect.routes.ts`: `PATCH /connections/:id`, `GET /connections/:id/activity`. PATCH needs `AI_CONNECTOR`, since widening is like approving. GET is ungated.
  - shared wire: `AiConnectionActivityWire = { tool: string; area: string; people: number; rows: number; ok: boolean; at: string }[]`
  - web `connect.api.ts`
  - `AiConnectorsPage.tsx`: an Edit sharing dialog (area and member toggles, reusing a `SharingToggles` component extracted from the approval page) and a Recent activity disclosure
- Test: extend `oauth.service.test.ts`, `mcpEndpoint.test.ts` ("narrowed areas drop tools") and both web page tests.

**Rules:**
- **Updates:** validate areas and members exactly as `decide` does. Audit `mcp_sharing_changed`. Taking effect needs nothing else, because `resolveAccessToken` reads the grant on every call.
- **Activity:** the last 20 `mcp_tool_called` audit rows for that grant (`resource = McpGrant:<id>`, owner's userId), mapped to the wire.

---

### Task 4: Entry points

**Files:**
- Modify:
  - `apps/web/src/components/layout/navItems.tsx`: append `{ label: 'AI connectors', to: '/settings/ai-connectors', icon: Bot }` to `PLANNING_ITEMS`, and update `navItems.test.ts` / `PlanningNavGroup.test.tsx` expectations.
  - `components/layout/Header.tsx`: a user-menu item "AI connectors" after "Profile & Settings".
  - `components/ai/AIAssistant.tsx`: in the composer footer row, after the disclaimer, a `Link` "Prefer your own ChatGPT or Claude? Connect it" to `/settings/ai-connectors`. Hidden while `previewLocked`.
- Test: the existing nav tests, plus one assertion in an AIAssistant test if one exists. Otherwise there is no new test file, and Task 5's 375 px check covers it.

---

### Task 5: Verification and final review

- [ ] API: `test/mcp` + invariants + accountDeletion, in one run. Shared and web full suites. tsc and eslint. The dash check.
- [ ] Migration applied to `portfolioos_split` only.
- [ ] Local e2e (scripted SDK client, as in Part 1):
  1. approve with one managed profile
  2. `list_people`
  3. one tool per area
  4. `member: 'all'`
  5. narrow the areas via PATCH, then confirm `tools/list` shrinks
  6. revoke
- [ ] The settings page and the approval page with members, at 375 px in light and dark: no sideways scroll, screenshots saved.
- [ ] Final whole-branch review: one fresh reviewer on the most capable model, then ONE fix pass with RED→GREEN tests.
