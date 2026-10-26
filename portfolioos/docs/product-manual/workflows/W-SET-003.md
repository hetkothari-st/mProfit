[Index](../INDEX.md)

# Invite your CA or advisor

`W-SET-003` · Settings

**Goal:** Let a professional see (and optionally keep) your books.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** Turn on two-factor sign-in and sign in with a code (needed for the email step in this version).

| # | You do | The app does |
|---|---|---|
| 1 | **Account Access → Invite a professional**, enter name and email, **Continue to the email** | Creates the invitation (14-day link) |
| 2 | Edit subject/message, **Send email** or copy the link | Sends the email or copies the link |
| 3 | The professional accepts from their own account | Toast "<name> accepted your invitation."; row moves to **With access** (view only) |
| 4 | **Manage access**, set permissions, scope and dates, **Save access** | Applies on their next request |

**Success:** The professional appears under **With access** with the reach you chose. Their side continues in **Client books** ([D-SET-004](../dependencies.md#d-set-004)).
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Preparing the email…" never finishes | No two-factor session | Turn on two-factor, sign in again, use **Send again** |
| "You have already invited <email>…" | Duplicate | **Send again** or **Cancel invitation** first |
| "That invitation has expired. Send a fresh one." | Over 14 days | Cancel and invite again |
