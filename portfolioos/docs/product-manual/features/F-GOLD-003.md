---
id: F-GOLD-003
title: "Add, edit and delete a gold or silver entry"
module: "Gold & Silver"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (owner)"
settings: []
related: [F-GOLD-001, F-GOLD-004]
---

[← Gold & Silver](../modules/gold-silver.md) · [Index](../INDEX.md)

# Add, edit and delete a gold or silver entry

`F-GOLD-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (owner)

**What it does:** The "Add Gold / Silver" / "Edit Gold / Silver Entry" dialog records a buy or sale (and for SGBs, interest and maturity), pre-fills today's price, and lets you attach up to 5 photos.

**Why it exists:** Metal holdings are tracked through entries; photos document jewellery and coins. Inferred from behavior and UI text "Click to add photos of your jewellery, coins, etc."

**Where to find it:** **Gold & Silver** → **Add**, a transaction pencil, or the detail page's edit (routes `/gold`, `/gold/:holdingId`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); portfolio owner only.

**Steps**
1. Click **Add**. Pick **Portfolio** and **Type**: **Physical Gold** ("tracked in grams"), **Sovereign Gold Bond (SGB)** ("units"), **Gold ETF** ("units"), **Physical Silver** ("grams").
2. Pick **Transaction** (Buy/Sell; SGB also **Interest received (2.5%)** and **Maturity / Redemption**) and **Date**.
3. Physical metal: pick the **Carat** (24K/22K/18K/14K) or **Purity** (999/925/800 purity).
4. Type **Name / Description**; for SGB/ETF optionally **ISIN**.
5. Enter **Weight (grams)** or **Units** and the price. When adding, the price fills from the live rate (marked "live"); typing your own clears the mark.
6. SGB buy: optional **Interest Rate (% p.a.)** ("RBI pays 2.5% p.a. semi-annually") and **Maturity Date** ("8 years from issue date").
7. Optionally **Add photo**. Click **Add entry** ("Entry added") or **Save changes** ("Entry updated").
8. Edit mode: **Delete** → **Yes, delete** ("Entry deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Type** cards | Radio | Asset type; switching resets transaction, purity and (when adding) price | — |
| Carat / Purity buttons | Toggle | Purity | Physical gold/silver only |
| "live" / "Fetching…" | Indicator | Price came from the live feed | Adding only |
| **Add photo** / camera tile | Button | Picks images | 5 photos reached |
| Photo × | Button | Removes a pending photo, or deletes a saved one | — |
| **Add entry** / **Save changes** ("Saving…") | Button | Saves, then uploads pending photos | While saving |
| **Cancel** / **Delete** → **Yes, delete** | Buttons | Close / delete | Delete in edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Name / Description | Text | Yes | the carat/purity is added as a prefix for physical metal ("22K Gold bracelet") | — | "Enter a name or description" |
| ISIN | Text | No | SGB/ETF only; max 20 (server) | — | "Validation failed" |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Weight (grams) / Units (SGB interest: Units held) | Number | Yes | > 0, step 0.001 | — | "Must be > 0" |
| Price per gram (₹) / Issue / Market Price (₹/unit) / NAV / Price (₹/unit) / Interest per unit (₹) | Number | Yes | ≥ 0 | live price when adding | — |
| Interest Rate (% p.a.) | Number | No | 0–100, SGB buy only | — | — |
| Maturity Date | Date | No | SGB buy only | — | — |
| Notes | Text area | No | max 500 (server); placeholder "Storage location, purchase source, etc." | — | — |
| Photos | Files | No | JPEG, PNG, WebP, HEIC/HEIF; max 5 per entry in the form | — | "Max 5 photos per entry" |

**Settings and toggles here:** None.

**Results:** The entry is saved, the holding rebuilt, then photos uploaded.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / duplicate message | Server refused | — |
| "Failed to delete photo" | Server refused | Retry |
| A photo silently missing after save | Upload failed; failures are ignored | Add it again from the detail page (DOCUMENTATION_GAPS.md) |

**Limitations:** Changing the carat on an existing entry renames it ("24K …" → "22K …"), which can split it into a separate holding. SGB interest entries do not change value. Files of other types are silently skipped.

**How it works:** `POST/PATCH /api/transactions` then `POST /api/transactions/:id/photos` per photo. The server checks the file's real type from its first bytes ("That file is not a JPEG, PNG, WebP or HEIC image."), stores it encrypted in the database, and limits size to `MAX_UPLOAD_SIZE_MB` (default 50 MB).

**Related features:** [F-GOLD-001](F-GOLD-001.md), [F-GOLD-004](F-GOLD-004.md).

**Sources:** `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:29`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:46`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:210`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:255`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:283`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:330`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:487`, `packages/api/src/controllers/transactionPhotos.controller.ts:78`, `packages/api/src/config/env.ts:58`
