[Index](../INDEX.md)

# How asset-class pages work

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

Every page in the **Asset Classes** sidebar section covered here (Stocks, F & O, Bonds, FDs & RDs, Gold & Silver, Crypto, NPS, Post Office, Others) is a view over the same thing: the transactions you record. You never type a holding directly. Each entry you add is saved as a transaction, and the app rebuilds the holding (units held, cost, value) from all of that asset's transactions every time one is added, changed or deleted. This chapter explains the rules every page shares; each page's own chapter repeats the parts that matter for it.

**How a holding is rebuilt from entries.** Entries are grouped into one holding per portfolio and per asset identity. The identity is, in order: the linked stock or fund, else the identifier you typed in the ISIN / account / certificate / PRAN / CoinGecko field, else the name (case and surrounding spaces ignored). So two entries with the same name but one with an account number and one without become two separate holdings. Entries are replayed oldest first (same day: in the order they were entered). These entry types add units: Buy, Deposit, Opening balance, SIP, switch-in, bonus (at zero cost), rights, merger/demerger in, dividend reinvest. These remove units, oldest units first: Sell, Redemption, Maturity, Withdrawal, switch-out, merger/demerger out. Interest received, coupon, staking reward, dividend and similar income entries are recorded and listed but **do not change the holding's units, cost or value**. When units fall to zero the holding disappears from the page (its transactions stay).

**Amount-only entries count as 1 unit.** FDs/RDs, NPS, PPF and Post Office entries are saved as quantity 1 at a price equal to the amount. A Withdrawal or Maturity entry therefore removes one whole earlier entry (the oldest), whatever amount you typed.

**How current value is worked out**, by class:

| Class | Current value |
|---|---|
| Stocks, ETFs | Units × latest stored stock price (price date shown as "as of …"; flagged stale after 5 days). |
| Physical gold, Sovereign Gold Bond, Gold ETF | Server: units × latest stored 24K gold price per gram. The Gold & Silver page replaces this with its own live calculation (see that chapter). |
| Physical silver | Server: grams × latest stored silver price per gram. |
| Crypto | Units × latest stored CoinGecko INR price for the linked coin (stale after 2 days). |
| FDs and RDs | Each deposit entry grown at its own rate and payout/compounding frequency up to today (capped at its maturity date). |
| NSC, KVP, SSY | Each deposit grown at its rate, compounded yearly. Post Office Time Deposit and RD: compounded quarterly. |
| SCSS, Post Office MIS, Post Office Savings | Equal to the amount invested (interest is treated as paid out). |
| Bonds, NPS, PMS, AIF, ULIP, REIT, InvIT, Art, Cash, Other | No current value — there is no price source. |

**Transactions lists show the newest 200.** Every asset page asks for up to 200 (FD and Post Office detail pages ask for 500, but the server caps every list at 200) transactions per asset class, newest first. Older entries are not listed, and RD installment counts and matching on detail pages only see those 200.

**Duplicate guard.** Saving an entry that matches one already recorded (same portfolio, asset, type, date, quantity and price) is refused with: "A <TYPE> of <qty> <name> at <price> on <date> is already recorded. Record it again only if this is a second, genuine trade." The asset-class dialogs have no "record anyway" option; change a field (for example add an account number) to save a genuinely separate entry.

**Who can change entries.** You can add, edit and delete entries only in portfolios you own; the server refuses others with "Forbidden".

### What this area doesn't do
- You cannot type a holding's quantity or value directly; only transactions.
- There is no manual "current value" field for Bonds, NPS, PMS, AIF, ULIP, REIT, InvIT, art, cash or other assets, so those holdings show no current value.
- Interest, coupon, dividend and staking entries do not increase the holding's value.
- Lists do not page beyond the newest 200 transactions per asset class.
- There is no bulk edit or bulk delete of entries on these pages.
