[Index](INDEX.md)

# Changed since this manual was written

This manual describes the app at commit 9d9025c4. The changes below were released after that commit, so they override what the chapters say. Each line names the chapter it affects and the release (pull request) that made the change. Until the chapters are refreshed, trust this list where the two disagree.

### Values you will see change

- **Gold & Silver** (#299): gold ETFs are now valued at their own listed price, not the 24K per-gram rate, so their value drops to the real figure (about 100 times lower than before). Physical gold and silver are valued at the purity saved on the entry (for example 22K or 925). Sovereign Gold Bonds still use the 999 per-gram rate. A gold ETF the app cannot link to a listed price is carried at cost.
- **Bonds, NPS, Other Assets** (#299): holdings with no price are now counted at cost instead of ₹0, and their P&L shows "—" instead of −100%.
- **FDs & RDs, Post Office, NPS, PPF & EPF** (#299): a withdrawal now takes out the amount withdrawn, oldest deposit first, instead of removing a whole entry. An RD maturity payout closes every instalment. Interest accrues only on the principal still left.
- **FDs & RDs** (#307): the FD and RD cards, the detail page and the dashboard now use one formula based on the deposit's real dates. FDs that pay at maturity now compound quarterly instead of annually, so their value is slightly higher. The RD card names the real compounding frequency.
- **Loans, Dashboard** (#300): a loan with status Default still counts as money you owe in net worth and on the Loans page ("Defaulted · still owed"). The dashboard and the Loans page now show the same outstanding balance: the opening balance of the first unpaid EMI dated today or later. Past EMIs you have not marked are treated as paid.
- **Loans** (#300): the loan tax panel now uses the same rules as the EMI Calculator and shows the current financial year only (old regime, 30% slab plus 4% cess, 24(b) up to ₹2 lakh, 80C up to ₹1.5 lakh, 80E for 8 years).
- **Credit Cards** (#300): the card's outstanding balance is now worked out again whenever a statement is added, paid, un-paid or deleted. A card that already shows a wrong balance corrects itself on its next statement change.
- **Goals** (#308): when a goal has an inflation rate, the required return is now worked out against the inflation-adjusted target, and the card shows "Target with X% inflation".
- **PPF & EPF** (#308): importing a passbook now sets the account balance from the latest passbook row. Linked PF accounts still do not count toward net worth.
- **Forex** (#308): profit and loss now matches buys and sells across financial years (FIFO per currency pair).
- **Cash Activity** (#308): foreign-currency split settlements show their own currency, with the rupee value underneath.
- **Dashboard** (#299): the first release after this change rebuilds every holding and capital gain once.

### Screens and buttons that changed

- **Dashboard** (#301): **View all** on Top holdings opens the portfolio page. Pie slices for vehicles and rentals follow their own sidebar entries. Hide values now also masks the Net worth over time and bank Balance history charts. The Alerts **Scan now** message counts every kind of alert found.
- **AI Assistant** (#301): the assistant button appears only when the assistant is switched on for the app. Chat works while you manage a family member; the usage limit and the AI-use notice follow you, not the member. The unused button on action cards is gone.
- **Transactions** (#301): the form now shows trade-date and price errors, and **Record it anyway** works when editing.
- **Settings, Sign-in & session** (#304): Settings → Sessions has **Sign out everywhere**. Signing out is now recorded in the audit log. Settings shows the masked PAN that is saved (only the last few characters) or "No PAN saved", and shows the plan's end date and display name. Signed-in users who open Register or Forgot password are sent on to the app.
- **Plans & billing** (#304, #297): you can no longer buy a plan lower than your active plan; lower plans show "Included in your plan". Renewing the same plan early adds time from the current end date. Pricing no longer lists "Priority AA refresh".
- **Account Access** (#304): account holders can preview and send the professional invitation email without a two-factor session.
- **Connections** (#297, #304): the Finvu consent card is shown to administrators only, and its text says automatic sync is not built yet.
- **Mutual Funds** (#297, #299, #309): the Finvu sandbox card is shown to administrators only. **Sync AMFI NAV** is now **Refresh NAVs**, which re-prices only your own holdings. MF analysis re-runs on its own after holdings change or new fund scores arrive. The CAS request dialog now uses your chosen Portfolio and Nickname, routes the emailed statement to that portfolio, and shows the PAN being used (masked). Only administrators see the CAS credit balance. The switch-cost panel says "Not calculated yet" for break-even.
- **All asset-class pages** (#299): transaction lists are no longer cut off at 200 rows. **Refresh prices** re-prices only your own portfolios, at most 5 times a minute.
- **Futures & Options** (#307): the header button syncs every connected broker (Zerodha, Upstox, Angel One), and each broker chip has its own sync link. The "new trades" count counts only trades actually added. Rejecting an expiry close puts the position back to open; a position past its expiry shows "OPEN · EXPIRED".
- **Email ingestion, Gmail connection** (#302): new monitored senders start in review; auto-commit can be switched on only after the approval threshold is reached. `@domain` senders now match addresses on that domain and its subdomains. Page text gives the real poll interval and mentions send-as-you access.
- **Import, Documents** (#302): a wrong file password keeps the dialog open with "That password didn't unlock the file". Failed jobs show an **Errors** button. Unsupported file types give a clear message.
- **Rental, Real Estate** (#303): undoing an auto-matched rent month keeps the bank credit in Cash Activity. A rejected rent reminder stays rejected for that month. **Remove from rentals** explains what to delete first. Deleting a rental property or tenancy also removes the rent cash flows it created.
- **Vehicles** (#303): **Use my car** keeps Model, Year and Trim. The edit form can clear optional fields. A missing vehicle shows "Vehicle not found".
- **Insurance** (#308): the edit form has a Status field; a policy that is not active stops raising premium reminders.
- **PPF & EPF** (#308): the EPFO password reset and UAN lookup now run from the web app.
- **Accounting** (#308): the suggested voucher number moves on after each voucher. Auto vouchers cannot be deleted; change the transaction they come from instead.
- **Alerts & Reminders** (#308): the PF reminder job runs at 09:00 IST.
- **Reports, Tax Planning, Analytics** (#305): tax-page CSVs follow "Download reports for". Pickers list only portfolios the report can serve. Family and member downloads cover all of that person's portfolios. The F&O (Sec. 43(5)) tab shows a plan-lock card below Pro/Advisor. Download errors show as a message, not raw server text. The Analytics tax-harvest card follows the selected portfolio, and Concentration flags a portfolio when its top 3 holdings are more than 60%.
- **Professional workspace (Client books)** (#305, #306): professionals can download a client's reports when the client's plan includes them. Corrections to a client's SIP, switch-in or dividend reinvest add charges to the net amount. Deleting an account, voucher or FMV asks for confirmation. The invitation page says access starts view-only.
- **Investment Advisor** (#306): the allocation card uses the model portfolio your latest risk assessment chose. Priority badges read "Do first", "Soon" or "When convenient" by the engine's bands. Snoozed recommendations return to Open when the snooze ends.
- **Split Expenses** (#306): friend totals name any group left out because there is no exchange rate yet.
- **Family, Succession** (#297, #298): invited members can open the family dashboard when the family creator's plan includes it. The invite form starts with every visibility box ticked; owners are warned about members who can see nothing. Each family in the sidebar opens its own family. A keeper can edit the managed members whose books they keep. Succession explains that it works on your own account only while you manage a relative.
- **Roles and profiles** (#297): a signed-in user without the right role now gets "forbidden" (403) instead of being signed out and back in. Admin tools for MF qualitative facts need a two-factor session.

### Known gaps still open

- Linked PF accounts do not add to net worth (counting them would double-count manual EPF/PPF entries).
- On the FD form, "Interest Payout" actually sets how often interest compounds.
- Managed profiles that are claimed may start with empty visibility lists and see nothing until an owner edits them.
- Editing an auto voucher is undone on the next sync.
