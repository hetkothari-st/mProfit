
## CAS

The **CAS** page (sidebar **Tools → CAS**, route `/cas`, title "Consolidated Account Statement") is a helper for requesting a Consolidated Account Statement from CAMS, KFintech, NSDL or CDSL yourself. It does not contact the providers: it prepares the details to enter, links to the provider's request page, and tells you what happens next. To have the app submit a CAS request for you, use the mutual fund sync dialogs on **Asset Classes → Mutual Funds** (D-IMPORT-002).

### Request CAS helper <!-- F-CAS-001 -->
**What it does:** You choose a provider and optionally type a PAN, email and date range; **Generate Request** returns a link **Open provider portal**, a list of **Instructions** (the values to type there) and **Next steps**.

**Why it exists:** A code comment explains: CAMS and KFintech have no public API to request a CAS; both use a web form and email a password-protected PDF, so the app provides structured guidance and deep links.

**Where to find it:** **Tools → CAS** (route `/cas`), card **Request CAS**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER (nothing is saved).

**Steps**
1. Choose a **Provider**: CAMS, KFintech, NSDL (e-CAS) or CDSL (e-CAS); each option shows its coverage.
2. Optional: type **PAN (optional)** (converted to capitals), **Email (optional)**, **From date** and **To date**.
3. Click **Generate Request**. A box appears below with **Open provider portal**, **Instructions** and **Next steps**.
4. Click **Open provider portal** (opens in a new tab) and submit the provider's form with the listed values.
5. When the PDF arrives by email, it is imported automatically if Gmail is connected (F-MAIL-006); otherwise upload it on **Tools → Import**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Provider** | Select | Provider to request from | — |
| **PAN (optional)** | Text | PAN to list in the instructions | Max 10 characters |
| **Email (optional)** | Email | Email to list in the instructions | — |
| **From date** / **To date** | Date | Period to list | — |
| **Generate Request** | Button | Builds the instructions | Disabled while building |
| **Open provider portal** | Link | Opens the provider's page in a new tab | Shown after generating |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Provider | Select | Yes | CAMS, KFINTECH, NSDL, CDSL | CAMS | — |
| PAN | Text | No | Exactly 10 characters when given | Empty | "Validation failed" |
| Email | Email | No | Valid email when given | Empty | "Validation failed" |
| From date / To date | Date | No | YYYY-MM-DD; period is listed only when both are given | Empty | — |

**Settings and toggles here:** None.

**Results:** Nothing is saved or sent. **Instructions** list "PAN: …" and "Email: …" when given, "Statement type: DETAILED", "Period: <from> to <to>" (or "Period: All transactions" unless both dates are set) and "PDF password will be your PAN in uppercase (most providers)".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Validation failed" | PAN not 10 characters, or invalid email | Correct the field or clear it |

**Limitations:** **Next steps** say "If an IMAP mailbox is configured, EveryPaisa will auto-import the PDF" and "Otherwise, upload the PDF via Imports → CAS PDF and provide the PDF password"; IMAP setup is no longer available in the app (Gmail is the supported route) and the Import page has a single upload box, not a "CAS PDF" option. The statement type is always "Detailed". The dates are not checked against each other.

**How it works:** `GET /api/cas/providers` returns a fixed list; `POST /api/cas/request` validates the input and returns the portal URL for the provider plus the text lines. No request is made to the provider.

**Related features:** F-CAS-002, F-IMPORT-001, F-MAIL-006, D-IMPORT-002.

**Sources:** `apps/web/src/pages/cas/CasPage.tsx:26`, `apps/web/src/pages/cas/CasPage.tsx:42`, `apps/web/src/pages/cas/CasPage.tsx:97`, `apps/web/src/pages/cas/CasPage.tsx:108`, `packages/api/src/controllers/cas.controller.ts:73`, `packages/api/src/controllers/cas.controller.ts:106`, `packages/api/src/controllers/cas.controller.ts:115`

### Provider info <!-- F-CAS-002 -->
**What it does:** Shows facts about the selected provider: name, coverage, **PDF password**, **Email from**, **Subject** and notes.

**Why it exists:** Inferred from behavior: tells you which email to look for and which password opens the PDF.

**Where to find it:** **Tools → CAS**, card **Provider info**.

**Who can use it:** Same as F-CAS-001.

**Steps**
1. Choose a provider in **Provider**; the card updates.

**Controls:** None — display only.

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes.

| Provider | Coverage (as shown) | PDF password | Email from | Subject |
|---|---|---|---|---|
| CAMS | Mutual funds serviced by CAMS (~60% of MF industry) | PAN in uppercase | @camsonline.com | Consolidated Account Statement |
| KFintech | Mutual funds serviced by KFintech (~40% of MF industry) | PAN in uppercase | @kfintech.com | Consolidated Account Statement |
| NSDL (e-CAS) | Demat holdings + MF consolidated across NSDL | PAN + DOB (DDMMYYYY) | @nsdl.co.in | e-CAS |
| CDSL (e-CAS) | Demat holdings + MF consolidated across CDSL | PAN | @cdslindia.com | e-CAS |

**Errors and troubleshooting:** None.

**Limitations:** The information is fixed in the app and is not checked against the providers.

**How it works:** Read from `GET /api/cas/providers`.

**Related features:** F-CAS-001, F-IMPORT-004 (the app tries PAN and PAN + date of birth automatically).

**Sources:** `apps/web/src/pages/cas/CasPage.tsx:133`, `packages/api/src/controllers/cas.controller.ts:24`

### What this area doesn't do
- The CAS page does not submit the request to the provider or fetch the PDF itself.
- It does not remember the PAN or email you type.

## Documents

**Documents** (sidebar **Tools → Documents**, route `/documents`) is a document sorter: you drop PDFs and photos, and the app reads each one on the server, works out whose document it is and what kind (ITR, Form 16, bank statement and so on), files it into a folder for that person and renames it. It is a Plus feature.

### Upload documents to sort <!-- F-DOCS-001 -->
**What it does:** Accepts many files at once (by drag-and-drop or **Choose files**), uploads them in groups of 10, and lists the latest 12 with their progress: "Uploading <n>%", "Uploaded — reading…", "Already in your Documents", or the filing result.

**Why it exists:** The page says: "Drop your documents. We work out whose they are and what they are, file them in the right folder, and name them for you."

**Where to find it:** **Tools → Documents** (route `/documents`), drop area at the top.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. R-FREE sees the locked card "Documents is locked" with **View plans**. R-MANAGER uses it with the manager's plan for the managed person's documents.

**Steps**
1. Open **Tools → Documents**.
2. Drag files onto the box ("Drop your documents here — we sort them for you"), or click **Choose files**.
3. Watch the list below: each file moves from uploading to reading to "Filed into <person> / <type>", or to a status that needs you (see F-DOCS-003).
4. Click **Clear list** to empty the progress list (files are not affected).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Drop area | Drop zone | Uploads all dropped files | — |
| **Choose files** | Button | File picker (multiple), limited to .pdf, .png, .jpg, .jpeg, .heic, .webp, .tiff, .bmp | — |
| Progress list | Display | Latest 12 files with status | Hidden when empty |
| **Clear list** | Button | Empties the progress list | Shown with the list |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Files | Files | Yes | Up to 10 per request (the page splits larger drops); each up to 25 MB (or the server upload limit if lower); server accepts .pdf, .doc, .docx, .odt, .txt, .rtf, .xls, .xlsx, .ods, .csv, .ppt, .pptx, .odp, .png, .jpg, .jpeg, .heic, .webp, .gif, .bmp, .tiff | — | "Choose at least one file"; "File is too large"; "Upload failed" |

**Settings and toggles here:** None.

**Results:** Each new file is stored (encrypted) and queued for reading. A file with the same bytes as one you already have is not stored again ("Already in your Documents"); if that earlier copy failed or needs review, it is read again.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "File is too large" | Over 25 MB | Compress or split |
| "Internal server error" | A dropped file had an unsupported extension | Use a supported type |
| "Already in your Documents" | Identical file already uploaded | Nothing to do |
| "This feature requires the PLUS plan or higher" | Free plan (API refuses) | Upgrade (D-DOCS-002) |

**Limitations:** Only PDFs and images are read automatically; other accepted types are stored with "This file type is stored but not read automatically yet." and wait in **Needs attention**. The progress list is lost when you leave the page.

**How it works:** `POST /api/documents-sorter/upload` (multipart field `files`, up to 10) behind the DOCUMENT_SORTER plan gate. For each file: SHA-256 dedup per user; the real type is sniffed; PDFs and images are queued on `doc-sort` (if the queue cannot take it the file shows "Could not start reading this file. Drop it again to retry."). A file still "reading" after 10 minutes is treated as lost and re-queued when dropped again. The page polls the folder tree every 3 seconds while any file is being read.

**Related features:** F-DOCS-002, F-DOCS-003, D-DOCS-002.

**Sources:** `apps/web/src/pages/documentSorter/DocumentSorterPage.tsx:20`, `apps/web/src/pages/documentSorter/DocumentSorterPage.tsx:44`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:10`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:11`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:80`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:107`, `packages/api/src/routes/documentSorter.routes.ts:10`, `packages/api/src/middleware/documentUpload.ts:48`, `packages/api/src/middleware/documentUpload.ts:49`, `packages/api/src/services/documents/docSorter/sorter.service.ts:34`, `packages/shared/src/entitlements.ts:58`

### How documents are read and filed <!-- F-DOCS-002 -->
**What it does:** For each uploaded PDF or image, the server extracts text, decides the document type, the person's name and the document date, finds or creates that person's folder, and renames the file to "<Type>_<YYYY-MM-DD>.<ext>".

**Why it exists:** A code comment cites the design spec: read each file, find its person and type, file it and rename it, recording every outcome so a file is never lost.

**Where to find it:** Automatic after upload; results in the folders (F-DOCS-003).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The file ends in one of these states: **Filed** (in a person's folder, renamed), **Needs a password**, **Needs review** (with a reason), **Could not be read** (failed), or still **Reading…**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Needs review — Could not find a name on this document." | No person name found | Use **Assign** (F-DOCS-005) |
| "Needs review — AI reading is over budget this month." / "AI reading was not available." | Rules were unsure and the AI fallback could not run | Use **Assign** |
| "Needs review — Could not read this file." | Text extraction failed | Use **Assign**, or upload a clearer copy |
| "Needs a password" | Locked PDF and automatic passwords failed | Use **Enter password** (F-DOCS-006) |
| "Could not be read" ("Processing error.") | Unexpected error | Use **Assign**, or drop the file again |

**Limitations:** Scanned PDFs are OCR'd on the server for the first 3 pages only. When two existing folders are similarly named, the app does not guess and leaves the file for review. Folders can be created automatically from names on documents ("auto-created").

**How it works:** Text comes from the PDF text layer, else OCR (tesseract.js on the server; at most 3 pages; images scaled to at most 8 million pixels), within a 4.5-minute budget. Passwords tried: the one you entered, then the profile-based candidates listed in F-IMPORT-004. Local rules find type, name, PAN last 4 and date; if rule confidence is below 0.70 or no name was found, an AI fallback (same gate and monthly budget as email parsing; PAN/Aadhaar/account/phone masked, the name kept) is used when its confidence is at least 0.5. Person matching: exact name key or alias first; otherwise a single similar name whose PAN last 4 does not conflict; ambiguity → review. A new name creates an auto-created folder. Filing takes a per-user lock; the new name is "<Type label>_<document date or upload date>" plus "-2", "-3"… when taken.

**Related features:** F-DOCS-001, F-DOCS-003, F-DOCS-005, F-DOCS-006.

**Sources:** `packages/api/src/services/documents/docSorter/sorter.service.ts:28`, `packages/api/src/services/documents/docSorter/sorter.service.ts:168`, `packages/api/src/services/documents/docSorter/sorter.service.ts:180`, `packages/api/src/services/documents/docSorter/sorter.service.ts:199`, `packages/api/src/services/documents/docSorter/sorter.service.ts:212`, `packages/api/src/services/documents/docSorter/textExtract.ts:16`, `packages/api/src/services/documents/docSorter/rules.ts:20`, `packages/api/src/services/documents/docSorter/personMatch.ts:66`, `packages/api/src/services/documents/docSorter/naming.ts:18`, `packages/api/src/services/documents/docSorter/llmFallback.ts:13`

### Browse person folders <!-- F-DOCS-003 -->
**What it does:** Shows "<n> people · <m> files" and one folder card per person ("<n> files · <k> types", "· auto-created" when made automatically), plus an amber **Needs attention** card for files still reading or waiting for you. Opening a person shows their files grouped by document type.

**Why it exists:** Inferred from behavior: the sorted result of F-DOCS-002, organised the way people look for documents — by person, then type.

**Where to find it:** **Tools → Documents**, below the drop area.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click a person's folder card. The person view lists sections such as "Bank Statement (3)".
2. Click the back arrow ("Back to all folders") to return.
3. Click **Needs attention** to see unfiled files ("<n> file(s) reading or waiting for you").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Person folder card | Button | Opens that person | — |
| **Needs attention** | Button | Opens unfiled files | Shown only when some exist |
| Back arrow | Button | Back to all folders | In a person or Needs attention view |
| Per-file actions | Buttons | See F-DOCS-004, F-DOCS-005, F-DOCS-006 | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing here yet. Drop a few documents above and folders appear on their own." | No documents | Upload some |
| "Couldn't load your documents" | Server error | Reload |
| "Folder not found" | The folder was merged or renamed meanwhile | Go back |
| Amber note "This folder was created automatically from a name on your documents. Rename it, or merge it into another folder if it is the same person." | Auto-created folder | Rename or merge (F-DOCS-007) |

**Limitations:** There is no search or sort. Document types are fixed: ITR, Form 16, Income Certificate, Bank Statement, Salary Slip, CAS, Contract Note, Insurance, FD Certificate, ID Proof, Other.

**How it works:** `GET /api/documents-sorter/tree` returns people with files grouped by type, and an `unassigned` list of files with no person or not yet FILED.

**Related features:** F-DOCS-004, F-DOCS-005, F-DOCS-006, F-DOCS-007, F-DOCS-008.

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:124`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:181`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:213`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:241`, `packages/shared/src/documentSorter.ts:3`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:47`

### View, download or delete a file <!-- F-DOCS-004 -->
**What it does:** For each file: view it in the app (PDFs and images), download it, or delete it after a second confirmation.

**Why it exists:** Inferred from behavior: basic file handling inside the sorted folders.

**Where to find it:** **Tools → Documents** → a person folder or **Needs attention** → icons on a file row.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click the eye icon to open the viewer.
2. Click the download icon to save the file.
3. Click the bin icon, then **Delete** to confirm (or **Keep** to cancel). The toast "Deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Eye (label "View <file>") | Button | Opens the viewer | Shown only for PDFs/images not being read |
| Download (label "Download <file>") | Button | Downloads the file | — |
| Bin (label "Delete <file>") | Button | Asks to confirm | — |
| **Delete** / **Keep** | Buttons | Confirm or cancel deletion | Shown after the bin is clicked |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Delete removes the document. View and download change nothing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't delete the file" / "Couldn't download the file" | Server error | Try again |

**Limitations:** None beyond the viewer supporting only PDFs and images.

**How it works:** Uses the shared documents API: `DELETE /api/documents/:id` and the download endpoint `GET /api/documents/:id/download`; the viewer is the shared document viewer (D-DOCS-001).

**Related features:** F-DOCS-003, D-DOCS-001.

**Sources:** `apps/web/src/pages/documentSorter/FileRow.tsx:21`, `apps/web/src/pages/documentSorter/FileRow.tsx:43`, `apps/web/src/pages/documentSorter/FileRow.tsx:56`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:49`, `apps/web/src/api/documents.api.ts:43`

### Move or assign a file <!-- F-DOCS-005 -->
**What it does:** Moves a file to another person and/or type — or assigns a file that could not be sorted — creating a new person folder if needed, and renames it to match.

**Why it exists:** Inferred from behavior: corrects or completes the automatic sorting.

**Where to find it:** **Tools → Documents** → a file's move (folder-arrow) icon, or **Assign** on a file that needs review or could not be read.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click the move icon or **Assign**. The dialog "Move to a folder" opens with the file name.
2. Choose **Person** (or **New person…** and type the name in **New person**).
3. Choose **Document type**.
4. Click **Move and rename**. The toast "Moved and renamed" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Move icon (label "Move <file>") | Button | Opens the dialog | Hidden while the file is being read |
| **Assign** | Button | Opens the dialog | Shown for **Needs review** or **Could not be read** files |
| **Person** | Select | Target person, or **New person…** | Hidden when you have no folders |
| **New person** | Text | Name for a new folder; placeholder "Full name, as on the document" | Shown for **New person…** or when there are no folders |
| **Document type** | Select | One of the fixed types | — |
| **Cancel** / **Move and rename** | Buttons | Close / save | Save disabled while saving or without a person |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| New person | Text | Yes when creating | 1–80 characters, letters only after cleaning | Empty | "Enter a name using letters only" |
| Document type | Select | Yes | Fixed list | The file's current type, else Other | — |

**Settings and toggles here:** None.

**Results:** The file moves to the chosen person and type, is marked filed, and is renamed "<Type>_<date>" (date = document date, else upload date), with "-2", "-3"… if taken.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This document is still being read. Try again in a moment." | Still processing | Wait |
| "Couldn't move the file" | Other error | Try again |
| "Person not found" / "Document not found" | Removed meanwhile | Reload |

**Limitations:** The document date cannot be edited in the dialog (the API supports it).

**How it works:** For a new person the page first calls `POST /api/documents-sorter/people`, then `PATCH /api/documents-sorter/files/:id` with `personId` and `docType`.

**Related features:** F-DOCS-002, F-DOCS-003, F-DOCS-007.

**Sources:** `apps/web/src/pages/documentSorter/MoveDialog.tsx:22`, `apps/web/src/pages/documentSorter/MoveDialog.tsx:46`, `apps/web/src/pages/documentSorter/MoveDialog.tsx:83`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:41`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:89`, `packages/api/src/controllers/documentSorter.controller.ts:17`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:85`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:118`

### Unlock a password-protected document <!-- F-DOCS-006 -->
**What it does:** For a PDF stuck at **Needs a password**, sends the password you type so the file is read again.

**Why it exists:** Inferred from behavior: many statements are encrypted with PAN or date of birth.

**Where to find it:** **Tools → Documents** → **Needs attention** (or a folder) → **Enter password** on the file.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

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

**Related features:** F-DOCS-002, F-IMPORT-004.

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:64`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:85`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:114`, `packages/api/src/controllers/documentSorter.controller.ts:44`, `packages/api/src/services/documents/docSorter/sorter.service.ts:333`

### Rename or merge person folders <!-- F-DOCS-007 -->
**What it does:** Renames a person's folder, or merges it into another person's folder (all its files move there).

**Why it exists:** Folder names can be auto-created from documents; the page's note says "Rename it, or merge it into another folder if it is the same person."

**Where to find it:** **Tools → Documents** → open a person → **Rename**, and **Merge into…** + **Merge**.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Rename**, edit **Folder name**, and click the tick to save.
2. To merge, choose a folder in **Merge into…** and click **Merge**. The toast "Folders merged" appears and the target folder opens.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Rename** | Button | Shows the name field | — |
| **Folder name** + tick | Text + button | Saves the new name | Tick disabled while saving |
| **Merge into…** | Select | Target folder | Shown only when other folders exist |
| **Merge** | Button | Merges this folder into the target | Disabled without a target or while merging |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Folder name | Text | Yes | 1–80 characters, letters only after cleaning | Current name | "Enter a name using letters only"; "A folder with that name already exists. Merge the two folders instead." |

**Settings and toggles here:** None.

**Results:** Rename changes the folder name. Merge moves (and renames, if needed) every file into the target, remembers the merged name as an alias so future documents with that name file into the target, and deletes the merged folder.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't rename the folder" / "Couldn't merge the folders" | Server error or validation | Read the message and retry |
| "Pick two different folders to merge" | Same folder chosen | Choose another |

**Limitations:** There is no way to delete an empty folder from this page.

**How it works:** `PATCH /api/documents-sorter/people/:id` and `POST /api/documents-sorter/people/merge` (`fromId`, `intoId`).

**Related features:** F-DOCS-003, F-DOCS-005.

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:54`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:152`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:167`, `packages/api/src/controllers/documentSorter.controller.ts:55`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:146`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:159`

### Download folders as ZIP <!-- F-DOCS-008 -->
**What it does:** Downloads filed documents as a ZIP: everything (**Download everything**), one person (**Download all**), or one person's type (**Zip**).

**Why it exists:** Inferred from behavior: hand a person's or a type's documents to someone in one file.

**Where to find it:** **Tools → Documents** → **Download everything** (top), or inside a person: **Download all** and **Zip** on each type.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click the relevant button. The browser saves the ZIP ("all-documents.zip", "<person>-documents.zip" or "<person>-<type>.zip").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download everything** | Button | ZIP of all filed documents | Shown when there is at least one filed file |
| **Download all** | Button | ZIP of one person | In a person view |
| **Zip** | Button | ZIP of one type for that person | On each type section |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** A ZIP is saved on your device.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That is too much to zip in one go. Download one person or one type at a time." | Over 300 MB | Download a smaller set |
| "There are no files in that folder" | Nothing filed | — |
| "Couldn't download the folder" | Other error | Try again |

**Limitations:** Only filed documents are included (not those in **Needs attention**).

**How it works:** `GET /api/documents-sorter/folder-zip?personId=&docType=` builds the ZIP in memory (limit 300 MB total).

**Related features:** F-DOCS-003.

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:72`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:176`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:217`, `packages/api/src/controllers/documentSorter.controller.ts:66`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:15`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:212`

### What this area doesn't do
- Documents does not import transactions from the files you drop (use **Tools → Import** for that).
- You can't edit a document's date, add tags, or search across documents.
- You can't remember PDF passwords from this page.
- You can't delete a person folder.
