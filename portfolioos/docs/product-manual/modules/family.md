[Index](../INDEX.md)

# Family

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Family** area lets one household keep its finances together. A family is a group of EveryPaisa accounts linked by memberships, each with a role — **Owner**, **Contributor** or **Viewer** — and, for contributors and viewers, a list of asset classes and categories they may see. Owners add relatives two ways: by email invitation (the relative signs in themselves) or directly as a **managed member** (a profile with no login whose books another member keeps). The family page has two tabs: **Overview** (the household dashboard) and **Members & sharing** (tree, invitations, shared portfolios). Around the app, a header **Switch view** menu shows the whole app "as" a family, the sidebar shows a family tree, and the user menu lets the person who keeps a relative's books open that relative's account.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-FAM-001](../features/F-FAM-001.md) | Family page and family selector | Live | Lists every family you belong to and shows one of them at a time. |
| [F-FAM-002](../features/F-FAM-002.md) | Create a family | Live | Creates a new family with a name and makes you its first Owner. |
| [F-FAM-003](../features/F-FAM-003.md) | Family workspace header and seats | Live | Shows the selected family's name, description, the number of active members, your role, a seat-usage line, and the View this family across … |
| [F-FAM-004](../features/F-FAM-004.md) | Family dashboard: household wealth | Live | On the Overview tab, shows the household's gross assets, liabilities and net of liabilities, a breakdown of "Who the household's wealth … |
| [F-FAM-005](../features/F-FAM-005.md) | Family dashboard: needs attention | Live | A feed titled Needs attention listing open items across members: deposits maturing within 90 days, insurance premiums due within 30 days, … |
| [F-FAM-006](../features/F-FAM-006.md) | Family dashboard: household goals | Live | Card "What the household is saving for": every goal of every member you may see, with owner, target, current value, shortfall, … |
| [F-FAM-007](../features/F-FAM-007.md) | Family dashboard: protection and liabilities | Live | Card "Cover, gaps and what falls due": per member life cover, recommended cover, gap, health cover, annual premium, debt outstanding and … |
| [F-FAM-008](../features/F-FAM-008.md) | Family tree | Live | On Members & sharing, draws the family as an indented tree: each person as a pill (crown icon for Owners, eye icon for Viewers), spouses … |
| [F-FAM-009](../features/F-FAM-009.md) | Add a member directly (managed member) | Live | Adds a relative who has no email or login — a grandparent, a child — as a managed member: a real EveryPaisa profile that cannot sign in, … |
| [F-FAM-010](../features/F-FAM-010.md) | Add several members at once | Live | Adds up to 25 managed members in one go. |
| [F-FAM-011](../features/F-FAM-011.md) | Invite a member by email | Live | Creates an invitation for someone with an email address, then lets you read, edit and send the invitation email from the app, or copy the … |
| [F-FAM-012](../features/F-FAM-012.md) | Pay for an extra family seat | Live | When adding one more person (by invitation or as a managed member) would exceed the family's included seats, the app explains what is using … |
| [F-FAM-013](../features/F-FAM-013.md) | Pending invitations | Live | Lists invitations that have not been accepted and have not expired (email, role, expiry date) and lets owners cancel them. |
| [F-FAM-014](../features/F-FAM-014.md) | Edit a member's role and visibility | Live | Changes a signed-in member's relation, role (What they can do) and the asset classes and non-portfolio categories they may see of the other … |
| [F-FAM-015](../features/F-FAM-015.md) | Edit a managed member | Live | For a member with no login, changes how they are related (owners) and who keeps their books. |
| [F-FAM-016](../features/F-FAM-016.md) | Hand a managed account to its owner | Live | Sends the person a managed profile belongs to an invitation to take it over: they set a password and the profile becomes their own account … |
| [F-FAM-017](../features/F-FAM-017.md) | Remove a member | Live | Removes someone from the family. |
| [F-FAM-018](../features/F-FAM-018.md) | Shared portfolios | Live | Lists the family's shared portfolios (name, currency, holdings, transactions) and lets owners and contributors create a new shared … |
| [F-FAM-019](../features/F-FAM-019.md) | Accept a family invitation | Live | The page behind the invitation email's link. |
| [F-FAM-020](../features/F-FAM-020.md) | Take over your account | Live | The page behind a hand-over email. |
| [F-FAM-021](../features/F-FAM-021.md) | Family member page | Live | One member in full: net worth, gross assets, invested, unrealised P&L, liabilities, allocation chart ("What they own"), … |
| [F-FAM-022](../features/F-FAM-022.md) | Switch view (family view across the app) | Live | The header menu Switch view lets you see the app as Personal view or as one of your families. |
| [F-FAM-023](../features/F-FAM-023.md) | Sidebar family tree | Live | At the top of the sidebar, for users in at least one family: each family as a row (house icon) that opens /family, with a chevron that … |
| [F-FAM-024](../features/F-FAM-024.md) | Managing a family member's account | Live | Lets the person who keeps a managed member's books switch the browser tab into that member's account to add their FDs, insurance and … |

Settings for this module: [settings/family.md](../settings/family.md)

### What this area doesn't do
- You can't rename a family, change its description or delete a family from the app (rename exists only as an API, [F-FAM-025](../features/F-FAM-025.md)).
- You can't leave a family from the app ([F-FAM-026](../features/F-FAM-026.md)); an owner must remove you.
- You can't unshare a family-shared portfolio from the app ([F-FAM-027](../features/F-FAM-027.md)).
- Owners can't edit another member's personal data, even in family view.
- A managed member can't sign in or be made an Owner until they take the account over.
- There is no per-family URL: `/family` always opens your first family.
- Declining an invitation doesn't notify the owner or cancel it.
