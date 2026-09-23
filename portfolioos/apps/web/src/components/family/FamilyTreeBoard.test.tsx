// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FamilyTreeBoard } from './FamilyTreeBoard';
import type { FamilyMemberRow } from '@/api/families.api';

/**
 * The board around the layout: what a family sees on the tree, and what
 * happens when they tap somebody on it.
 */

const saveTreeLayout = vi.fn(async () => ({}));
vi.mock('@/api/families.api', () => ({
  familiesApi: {
    getTreeLayout: async () => ({
      parents: { harish: null, rajesh: 'harish', kavya: 'rajesh' },
      partners: [['harish', 'kusum']],
    }),
    saveTreeLayout: (...args: unknown[]) => saveTreeLayout(...(args as [])),
  },
}));

afterEach(() => {
  cleanup();
  saveTreeLayout.mockClear();
});

let joined = 0;
function member(userId: string, name: string, extra: Partial<FamilyMemberRow> = {}): FamilyMemberRow {
  joined += 1;
  return {
    id: `m-${userId}`,
    userId,
    name,
    email: null,
    managed: true,
    managedBy: null,
    contactEmail: null,
    relation: null,
    relatedTo: null,
    role: 'CONTRIBUTOR',
    status: 'ACTIVE',
    visibleAssetClasses: [],
    visibleCategories: [],
    joinedAt: `2026-01-01T00:00:${String(joined).padStart(2, '0')}.000Z`,
    invitedById: null,
    ...extra,
  } as FamilyMemberRow;
}

const members = [
  member('harish', 'Harish Shah', { role: 'OWNER' }),
  member('kusum', 'Kusum Shah', { relation: 'Wife', relatedTo: { id: 'harish', name: 'Harish Shah' } }),
  member('rajesh', 'Rajesh Shah', { relation: 'Son', relatedTo: { id: 'harish', name: 'Harish Shah' } }),
  member('kavya', 'Kavya Shah', { relation: 'Daughter', relatedTo: { id: 'rajesh', name: 'Rajesh Shah' } }),
];

function renderBoard(props: Partial<React.ComponentProps<typeof FamilyTreeBoard>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FamilyTreeBoard
        familyId="fam1"
        members={members}
        currentUserId="harish"
        isOwner
        onEdit={() => {}}
        onRevoke={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
}

const findTree = async () => screen.findByText('Harish & Kusum');

describe('the family tree board', () => {
  it('draws a couple as one place and everyone else in their generation', async () => {
    renderBoard();
    await findTree();
    // One pill for the couple, not two.
    expect(screen.queryByText('Harish Shah')).toBeNull();
    expect(screen.getByText('Rajesh Shah')).toBeTruthy();
    expect(screen.getByText('Kavya Shah')).toBeTruthy();
  });

  it('draws a line from each place to the one below it', async () => {
    const { container } = renderBoard();
    await findTree();
    // Harish & Kusum → Rajesh → Kavya.
    expect(container.querySelectorAll('[data-tree-edge]')).toHaveLength(2);
  });

  it('opens a card on the person you tap, with what you can do to them', async () => {
    const onEdit = vi.fn();
    renderBoard({ onEdit });
    fireEvent.click(await findTree());
    expect(screen.getByText('Focus here')).toBeTruthy();
    // A couple offers each of them; the card acts on whoever is chosen.
    fireEvent.click(screen.getByRole('button', { name: 'Kusum' }));
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'kusum' }));
  });

  it('adds a relative against the person tapped, which is what puts them in the right place', async () => {
    const onAddRelative = vi.fn();
    renderBoard({ onAddRelative });
    fireEvent.click(await screen.findByText('Rajesh Shah'));
    fireEvent.click(screen.getByText('Add a relative'));
    expect(onAddRelative).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rajesh' }));
  });

  it('moves a whole couple when one of them is placed under someone else', async () => {
    renderBoard();
    fireEvent.click(await findTree());
    const select = screen.getByLabelText('Move Harish Shah under someone') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'rajesh' } });
    await waitFor(() => expect(saveTreeLayout).toHaveBeenCalled());
    expect(saveTreeLayout).toHaveBeenCalledWith(
      'fam1',
      expect.objectContaining({
        // Harish goes under Rajesh; Kusum stands with Harish rather than
        // being left behind at the top.
        parents: expect.objectContaining({ harish: 'rajesh', kusum: null }),
      }),
    );
  });

  it('offers their books only to whoever keeps them', async () => {
    const onManage = vi.fn();
    const kept = members.map((m) =>
      m.userId === 'kavya' ? { ...m, managedBy: { id: 'harish', name: 'Harish Shah' } } : m,
    );
    const { container } = renderBoard({ members: kept, onManage });
    const pill = (name: string) =>
      [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(name))!;
    fireEvent.click(await screen.findByText('Rajesh Shah'));
    expect(screen.queryByText('Their books')).toBeNull();
    fireEvent.click(pill('Kavya Shah'));
    fireEvent.click(screen.getByText('Their books'));
    expect(onManage).toHaveBeenCalledWith(expect.objectContaining({ userId: 'kavya' }));
  });

  it('says so rather than drawing nothing when the family is empty', async () => {
    renderBoard({ members: [] });
    expect(await screen.findByText(/Nobody on the tree yet/)).toBeTruthy();
  });
});
