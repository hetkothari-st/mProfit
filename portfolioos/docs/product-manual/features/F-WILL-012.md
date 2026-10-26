---
id: F-WILL-012
title: "Sign and store (step 9)"
module: "Will Maker"
status: Live
roles: "R-PLUS+ (store); any plan (download)"
settings: []
related: [F-WILL-001, F-WILL-003, F-WILL-011, F-WILL-013]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Sign and store (step 9)

`F-WILL-012` · Live · Roles: [R-PLUS](../roles.md#r-plus)+ (store); any plan (download)

**What it does:** Explains how to sign the will correctly, links to free legal help, and records the signing date and two witnesses with a scan or photo of the signed will. Once stored, the will shows as **Executed** and the next review is set two years ahead.

**Why it exists:** Page description: "Step 9: sign your will the right way, then keep a copy of the signed will here."

**Where to find it:** **Will Maker → Sign and store** (route `/will/:id/execute`).

**Who can use it:** Same as [F-WILL-001](F-WILL-001.md) for storing; downloading a stored signed copy works on any plan.

**Steps**
1. Follow the guide: Print the will; Read it once more; Choose two witnesses; Sign in front of both witnesses; Register it with the Sub-Registrar (optional); Store it safely.
2. Enter **Date you signed**, **Witness 1 - full name**, **Witness 2 - full name** and choose the **Signed copy (PDF or photo, up to 20 MB)**.
3. Click **Store signed copy**. The toast "Your signed will is stored" appears; the card shows "Signed on <date>", the witnesses and "Next review <date>".
4. Later use **Download signed copy** or **Replace the copy or fix details** (leave the file empty to keep the stored copy).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** | Button | Downloads the generated will | — |
| **Store signed copy** | Button | Saves the record | Disabled while saving |
| **Download signed copy** | Button | Downloads the stored copy | Only when stored |
| **Replace the copy or fix details** | Button | Reopens the form | Only for the current will |
| **Cancel** | Button | Closes the edit form | Only when editing |
| Tele-Law / NALSA links | Links | Free legal help (NALSA helpline 15100) | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Date you signed** | Date | Yes | Not in the future; not before the generation date | Empty | "Enter the date you signed." / "The signing date cannot be in the future." / "The signing date cannot be before the will was generated (<date>)." |
| **Witness 1/2 - full name** | Text | Yes | ≥ 2 characters each, ≤ 120, two different people, not you | Empty | "Enter the full name of both witnesses." / "Your two witnesses must be two different people." / "You cannot be a witness to your own will. Choose someone else." |
| **Signed copy** | File | First time only | PDF, JPEG, PNG or WebP (checked by content), ≤ 20 MB | — | "Attach the signed copy." / "Upload the signed will as a PDF or a photo (JPEG, PNG or WebP)." / "The file is larger than 20 MB." |

**Settings and toggles here:** None.

**Results:** Status **Executed**; witness names stored encrypted ("Witness names are stored encrypted and shown only to you."); the signed copy stored as "will-v<N>-signed.<ext>"; next review = signing date + 2 years (correcting witnesses with the same date keeps the review date).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This will can't be signed and stored here: it is still a draft or was discarded." | Not generated | Generate first |
| "This will can't be signed and stored any more" | It was replaced meanwhile | Open the current version |
| "This will changed while you were saving. Reload and try again." | Concurrent change | Reload |
| Amber warning "One of your witnesses has the same name as a beneficiary…" | Witness name matches a beneficiary | Speak to a lawyer; consider re-signing |

**Limitations:** A superseded version's record is read-only ("This version was replaced by a newer version. Its record is kept here as history."). Uploads are limited to 10 per minute.

**How it works:** `GET /api/will/wills/:id/execution`; `POST /api/will/wills/:id/execution` (multipart, one file, multer limit 20 MB, type sniffed from bytes); `GET /api/will/wills/:id/signed-copy` (no plan gate).

**Related features:** [F-WILL-003](F-WILL-003.md), [F-WILL-011](F-WILL-011.md), [F-WILL-013](F-WILL-013.md).

**Sources:** `apps/web/src/pages/will/execute/WillExecutePage.tsx:19`, `apps/web/src/pages/will/execute/WillExecutePage.tsx:84`, `apps/web/src/pages/will/execute/SignedCopyForm.tsx:33`, `apps/web/src/pages/will/execute/executeCopy.ts:5`, `apps/web/src/pages/will/execute/executeCopy.ts:52`, `packages/shared/src/will/execution.ts:13`, `packages/api/src/services/will/willExecute.service.ts:43`, `packages/api/src/services/will/willExecute.service.ts:113`, `packages/api/src/middleware/willUpload.ts:16`
