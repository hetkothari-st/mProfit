import { describe, it, expect } from 'vitest';
import type { SorterFileDTO, SorterTreeDTO } from '@everypaisa/shared';
import { countProcessing, fileProgressLabel, findFile, formatBytes } from './treeView';

const f = (over: Partial<SorterFileDTO>): SorterFileDTO => ({
  id: '1',
  fileName: 'x.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1,
  docType: null,
  docDate: null,
  sortStatus: 'PROCESSING',
  sortReason: null,
  personId: null,
  createdAt: '2026-10-14T00:00:00Z',
  ...over,
});

const tree: SorterTreeDTO = {
  people: [
    {
      id: 'p',
      displayName: 'Rahul Sharma',
      autoCreated: true,
      linkedUserId: null,
      types: [{ docType: 'BANK_STATEMENT', files: [f({ id: 'a', sortStatus: 'FILED', docType: 'BANK_STATEMENT', personId: 'p' })] }],
    },
  ],
  unassigned: [f({ id: 'b' }), f({ id: 'c' })],
};

describe('treeView', () => {
  it('counts files still processing across people and unassigned', () => {
    expect(countProcessing(tree)).toBe(2);
  });

  it('labels each state in plain words', () => {
    expect(fileProgressLabel(f({}), null)).toBe('Reading…');
    expect(fileProgressLabel(f({ sortStatus: 'FILED', docType: 'BANK_STATEMENT' }), 'Rahul')).toBe('Filed into Rahul / Bank Statement');
    expect(fileProgressLabel(f({ sortStatus: 'NEEDS_PASSWORD' }), null)).toBe('Needs a password');
    expect(fileProgressLabel(f({ sortStatus: 'NEEDS_REVIEW', sortReason: 'No name found' }), null)).toBe('Needs review — No name found');
    expect(fileProgressLabel(f({ sortStatus: 'FAILED' }), null)).toBe('Could not be read');
  });

  it('finds a file and its person anywhere in the tree', () => {
    expect(findFile(tree, 'a')).toMatchObject({ personName: 'Rahul Sharma', file: { id: 'a' } });
    expect(findFile(tree, 'b')).toMatchObject({ personName: null, file: { id: 'b' } });
    expect(findFile(tree, 'zzz')).toBeNull();
  });

  it('formats sizes for humans', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
