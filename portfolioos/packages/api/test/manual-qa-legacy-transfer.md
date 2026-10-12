# Manual QA — Legacy Transfer

Setup: local API + web, local Docker Postgres, SMTP pointed at a test inbox. User A on PLUS. Two test nominee inboxes.
Fast-forward the daily tick with `npx tsx src/scripts/legacyTimeTravel.ts <A's email> <YYYY-MM-DD>` (local DB only).

- [ ] FREE user: /legacy shows the upgrade card; Add nominee / Turn on are disabled; the API returns 403.
- [ ] PLUS user: the first save asks for a code (emailed, or TOTP if 2FA is on); later saves within 15 min don't ask.
- [ ] Inactivity < 30 is rejected in the UI and the API.
- [ ] Add 2 nominees (one verifier, one with amounts off). Turn on → both get the "named you as a trusted contact" email, with no amounts in it.
- [ ] A nominee clicks Confirm → the owner's list shows "confirmed".
- [ ] The owner gets a "plan was changed" email after each change.
- [ ] Time-travel to day 90 → WARNING_1 email to the owner with "I'm OK".
- [ ] Opening the "I'm OK" link does nothing until the button is clicked; then the page says reset and /legacy shows On with a new first-warning date.
- [ ] Time-travel through WARNING_1/2/FINAL/GRACE → nominees get the "about A's plan" mail; the verifier gets the Answer mail.
- [ ] Verifier "No, they're fine" → ARMED; the owner gets "verifier said you are OK"; nominees get "A is active again".
- [ ] Walk to GRACE again; the owner signs in (any page) → the next tick resets and nominees are told.
- [ ] Walk to RELEASED → nominees get the "shared with you" mail; the owner gets the "released" mail.
- [ ] A nominee opens the link → code email → view. The amounts-off nominee sees no ₹ anywhere (also check the network tab JSON).
- [ ] PDF download works; document download works only for shared docs.
- [ ] Wrong code 5× → locked message; the right code is refused during the lock.
- [ ] The nominee session header on any other API route → 401.
- [ ] The owner revokes all → the nominee's open page fails on refresh; nominees get the "withdrew access" mail.
- [ ] Remove a nominee while RELEASED → their access ends at once.
- [ ] Scheduled trigger: date 10 days out → reminder at T-7 and T-1; release on T with no grace.
- [ ] Pause 30 days during WARNING_2 → no mails; resume → ARMED.
- [ ] Downgrade A to FREE while ARMED → the plan still walks to RELEASED; A can still revoke/pause/remove but not add.
- [ ] Mobile 375px: /legacy, the nominee dialog and the access page have no horizontal scroll.
- [ ] Delete account A → all Legacy rows are gone.
