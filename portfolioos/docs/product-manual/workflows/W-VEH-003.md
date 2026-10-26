[Index](../INDEX.md)

# Check a vehicle's challans

`W-VEH-003` · Vehicles

**Goal:** See pending fines.
**Who:** Any signed-in user.
**Before you start:** The vehicle exists. Optionally set **Chassis (Last 4)** (needed only for the operator-enabled browser source).

| # | You do | The app does |
|---|---|---|
| 1 | Open the vehicle → **Check challans** | Tries CarInfo, then the e-challan site |
| 2 | Read the toast and the table; use **Pending**/**Paid**/**Contested** tabs | Shows counts and totals |

**Success:** "Challan scan: N new, M updated" or "no changes"; new challans also appear for review in the import review queue.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "All challan sources failed — …" | Sources unavailable | Retry later; the monthly scan on the 1st also retries |
