import { describe, it, expect } from 'vitest';
import type { ImportJobDTO } from '@everypaisa/shared';
import { importHeadline, importIssueLabel, importSkippedCount, importTypeLabel } from './importIssues';

const job = (over: Partial<ImportJobDTO> = {}): ImportJobDTO =>
  ({
    id: 'j1', status: 'COMPLETED', fileName: 'a.pdf', totalRows: 5, successRows: 5, failedRows: 0, errorLog: null, ...over,
  }) as unknown as ImportJobDTO;

describe('importSkippedCount / importIssueLabel', () => {
  it('counts rows skipped as duplicates', () => {
    expect(importSkippedCount(job())).toBe(0);
    expect(importSkippedCount(job({ errorLog: { skippedAsDuplicates: 5 } }))).toBe(5);
  });

  it('offers Details for a clean import that only skipped duplicates, so "5 rows, 0 imported" can be explained', () => {
    expect(importIssueLabel(job({ successRows: 0, errorLog: { skippedAsDuplicates: 5 } }))).toBe('Details');
    expect(importIssueLabel(job())).toBeNull();
  });

  it('still ranks errors above warnings above details', () => {
    expect(importIssueLabel(job({ failedRows: 1, errorLog: { skippedAsDuplicates: 2 } }))).toBe('Errors');
    expect(importIssueLabel(job({ errorLog: { parserWarnings: ['w'], skippedAsDuplicates: 2 } }))).toBe('Warnings');
  });
});

describe('importHeadline', () => {
  it('says nothing for a clean import that added rows', () => {
    expect(importHeadline(job())).toBeNull();
    expect(importHeadline(job({ errorLog: { skippedAsDuplicates: 2 } }))).toBeNull();
  });

  it('explains a re-upload where every row was already imported', () => {
    const j = job({ totalRows: 5, successRows: 0, errorLog: { skippedAsDuplicates: 5 } });
    expect(importHeadline(j)).toBe('All 5 rows were already imported');
  });

  it('shows the reason a file failed outright', () => {
    expect(importHeadline(job({ status: 'FAILED', totalRows: 0, successRows: 0, errorLog: { parserWarnings: ['No transactions found in this PDF'] } })))
      .toBe('No transactions found in this PDF');
    expect(importHeadline(job({ status: 'FAILED', errorLog: { workerError: 'boom' } }))).toBe('boom');
    expect(importHeadline(job({ status: 'FAILED', errorLog: { workerError: 'x', timedOut: true } }))).toBe('Took too long and was stopped');
  });

  it('shows the first row error, clipped to one line', () => {
    const long = 'Row failed because '.repeat(10);
    const h = importHeadline(job({ status: 'COMPLETED_WITH_ERRORS', failedRows: 2, errorLog: { rowErrors: [{ row: 3, reason: long }] } }))!;
    expect(h.length).toBeLessThanOrEqual(90);
    expect(h.endsWith('…')).toBe(true);
  });

  it('does not repeat a warning on a job that did import rows', () => {
    expect(importHeadline(job({ errorLog: { parserWarnings: ['Some pages were skipped'] } }))).toBeNull();
  });
});

describe('importTypeLabel', () => {
  it('names depository statements for what they are, not "MF CAS"', () => {
    expect(importTypeLabel('MF_CAS_PDF', 'NSDL_Statement_Oct2026.pdf')).toBe('Depository statement (PDF)');
    expect(importTypeLabel('MF_CAS_PDF', 'CDSL_TXN.pdf')).toBe('Depository statement (PDF)');
    expect(importTypeLabel('MF_CAS_PDF', 'transaction-with-holding-statement.pdf')).toBe('Depository statement (PDF)');
  });
  it('keeps real fund statements as CAS, and other types as before', () => {
    expect(importTypeLabel('MF_CAS_PDF', 'CAS_Oct2026.pdf')).toBe('Mutual fund CAS (PDF)');
    expect(importTypeLabel('MF_CAS_EXCEL', 'cas.xlsx')).toBe('Mutual fund CAS (Excel)');
    expect(importTypeLabel('CONTRACT_NOTE_PDF', 'x.pdf')).toBe('Contract Note PDF');
    expect(importTypeLabel('MF_CAS_PDF', null)).toBe('Mutual fund CAS (PDF)');
  });
});
