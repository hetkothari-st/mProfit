---
id: F-DOCS-006
title: "Unlock a password-protected document"
module: "Documents"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-DOCS-002, F-IMPORT-004]
---

[← Documents](../modules/documents.md) · [Index](../INDEX.md)

# Unlock a password-protected document

`F-DOCS-006` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** For a PDF stuck at **Needs a password**, sends the password you type so the file is read again.

**Why it exists:** Inferred from behavior: many statements are encrypted with PAN or date of birth.

**Where to find it:** **Tools → Documents** → **Needs attention** (or a folder) → **Enter password** on the file.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click **Enter password**. The dialog "Unlock <file>" shows "Try the PDF's password — often your PAN or date of birth."
2. Type the password and click **Unlock**.
3. The file returns to **Reading…** and then to its result.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Enter password** | Button | Opens the dialog | Shown only for **Needs a password** files |
| **Password** | Password input | The PDF password | — |
| **Cancel** / **Unlock** | Buttons | Close / submit | **Unlock** disabled when empty or submitting |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Password | Text (hidden) | Yes | 1–200 characters | Empty | "This document is not waiting for a password"; "Couldn't use that password" |

**Settings and toggles here:** None (no "remember" option here).

**Results:** The file is queued for reading with the password. The password travels only with the queue job and is never stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| File goes back to **Needs a password** | Wrong password | Try again |

**Limitations:** A wrong password is reported only by the file returning to **Needs a password**.

**How it works:** `POST /api/documents-sorter/files/:id/password` (202 Accepted) sets the file to PROCESSING and queues it with the password.

**Related features:** [F-DOCS-002](F-DOCS-002.md), [F-IMPORT-004](F-IMPORT-004.md).

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:64`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:85`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:114`, `packages/api/src/controllers/documentSorter.controller.ts:44`, `packages/api/src/services/documents/docSorter/sorter.service.ts:333`
