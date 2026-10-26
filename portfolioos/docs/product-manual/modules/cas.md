[Index](../INDEX.md)

# CAS

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **CAS** page (sidebar **Tools → CAS**, route `/cas`, title "Consolidated Account Statement") is a helper for requesting a Consolidated Account Statement from CAMS, KFintech, NSDL or CDSL yourself. It does not contact the providers: it prepares the details to enter, links to the provider's request page, and tells you what happens next. To have the app submit a CAS request for you, use the mutual fund sync dialogs on **Asset Classes → Mutual Funds** ([D-IMPORT-002](../dependencies.md#d-import-002)).

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CAS-001](../features/F-CAS-001.md) | Request CAS helper | Live | You choose a provider and optionally type a PAN, email and date range; Generate Request returns a link Open provider portal, a list of … |
| [F-CAS-002](../features/F-CAS-002.md) | Provider info | Live | Shows facts about the selected provider: name, coverage, PDF password, Email from, Subject and notes. |

### What this area doesn't do
- The CAS page does not submit the request to the provider or fetch the PDF itself.
- It does not remember the PAN or email you type.
