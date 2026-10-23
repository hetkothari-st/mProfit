// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ImportJobDTO } from '@everypaisa/shared';
import { ImportErrorDialog } from './ImportErrorDialog';
import { importIssueLabel } from './importIssues';

afterEach(cleanup);

const job = (over: Partial<ImportJobDTO>): ImportJobDTO => ({
  id: 'j1',
  userId: 'u1',
  portfolioId: null,
  type: 'MF_CAS_PDF',
  status: 'FAILED',
  fileName: 'cas.pdf',
  filePath: '',
  broker: null,
  totalRows: null,
  successRows: null,
  failedRows: null,
  errorLog: null,
  contentHash: null,
  gmailMessageId: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  completedAt: null,
  ...over,
});

describe('import failures from the worker are visible', () => {
  const crashed = job({ errorLog: { workerError: 'Job timed out after 300000ms', timedOut: true } });
  const orphaned = job({
    errorLog: { workerError: 'Import was interrupted. Please upload the file again.', orphaned: true },
  });

  it('offers the Errors button for a worker/orphan failure with no row errors', () => {
    expect(importIssueLabel(crashed)).toBe('Errors');
    expect(importIssueLabel(orphaned)).toBe('Errors');
    expect(importIssueLabel(job({ errorLog: { general: 'No portfolio selected' } }))).toBe('Errors');
  });

  it('keeps the old rules for row errors, warnings and clean jobs', () => {
    expect(importIssueLabel(job({ failedRows: 2 }))).toBe('Errors');
    expect(importIssueLabel(job({ status: 'COMPLETED', errorLog: { parserWarnings: ['x'] } }))).toBe('Warnings');
    expect(importIssueLabel(job({ status: 'COMPLETED', errorLog: {} }))).toBeNull();
  });

  it('shows the worker error text in the dialog', () => {
    render(<ImportErrorDialog job={orphaned} onClose={() => {}} />);
    expect(screen.getByText('Import was interrupted. Please upload the file again.')).toBeTruthy();
  });

  it('explains a timeout in plain words', () => {
    render(<ImportErrorDialog job={crashed} onClose={() => {}} />);
    expect(screen.getByText(/took too long/i)).toBeTruthy();
  });
});
