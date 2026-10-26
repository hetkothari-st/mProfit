[Index](../INDEX.md)

# Succession

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

**Succession** (called "Legacy Transfer" in code and URLs) makes sure the people you name — your **nominees** — learn about your finances if you stop using EveryPaisa for a long time, or on a date you choose. You pick what each nominee may see. Before anything is shared there are three weekly reminder emails to you and a 7-day notice to nominees; signing in or clicking "I'm OK" stops it. Nominees then get a read-only view behind an emailed one-time code. The page footer states: "Succession shares information only. It is not a will and does not transfer any asset. Nominees never get edit access."

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-SUCC-001](../features/F-SUCC-001.md) | Succession status and controls | Live | Shows the plan's Status badge and a one-line next event, and offers the controls that fit the status: Turn on, Pause (with a date), Resume, … |
| [F-SUCC-002](../features/F-SUCC-002.md) | When to share | Live | Sets what starts the countdown — If I'm inactive, On a date, or Whichever comes first — the inactivity period, the release date and an … |
| [F-SUCC-003](../features/F-SUCC-003.md) | Succession test mode (admins) | Live | For administrators only, a checkbox Test mode: 1 minute (admins only) makes inactivity and every reminder stage last 1 minute, so nominees … |
| [F-SUCC-004](../features/F-SUCC-004.md) | Nominees | Live | Lists up to 10 nominees (name, relationship, Verifier badge, email with confirmation state, what they can see, whether amounts are shown) … |
| [F-SUCC-005](../features/F-SUCC-005.md) | Confirm it's you (step-up) | Live | Before any change to Succession, asks for a fresh code: your authenticator code (or a backup code) if two-factor sign-in is on, otherwise a … |
| [F-SUCC-006](../features/F-SUCC-006.md) | Countdown, reminders and release | Live | Runs the plan automatically. |
| [F-SUCC-007](../features/F-SUCC-007.md) | Email link actions: I'm OK, Confirm, Verifier answer | Live | Three no-login pages behind emailed links. |
| [F-SUCC-008](../features/F-SUCC-008.md) | Nominee view of shared information | Live | After release, a nominee opens their link, receives a one-time code by email, and sees "<owner>'s financial information": the owner's … |

Settings for this module: [settings/succession.md](../settings/succession.md)

### What this area doesn't do
- It does not transfer any asset or act as a will; it shares information only.
- Nominees never get edit access or a login.
- You can't set different release rules per nominee; one trigger applies to the whole plan.
- A manager can't set up or view Succession for a managed family member.
- There is no SMS reminder; all notices are email.
