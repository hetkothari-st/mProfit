[Index](../INDEX.md)

# Stop or complete a Succession countdown

`W-SUCC-002` · Succession

**Goal:** Understand what happens when you are inactive, and how to stop it.
**Who:** Plan owner (any plan once armed); verifier nominee.

| # | You do | The app does |
|---|---|---|
| 1 | Stay inactive for the chosen days | Daily 10:00 IST: "Are you OK? (first Succession reminder)" ([F-SUCC-006](../features/F-SUCC-006.md)) |
| 2 | (Inactive 7 more days each) | Second, then final reminder |
| 3 | (Inactive 7 more days) | Status "Nominees notified"; owner gets "Your nominees will get access in 7 days"; nominees get a notice; verifier gets "Please confirm: is <you> OK?" |
| 4 | Click **I'm OK** in any reminder, or sign in | Countdown resets to **On**; nominees get "Update about <you>" if they were notified ([F-SUCC-007](../features/F-SUCC-007.md)) |
| 5 | If nothing happens for 7 days (or the verifier clicks **Yes, share their information now**) | Released: nominees get **View information**; owner gets "Your Succession plan was released" |
| 6 | Owner clicks **Revoke all access** if it was a mistake | Access ends; nominees get "<you> withdrew access"; plan re-arms |

**Success:** Either the countdown is reset, or nominees have read-only access.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Settings locked | Plan is in a reminder or notice stage | **Pause** first |
| "This link is no longer valid." on I'm OK | Old link or plan moved on | Sign in instead |
