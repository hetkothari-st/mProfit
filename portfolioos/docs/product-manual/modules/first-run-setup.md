[Index](../INDEX.md)

# First-run setup

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

A full-screen wizard (no sidebar) that new accounts see right after signing up: three short welcome panels, a picker of what you own, a quick form per item, and a summary. Every step can be skipped, and everything you add is saved through the same records the full pages use, so it can be refined later.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-ONB-001](../features/F-ONB-001.md) | Welcome panels | Live | Shows three panels before asking for anything: a greeting, what the app does, and what happens to your data. |
| [F-ONB-002](../features/F-ONB-002.md) | Starter portfolio created automatically | Live | Creates a portfolio called "My Portfolio" (type Investment) for you as soon as the wizard opens, so the things you add have somewhere to go. |
| [F-ONB-003](../features/F-ONB-003.md) | "What do you have?" picker | Live | Lets you tick the kinds of things you own so the wizard asks only about those. |
| [F-ONB-004](../features/F-ONB-004.md) | Quick-add forms (9 kinds) | Live | For each ticked item, shows a short form; each Add saves one real record and lists it above the form so you can add another straight away. |
| [F-ONB-005](../features/F-ONB-005.md) | Finish, skip and resume setup | Live | Ends the wizard with a summary and sends you to the dashboard; remembers in this browser if you left setup unfinished so you are brought … |
