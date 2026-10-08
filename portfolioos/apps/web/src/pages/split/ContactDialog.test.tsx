// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { ContactDialog } from './ContactDialog';

vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: { createContact: vi.fn() } }));
afterEach(() => cleanup());

describe('ContactDialog', () => {
  it('does not promise linking that does not exist yet', () => {
    renderWithProviders(<ContactDialog open onOpenChange={() => {}} />);
    expect(screen.getByText('Optional — used later to invite them.')).toBeTruthy();
    expect(screen.queryByText(/they’ll see your shared groups/)).toBeNull();
  });
});
