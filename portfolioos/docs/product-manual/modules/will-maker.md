[Index](../INDEX.md)

# Will Maker

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

**Will Maker** helps you "Write a simple will under Indian law from your EveryPaisa data, check it, and download it to sign." It is an 8-step wizard (Overview, Your details, People & roles, Assets & liabilities, Allocate, Instructions, Review, Preview) followed by step 9, **Sign and store**. Your asset list is pulled from your EveryPaisa accounts; rules check the will before a PDF can be generated; signed copies are stored and a review reminder fires every two years. Every page carries the disclaimer: "This is not legal advice. Passing these checks does not guarantee that your will is legally valid. Get it reviewed by a qualified advocate before you sign it."

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-WILL-001](../features/F-WILL-001.md) | Will Maker overview | Live | Shows your will's status (Not created, Draft, Generated, Executed), the current draft or latest generated version with its actions, an … |
| [F-WILL-002](../features/F-WILL-002.md) | Will history | Live | Card History listing every version (newest first) with its status badge and a line such as "Started … - generated … - signed … - replaced … |
| [F-WILL-003](../features/F-WILL-003.md) | Will review reminders | Live | Two years after you sign (and every two years after a review), a banner "Time to review your will" appears on Will Maker and an alert "Time … |
| [F-WILL-004](../features/F-WILL-004.md) | Will wizard: navigation and saving | Live | The frame around steps 2–8: a stepper (full row on wide screens, "Step N of 8" bar on narrow), Back and Next, a save status ("Saving...", … |
| [F-WILL-005](../features/F-WILL-005.md) | Step 2: Your details | Live | Collects your identity and family situation: full legal name, how you are described ("Son of …"), date of birth, country whose law applies, … |
| [F-WILL-006](../features/F-WILL-006.md) | Step 3: People & roles | Live | Builds the list of people and organisations in your will and assigns the executor, back-up executor, guardian and back-up guardian. |
| [F-WILL-007](../features/F-WILL-007.md) | Step 4: Assets & liabilities | Live | Lists the assets and liabilities fetched from your EveryPaisa accounts with value, ownership (Sole, Joint, Nominee only, HUF) and your … |
| [F-WILL-008](../features/F-WILL-008.md) | Step 5: Allocate | Live | Decides who gets what: By percentage (the residuary estate shared in percentages that must total 100%, shown in a donut chart), Specific … |
| [F-WILL-009](../features/F-WILL-009.md) | Step 6: Instructions | Live | One optional text box, Additional instructions (optional), for wishes such as funeral arrangements or organ donation, "printed word for … |
| [F-WILL-010](../features/F-WILL-010.md) | Step 7: Review | Live | A checklist of every rule with a tick, warning or cross and the message for each problem, a Fix button that jumps to the right step (and … |
| [F-WILL-011](../features/F-WILL-011.md) | Step 8: Preview and generate the PDF | Live | Shows a summary and the full text of the will as it will print, asks you to tick the acknowledgement, and generates the PDF as a new … |
| [F-WILL-012](../features/F-WILL-012.md) | Sign and store (step 9) | Live | Explains how to sign the will correctly, links to free legal help, and records the signing date and two witnesses with a scan or photo of … |
| [F-WILL-013](../features/F-WILL-013.md) | Will documents after a plan lapse | Live | Below PLUS, Will Maker is locked but the card "Your will documents" still offers Download PDF and Download signed copy for your current … |

Settings for this module: [settings/will-maker.md](../settings/will-maker.md)

### What this area doesn't do
- It does not support wills under foreign law or Muslim personal law.
- It does not give legal advice or register the will; registration is your step at the Sub-Registrar.
- You can't make or view a will for a managed family member, even as their keeper.
- You can't edit a generated version; changes need a new version.
- Only one draft can exist at a time.
