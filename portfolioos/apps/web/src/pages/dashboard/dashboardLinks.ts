// Pure routing helpers for the dashboard, kept out of DashboardPage.tsx so
// they can be unit-tested without rendering the page.

// Map an asset class enum to the sidebar section key that controls its visibility
// on the dashboard. Hidden sidebar sections cascade to: holdings table rows,
// breakdown pie slices, and the per-section summary cards at the bottom.
export function assetClassSidebarKey(cls: string): string {
  switch (cls) {
    case 'EQUITY':            return '/stocks';
    case 'FUTURES':
    case 'OPTIONS':           return '/fo';
    case 'MUTUAL_FUND':
    case 'ETF':               return '/mutual-funds';
    case 'BOND':
    case 'GOVT_BOND':
    case 'CORPORATE_BOND':    return '/bonds';
    case 'FIXED_DEPOSIT':
    case 'RECURRING_DEPOSIT': return '/fds';
    case 'GOLD_BOND':
    case 'GOLD_ETF':
    case 'PHYSICAL_GOLD':
    case 'PHYSICAL_SILVER':   return '/gold';
    case 'CRYPTOCURRENCY':    return '/crypto';
    case 'FOREIGN_EQUITY':
    case 'FOREX_PAIR':        return '/forex';
    case 'PPF':
    case 'EPF':               return '/provident-fund';
    case 'NSC':
    case 'KVP':
    case 'SCSS':
    case 'SSY':
    case 'POST_OFFICE_MIS':
    case 'POST_OFFICE_RD':
    case 'POST_OFFICE_TD':
    case 'POST_OFFICE_SAVINGS': return '/post-office';
    case 'REAL_ESTATE':       return '/real-estate';
    case 'ULIP':
    case 'INSURANCE':         return '/insurance';
    case 'LOAN_GIVEN':        return '/loans';
    default:                  return '/others';
  }
}

// Sidebar section that controls a net-worth allocation slice. Most slices are
// asset classes, but two are not: the server emits the vehicles total as key
// 'VEHICLE' (category VEHICLE) and the rental-property total as key
// 'REAL_ESTATE' (category REAL_ESTATE). Run through assetClassSidebarKey those
// fell to '/others' and '/real-estate', so hiding Vehicles or Rental in the
// sidebar left their slices on the ring while hiding Others / Real Estate
// removed them. The category tells them apart from a REAL_ESTATE asset-class
// holding, which really does belong to the Real Estate section.
export function allocationSliceSidebarKey(slice: { key: string; category: string }): string {
  if (slice.category === 'VEHICLE') return '/vehicles';
  if (slice.category === 'REAL_ESTATE') return '/rental';
  return assetClassSidebarKey(slice.key);
}

// Where the Top holdings "View all" link goes. There is no /holdings page;
// the full holdings table lives on a portfolio's detail page, so a single
// selected portfolio deep-links there and the all-portfolios view lands on
// the portfolio list.
export function topHoldingsViewAllHref(selectedId: string): string {
  return selectedId && selectedId !== 'ALL'
    ? `/portfolios/${encodeURIComponent(selectedId)}`
    : '/portfolios';
}
