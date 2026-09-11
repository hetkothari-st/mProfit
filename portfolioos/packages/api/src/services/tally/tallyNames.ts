/**
 * Names for Tally masters.
 *
 * Tally rejects a master whose name is already used by any other master —
 * group or ledger, in any case ("Name/alias duplicated across masters",
 * help.tallysolutions.com — Import Data errors). Its predefined groups exist
 * in every company, as do its two predefined ledgers, so every name this
 * export emits must avoid those too.
 */
import { TALLY_RESERVED_GROUPS } from '../reportBuilder/tally/accountGroupMapping.js';

export { TALLY_RESERVED_GROUPS };

/** Ledgers every new Tally company already has. */
export const TALLY_PREDEFINED_LEDGERS = ['Cash', 'Profit & Loss A/c'] as const;

const RESERVED = new Set<string>(
  [...TALLY_RESERVED_GROUPS, ...TALLY_PREDEFINED_LEDGERS].map((n) => n.toLowerCase()),
);

/** Whether Tally already owns this name in every company. */
export function isReservedTallyName(name: string): boolean {
  return RESERVED.has(name.toLowerCase());
}

/** Trim, collapse whitespace, drop control characters; never empty. */
export function cleanTallyName(raw: string): string {
  let spaced = '';
  for (const ch of raw) {
    const cp = ch.codePointAt(0)!;
    // C0 control characters and DEL read as spaces, so words stay apart.
    spaced += cp < 0x20 || cp === 0x7f ? ' ' : ch;
  }
  const cleaned = spaced.replace(/\s+/g, ' ').trim();
  return cleaned || 'Unnamed';
}

/**
 * Hands out one unique name per key, in one namespace shared by groups and
 * ledgers. A reserved name gets " A/c"; a clash gets " (2)", " (3)"…
 */
export class TallyNamer {
  private readonly byKey = new Map<string, string>();
  private readonly taken = new Set<string>();

  name(key: string, base: string): string {
    const existing = this.byKey.get(key);
    if (existing) return existing;

    const clean = cleanTallyName(base);
    const start = isReservedTallyName(clean) && !/ A\/c$/i.test(clean) ? `${clean} A/c` : clean;
    let candidate = start;
    for (let i = 2; this.isTaken(candidate); i++) candidate = `${start} (${i})`;

    this.byKey.set(key, candidate);
    this.taken.add(candidate.toLowerCase());
    return candidate;
  }

  private isTaken(name: string): boolean {
    return isReservedTallyName(name) || this.taken.has(name.toLowerCase());
  }
}
