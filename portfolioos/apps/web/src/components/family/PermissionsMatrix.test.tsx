// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { NonAcCategory } from '@/api/family/families.api';
import { allVisibility } from '@/lib/familyVisibility';
import { PermissionsMatrix } from './PermissionsMatrix';

afterEach(cleanup);

function Harness({ start }: { start: { visibleAssetClasses: string[]; visibleCategories: NonAcCategory[] } }) {
  const [ac, setAc] = useState(start.visibleAssetClasses);
  const [cat, setCat] = useState(start.visibleCategories);
  return (
    <PermissionsMatrix
      visibleAssetClasses={ac}
      setVisibleAssetClasses={setAc}
      visibleCategories={cat}
      setVisibleCategories={setCat}
      disabled={false}
    />
  );
}

/**
 * The server treats an empty list as deny-all; the form used to say
 * "Empty = no restriction" and start empty, so default invitees saw nothing.
 */
describe('visibility settings', () => {
  it('starts an invite with everything ticked', () => {
    render(<Harness start={allVisibility()} />);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('never claims that empty means unrestricted, and warns when nothing is ticked', () => {
    render(<Harness start={allVisibility()} />);
    fireEvent.click(screen.getByLabelText('Untick all asset classes'));
    fireEvent.click(screen.getByLabelText('Untick all categories'));
    expect(screen.getByRole('alert').textContent).toMatch(/see none of the other members/);
    expect(document.body.textContent).not.toMatch(/no restriction/i);
  });

  it('offers All and None for each list', () => {
    render(<Harness start={{ visibleAssetClasses: [], visibleCategories: [] }} />);
    fireEvent.click(screen.getByLabelText('Tick all asset classes'));
    fireEvent.click(screen.getByLabelText('Tick all categories'));
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.every((b) => b.checked)).toBe(true);
  });
});
