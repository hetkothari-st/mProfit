---
id: F-CAS-002
title: "Provider info"
module: "CAS"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-CAS-001, F-IMPORT-004]
---

[← CAS](../modules/cas.md) · [Index](../INDEX.md)

# Provider info

`F-CAS-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows facts about the selected provider: name, coverage, **PDF password**, **Email from**, **Subject** and notes.

**Why it exists:** Inferred from behavior: tells you which email to look for and which password opens the PDF.

**Where to find it:** **Tools → CAS**, card **Provider info**.

**Who can use it:** Same as [F-CAS-001](F-CAS-001.md).

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

**Related features:** [F-CAS-001](F-CAS-001.md), [F-IMPORT-004](F-IMPORT-004.md) (the app tries PAN and PAN + date of birth automatically).

**Sources:** `apps/web/src/pages/cas/CasPage.tsx:133`, `packages/api/src/controllers/cas.controller.ts:24`
