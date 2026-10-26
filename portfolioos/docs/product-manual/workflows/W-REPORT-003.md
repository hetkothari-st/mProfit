[Index](../INDEX.md)

# Download a report for a family member or the whole household

`W-REPORT-003` · Reports

**Goal:** Produce a report covering a spouse or the family.
**Who:** [R-FAMOWNER](../roles.md#r-famowner); [R-FAMCONTRIB](../roles.md#r-famcontrib) / [R-FAMVIEWER](../roles.md#r-famviewer) with an uncapped view.
**Before you start:** Switch the header view to the family ([D-REPORT-007](../dependencies.md#d-report-007)).

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Reports** | **Report for** appears |
| 2 | Choose a member or **Whole family (one section per member)** | Tax & MIS shows "These downloads cover …" |
| 3 | Keep **Portfolio** = **All portfolios**; download from a tab, Statements or Tax & MIS | File name ends with `-family` or the member's name |

**Success:** A file with one section per member (family) or that member's data.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Your view of this family is limited to certain categories, and reports cannot yet be produced in a limited form. …" | Your family role is capped | Download your own reports; ask an owner |
| "The Tally export covers one person — …" (or the holdings / dashboard export / FY bundle equivalent) | That report is one person per file | Pick a single member |
| "A family must be selected before a report can be run for another member or for the household." | No family view | Switch to the family view first |
