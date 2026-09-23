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
function member(
  userId: string,
  name: string,
  extra: Partial<FamilyMemberRow> = {},
): FamilyMemberRow {
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
  member('kusum', 'Kusum Shah', {
    relation: 'Wife',
    relatedTo: { id: 'harish', name: 'Harish Shah' },
  }),
  member('rajesh', 'Rajesh Shah', {
    relation: 'Son',
    relatedTo: { id: 'harish', name: 'Harish Shah' },
  }),
  member('kavya', 'Kavya Shah', {
    relation: 'Daughter',
    relatedTo: { id: 'rajesh', name: 'Rajesh Shah' },
  }),
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

const pill = (name: string) => screen.findByRole('button', { name: new RegExp(name) });

describe('the family tree board', () => {
  it('gives everyone their own pill, a couple sharing one row', async () => {
    renderBoard();
    expect(await pill('Harish Shah')).toBeTruthy();
    expect(await pill('Kusum Shah')).toBeTruthy();
    expect(await pill('Kavya Shah')).toBeTruthy();
  });

  it('writes the relation on the line that connects them', async () => {
    renderBoard();
    await pill('Harish Shah');
    // "son" from Harish to Rajesh, "daughter" from Rajesh to Kavya…
    expect(screen.getByText('son')).toBeTruthy();
    expect(screen.getByText('daughter')).toBeTruthy();
    // …and "wife" on the dashed line between the couple.
    expect(screen.getByText('wife')).toBeTruthy();
  });

  it('drops a rail under a parent and runs a line across to each child', async () => {
    const { container } = renderBoard();
    await pill('Harish Shah');
    expect(container.querySelectorAll('[data-tree-rail]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-tree-edge]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-tree-spouse]')).toHaveLength(1);
  });

  it('opens a card on the person you tap, not on their spouse', async () => {
    const onEdit = vi.fn();
    renderBoard({ onEdit });
    fireEvent.click(await pill('Kusum Shah'));
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'kusum' }));
  });

  it('adds a relative against the person tapped, which is what places them', async () => {
    const onAddRelative = vi.fn();
    renderBoard({ onAddRelative });
    fireEvent.click(await pill('Rajesh Shah'));
    fireEvent.click(screen.getByText('Add a relative'));
    expect(onAddRelative).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rajesh' }));
  });

  it('moves a whole couple when one of them is placed under someone else', async () => {
    renderBoard();
    fireEvent.click(await pill('Harish Shah'));
    fireEvent.change(screen.getByLabelText('Move Harish Shah under someone'), {
      target: { value: 'rajesh' },
    });
    await waitFor(() => expect(saveTreeLayout).toHaveBeenCalled());
    expect(saveTreeLayout).toHaveBeenCalledWith(
      'fam1',
      expect.objectContaining({
        // Harish goes under Rajesh; Kusum stands with him rather than being
        // left behind at the top.
        parents: expect.objectContaining({ harish: 'rajesh', kusum: null }),
      }),
    );
  });

  it('offers their books only to whoever keeps them', async () => {
    const onManage = vi.fn();
    const kept = members.map((m) =>
      m.userId === 'kavya' ? { ...m, managedBy: { id: 'harish', name: 'Harish Shah' } } : m,
    );
    renderBoard({ members: kept, onManage });
    fireEvent.click(await pill('Rajesh Shah'));
    expect(screen.queryByText('Their books')).toBeNull();
    fireEvent.click(await pill('Kavya Shah'));
    fireEvent.click(screen.getByText('Their books'));
    expect(onManage).toHaveBeenCalledWith(expect.objectContaining({ userId: 'kavya' }));
  });

  it('says so rather than drawing nothing when the family is empty', async () => {
    renderBoard({ members: [] });
    expect(await screen.findByText(/Nobody on the tree yet/)).toBeTruthy();
  });
});
