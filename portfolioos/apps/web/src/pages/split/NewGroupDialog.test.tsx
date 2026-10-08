// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { NewGroupDialog } from './NewGroupDialog';

const api = vi.hoisted(() => ({ listContacts: vi.fn(), createGroup: vi.fn(), createContact: vi.fn() }));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { name: 'Alice Rao' } }) }));
vi.mock('@/stores/actingAs.store', () => ({
  useActingAsStore: (sel: (s: unknown) => unknown) => sel({ profile: { id: 'p1', name: 'Dadaji', managerId: 'u1' } }),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('NewGroupDialog while acting as a managed profile', () => {
  it('names the group creator after the managed profile', async () => {
    api.listContacts.mockResolvedValue([]);
    api.createGroup.mockResolvedValue({ id: 'g9' });
    renderWithProviders(<NewGroupDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Flat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(api.createGroup).toHaveBeenCalledWith(expect.objectContaining({ myDisplayName: 'Dadaji' })));
  });
});
