import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { buildTallyBook, emptyTallySources, type TallyBook } from '../../../src/services/tally/tallyBook.js';
import { TallyExportBlockedError, tallyZipEntries } from '../../../src/services/tally/tallyPackage.js';

// What goes into the ZIP: masters first, then one transactions file per
// financial year in order, then a plain-words guide. A book that breaks a
// Tally rule produces no import files at all.

const book = buildTallyBook({
  ...emptyTallySources(),
  trades: [
    {
      id: 't1', date: '2023-06-01', kind: 'BUY', assetClass: 'EQUITY', holdingKey: 'stock:inf', holdingName: 'Infosys Ltd',
      quantity: '10', price: '1450', gross: '14500', charges: '0', cost: null, shortTermGain: '0', longTermGain: '0',
    },
    {
      id: 't2', date: '2024-06-01', kind: 'SELL', assetClass: 'MUTUAL_FUND', holdingKey: 'fund:x', holdingName: 'Axis Bluechip Fund',
      quantity: '5', price: '200', gross: '1000', charges: '0', cost: null, shortTermGain: '0', longTermGain: '0',
    },
  ],
});

describe('tallyZipEntries', () => {
  const entries = tallyZipEntries(book, { generatedAt: new Date('2026-09-11T10:00:00Z') });
  const readme = entries.find((e) => e.name.startsWith('README'))!.content;

  it('puts the masters first, then one transactions file per year, then the guide', () => {
    expect(entries.map((e) => e.name)).toEqual([
      '1 - Masters.xml',
      '2 - Transactions FY2023-24.xml',
      '3 - Transactions FY2024-25.xml',
      'README - How to import into Tally.txt',
    ]);
    expect(entries[0]!.content).toContain('<ID>All Masters</ID>');
    expect(entries[1]!.content).toContain('<ID>Vouchers</ID>');
    expect(entries[1]!.content).toContain('<DATE>20230601</DATE>');
    expect(entries[1]!.content).not.toContain('<DATE>20240601</DATE>');
  });

  it('tells the user the books-beginning date and the order to import in', () => {
    expect(readme).toContain('Books beginning from: 1-Apr-2023');
    expect(readme).toMatch(/1 - Masters\.xml[\s\S]*2 - Transactions FY2023-24\.xml[\s\S]*3 - Transactions FY2024-25\.xml/);
    expect(readme).toContain('Unallocated Funds');
  });

  it('lists every warning in the guide', () => {
    expect(readme).toContain('Axis Bluechip Fund');
  });

  it('refuses to produce import files for a book that breaks a Tally rule', () => {
    const broken: TallyBook = {
      ...book,
      ledgers: [...book.ledgers, { name: 'Investments', parent: 'Suspense A/c', openingBalance: new Decimal(0), isCashOrBank: false }],
    };
    expect(() => tallyZipEntries(broken)).toThrow(TallyExportBlockedError);
    try {
      tallyZipEntries(broken);
    } catch (err) {
      expect((err as TallyExportBlockedError).problems.join()).toMatch(/Investments/);
    }
  });
});
