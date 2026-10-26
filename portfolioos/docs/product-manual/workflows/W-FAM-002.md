[Index](../INDEX.md)

# Invite a relative by email and have them join

`W-FAM-002` · Family

**Goal:** Give a relative with their own email a place in the family.
**Who:** [R-FAMOWNER](../roles.md#r-famowner) invites; the invitee (any plan) accepts.
**Before you start:** A free seat, or Razorpay configured for a paid seat.

| # | You do | The app does |
|---|---|---|
| 1 | **Add member → Invite by email**, fill **Email**, relation, **What they can do** | — |
| 2 | For a contributor or viewer, click **All** in both visibility lists (or tick what they may see) | — |
| 3 | **Next: write the email** | Invitation created (14 days); composer opens ([F-FAM-011](../features/F-FAM-011.md)) |
| 4 | Edit subject/message, **Send email** (or copy the link) | Toast "Sent to <email>"; **Pending invitations** lists it |
| 5 | Invitee opens the link, signs in with the invited email, clicks **Accept** | Toast "Invitation accepted"; they land on Settings; the family appears in their switcher and sidebar ([F-FAM-019](../features/F-FAM-019.md)) |

**Success:** The member shows on the tree; seat line counts them as a member.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Contributor/viewer sees none of the household's data | Both visibility lists were left empty (deny-all) despite the "Empty = no restriction" hint | Owner edits the member and clicks **All** ([F-FAM-014](../features/F-FAM-014.md)) |
| "This invitation was sent to a different email address." | Signed in with another account | Sign in with the invited email |
| "Invitation expired." | Older than 14 days | Cancel and invite again |
| Overview tab locked for the new member | Their own plan is below FAMILY | They upgrade; family view still works |
