export type WillStepSlug = 'overview' | 'details' | 'people' | 'estate' | 'allocation' | 'instructions' | 'review' | 'preview';

export const WILL_STEPS: ReadonlyArray<{ n: number; slug: WillStepSlug; label: string }> = [
  { n: 1, slug: 'overview', label: 'Overview' },
  { n: 2, slug: 'details', label: 'Your details' },
  { n: 3, slug: 'people', label: 'People & roles' },
  { n: 4, slug: 'estate', label: 'Assets & liabilities' },
  { n: 5, slug: 'allocation', label: 'Allocate' },
  { n: 6, slug: 'instructions', label: 'Instructions' },
  { n: 7, slug: 'review', label: 'Review' },
  { n: 8, slug: 'preview', label: 'Preview' },
];

export function stepBySlug(slug: string) {
  return WILL_STEPS.find((s) => s.slug === slug);
}

/** Step 1 is the overview page; an unknown step resumes at Your details. */
export function willStepPath(id: string, n: number): string {
  if (n <= 1) return '/will';
  const step = WILL_STEPS.find((s) => s.n === n) ?? WILL_STEPS[1]!;
  return `/will/${encodeURIComponent(id)}/${step.slug}`;
}
