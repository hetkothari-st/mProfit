
## Roles and profiles

Role definitions are global (`_work/global/roles.md`); these headings are repeated so this fragment stands alone. How each role is affected by the features in this fragment:

### Signed-out visitor <!-- R-VISITOR -->
Can sign in, create an account, sign in with Google, reset a password, and read `/legal/ai-use` and `/privacy`. Opening `/connect/authorize` or `/onboarding` sends them to Sign in and back.

### Free user <!-- R-FREE -->
Every new account. Can use Settings, two-factor sign-in, account deletion, Account Access, broker connectors, see and revoke AI connections and set the family opt-in. Cannot approve or edit AI connectors or start an Account Aggregator consent.

### Plus subscriber <!-- R-PLUS -->
Everything Free can, plus approving and editing AI connectors and Account Aggregator consents. Bought on Pricing for 30 or 365 days.

### Family subscriber <!-- R-FAMILY -->
Same as Plus within this fragment.

### Pro/Advisor subscriber <!-- R-PRO -->
Same as Family within this fragment, plus the "Do you keep books for clients?" card on Account Access. The header Upgrade button is hidden for this plan.

### Administrator <!-- R-ADMIN -->
Admin powers here: the Loan rates admin page and the no-payment plan switch on Pricing, both requiring two-factor sign-in used for the session. Otherwise follows their own plan. Cannot be chosen at sign-up ("Cannot self-register with this role").

### Family owner <!-- R-FAMOWNER -->
n/a in this fragment, except that owning a family with other members blocks account deletion.

### Family contributor <!-- R-FAMCONTRIB -->
n/a in this fragment; can be shared with a relative's chatbot only after turning on the family opt-in.

### Family viewer <!-- R-FAMVIEWER -->
Same as Family contributor in this fragment.

### Managing a family member's account <!-- R-MANAGER -->
Settings profile, two-factor, deletion, Account Access and Pricing always act on the manager's own account. Loan rate alerts and broker connectors act on the managed person. Onboarding and AI connectors are refused.

### Professional acting for a client <!-- R-PROF -->
The other side of Account Access: the account holder controls this person's scope from Account Access. Needs two-factor sign-in (Settings).

### AI chatbot connection <!-- R-AICONN -->
Created and controlled from AI connectors and the approval page; reads only the shared areas through `/mcp`.

### Succession nominee <!-- R-NOMINEE -->
n/a in this fragment.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| Remember me on this device | Sign-in choice: keep the session after the browser closes (ticked) or end it with the tab |
| Verification code | 6-digit code emailed at sign-up; valid 10 minutes, 5 tries |
| Reset code | 6-digit code emailed by "Forgot password?"; valid 15 minutes, 5 tries; only the newest works |
| Two-factor sign-in | Optional second sign-in step with a 6-digit authenticator-app code; required for the professional workspace and admin tools |
| Backup code | One of 10 one-time codes (format ABCD-EFGH) shown when two-factor is turned on; each signs you in once |
| Danger zone | The Settings card holding **Delete account** |
| Grace period | The 30 days between asking to delete an account and its permanent erasure; signing in offers **Restore account** |
| Account Access | The page where you invite professionals and control what they can see and do in your books |
| Professional | A CA or advisor you invite into your books from Account Access |
| Reach strip | The Sees / Can / Until summary under each professional on Account Access |
| AI connectors | Linking your own ChatGPT or Claude to read your EveryPaisa data, read-only |
| Connector address | The `/mcp` web address you paste into ChatGPT or Claude |
| Sharing area | One of 11 data areas a connected chatbot may read (Investments … Documents) |
| Broker Connectors | The Connectors page cards that store your Zerodha, Upstox or Angel One developer keys and broker login |
| Account Aggregator (Finvu) | RBI-regulated consent framework, via Finvu, for pulling financial data; consents are started on the Connectors page |
| Demo mode | Server setting under which Account Aggregator consents are test fixtures approved with **Simulate approval** |
| Effective plan | The plan in force: a paid plan past its end date counts as Free |
| Billing cycle | Monthly (30 days) or Annual (365 days) when buying a plan |
| Starter portfolio | "My Portfolio", created automatically when setup opens |
<!-- END GLOSSARY -->
