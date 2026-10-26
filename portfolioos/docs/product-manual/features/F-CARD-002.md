---
id: F-CARD-002
title: "Add or edit a credit card"
module: "Credit Cards"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-CARD-001, S-CARD-002, S-CARD-003, S-CARD-004]
related: [F-CARD-001, F-CARD-004]
---

[← Credit Cards](../modules/credit-cards.md) · [Index](../INDEX.md)

# Add or edit a credit card

`F-CARD-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Add credit card** / **Edit credit card** dialog ("The card's limit and billing days. The full number is optional and stored encrypted.") records issuer, card product, optional full card number, last 4 digits, network, credit limit, statement day, due day, interest rate, annual fee and status, with a live preview of the card face.

**Why it exists:** Inferred from behavior: limits and billing days drive utilisation and due-date estimates; the optional full number lets you look it up later.

**Where to find it:** **Asset Classes → Credit Cards → Add card**, **Add first card**, or the pencil on a card (route `/credit-cards`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Add card**. Defaults: statement day 1, due day 20, status **Active**.
2. Type in **Issuer bank \*** ("Search HDFC, SBI, Amex…") and pick a suggestion or keep your text.
3. Type in **Card \*** ("Regalia Gold, Platinum…"); picking a catalogue card fills its exact name and, if blank, its issuer and usual network. Generic tiers (Classic, Gold, Platinum, Titanium, Signature, World, Infinite, Black, Metal) are offered as "Any bank".
4. Optionally type the **Full card number** ("Optional — lets you reveal it later"); the last 4 digits fill automatically.
5. Fill **Last 4 digits \*** (if no full number), choose **Network**, fill **Credit limit (₹) \***, **Statement day**, **Due day**, and optionally **Interest rate (% p.a.)**, **Annual fee (₹)**, **Status**.
6. Click **Save**. The toast "Card added" / "Card updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Card preview | Display | Shows the card face as you type | Shown once issuer or card is filled |
| **Cancel** / **Save** | Buttons | Close / save ("Saving…") | **Save** disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Issuer bank \*** | Suggest input | Yes | 1–200 characters | Empty | "Required" |
| **Card \*** | Suggest input | Yes | 1–200 characters | Empty | "Required" |
| **Full card number** | Text | No | 12–19 digits after removing spaces and dashes; must pass the Luhn check | Empty (edit: "Saved — type a new one to replace it" when one is saved) | "Enter the 12–19 digits on the card" / "That card number doesn't check out — check for a mistyped digit"; server: "Card number must be 12–19 digits" / "That card number doesn't check out — a digit may be mistyped" |
| **Last 4 digits \*** | Text | Yes | Exactly 4 digits | Empty | "Must be 4 digits" |
| **Network** | Select: — select —, Visa, Mastercard, RuPay, American Express, Diners Club | No | — | — select — | — |
| **Credit limit (₹) \*** | Text | Yes | Number; ₹ and commas are stripped | Empty | "Required" / "Enter an amount, e.g. 500000" |
| **Statement day** | Number | Yes | 1–31 | 1 | Server rejects outside 1–31 |
| **Due day** | Number | Yes | 1–31 | 20 | Server rejects outside 1–31 |
| **Interest rate (% p.a.)** | Text | No | Number | Empty | — |
| **Annual fee (₹)** | Text | No | Number | Empty | — |
| **Status** | Select | No | Active / Blocked / Closed | Active | — |

**Settings and toggles here:** [S-CARD-001](../settings/credit-cards.md#s-card-001) **Status**; [S-CARD-002](../settings/credit-cards.md#s-card-002) **Network** (logo on the card face; also picks the masking pattern); [S-CARD-003](../settings/credit-cards.md#s-card-003) **Statement day** (stored and shown; not used in calculations); [S-CARD-004](../settings/credit-cards.md#s-card-004) **Due day** (estimated payment due date when no unpaid statement exists).

**Results:** The card is saved. A typed full number is encrypted and its last 4 digits replace **Last 4 digits**. CVV and expiry are never asked for.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Card-number messages in the table | Wrong length or a mistyped digit | Re-type the number |
| Toast with the server's message (for example "Validation failed") | Server-side validation | Correct the field |
| "Failed to add card" / "Failed to update card" | Other error | Retry |

**Limitations:** A saved full number cannot be removed from this dialog (leaving the field empty keeps it); it can only be replaced. The dialog has no field for the outstanding balance (see [F-CARD-001](F-CARD-001.md)). Card status **Inactive** exists on the server but is not offered here.

**How it works:** `POST /api/credit-cards` / `PATCH /api/credit-cards/:id`. The server validates (last 4 exactly 4 digits, amounts as positive decimals, days 1–31, network and status from fixed lists), checks length and Luhn on the full number, encrypts it with AES-256-GCM and stores its last 4. Responses never include the encrypted value, only `hasCardNumber`.

**Related features:** [F-CARD-001](F-CARD-001.md), [F-CARD-004](F-CARD-004.md).

**Sources:** `apps/web/src/pages/creditCards/CreditCardListPage.tsx:237`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:245`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:266`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:332`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:364`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:378`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:413`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:463`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:546`, `packages/api/src/controllers/creditCards.controller.ts:25`, `packages/api/src/services/banking/creditCards.service.ts:110`, `packages/api/src/services/banking/creditCards.service.ts:160`, `packages/api/src/services/banking/creditCards.service.ts:186`
