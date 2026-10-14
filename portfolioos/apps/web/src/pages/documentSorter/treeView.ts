import { DOC_TYPE_LABEL, type SorterFileDTO, type SorterTreeDTO } from '@everypaisa/shared';

/** Pure helpers for the Documents sorter page. */

function allFiles(tree: SorterTreeDTO): SorterFileDTO[] {
  return [...tree.people.flatMap((p) => p.types.flatMap((t) => t.files)), ...tree.unassigned];
}

export function countProcessing(tree: SorterTreeDTO): number {
  return allFiles(tree).filter((f) => f.sortStatus === 'PROCESSING').length;
}

export function findFile(tree: SorterTreeDTO, id: string): { file: SorterFileDTO; personName: string | null } | null {
  for (const p of tree.people) {
    for (const t of p.types) {
      const file = t.files.find((f) => f.id === id);
      if (file) return { file, personName: p.displayName };
    }
  }
  const file = tree.unassigned.find((f) => f.id === id);
  return file ? { file, personName: null } : null;
}

export function fileProgressLabel(f: SorterFileDTO, personName: string | null): string {
  switch (f.sortStatus) {
    case 'PROCESSING':
      return 'Reading…';
    case 'NEEDS_PASSWORD':
      return 'Needs a password';
    case 'FAILED':
      return 'Could not be read';
    case 'NEEDS_REVIEW':
      return f.sortReason ? `Needs review — ${f.sortReason}` : 'Needs review';
    case 'FILED':
      return `Filed into ${personName ?? 'Unassigned'} / ${f.docType ? DOC_TYPE_LABEL[f.docType] : 'Other'}`;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
