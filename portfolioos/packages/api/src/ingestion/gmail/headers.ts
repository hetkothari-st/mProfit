/**
 * Parse an RFC 5322 `From` header into its display-name and address parts.
 *
 * Gmail hands us From values in three shapes we have to tolerate:
 *   1. `"Full Display" <addr@example.com>`  — quoted name
 *   2. `Plain Display <addr@example.com>`   — unquoted name
 *   3. `addr@example.com`                    — bare address
 *
 * A strict RFC parser is overkill for our use: we only need the address
 * (lowercased, for grouping) and an optional human label (for the
 * discovery UI). Addresses with embedded quotes or parentheses in the
 * local-part are exotic enough that we fall back to "best effort": we
 * grab whatever looks like an address. Worst case the UI shows the raw
 * string and the user picks anyway.
 *
 * We intentionally lowercase the returned `address`. Gmail addresses are
 * case-insensitive on the domain and almost universally so on the local
 * part; grouping `Alerts@Bank.com` with `alerts@bank.com` is almost
 * always what the user wants for inbox discovery.
 */

export interface ParsedFrom {
  /** Lowercased email address, or null if we couldn't find one. */
  address: string | null;
  /** Display name with surrounding quotes stripped, or null if absent. */
  displayName: string | null;
}

/**
 * A loose email-address matcher. We don't need RFC-perfect validation
 * because these strings were already accepted by Gmail upstream — any
 * address it stored is by definition deliverable. We only care about
 * *extracting* the address back out cleanly.
 */
const ADDRESS_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function parseFromHeader(raw: string | null | undefined): ParsedFrom {
  if (!raw) return { address: null, displayName: null };
  const trimmed = raw.trim();
  if (!trimmed) return { address: null, displayName: null };

  // Shape 1 & 2: `<addr>` present.
  const angled = /^(.*?)<([^>]+)>\s*$/.exec(trimmed);
  if (angled) {
    // The regex has two capture groups, both required — if `angled` is
    // truthy these are strings. The nullish checks satisfy
    // `noUncheckedIndexedAccess`.
    const rawName = angled[1] ?? '';
    const inner = angled[2] ?? '';
    const name = rawName.trim().replace(/^"(.*)"$/, '$1').trim();
    const addrMatch = ADDRESS_RE.exec(inner);
    return {
      address: addrMatch ? addrMatch[0].toLowerCase() : null,
      displayName: name.length > 0 ? name : null,
    };
  }

  // Shape 3: bare address. Still pull it through the regex to strip any
  // stray whitespace or comment syntax Gmail might have left behind.
  const bare = ADDRESS_RE.exec(trimmed);
  return {
    address: bare ? bare[0].toLowerCase() : null,
    displayName: null,
  };
}
