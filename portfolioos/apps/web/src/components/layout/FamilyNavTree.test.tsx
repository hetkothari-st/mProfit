// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FamilyNavTree } from './FamilyNavTree';

vi.mock('@/api/family/families.api', () => ({
  familiesApi: {
    list: async () => [
      { id: 'fam-a', name: 'Shahs', role: 'OWNER', description: null, seats: null },
      { id: 'fam-b', name: 'Mehtas', role: 'VIEWER', description: null, seats: null },
    ],
    members: async () => [],
  },
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderAt(url: string, collapsed = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <FamilyNavTree collapsed={collapsed} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Every family row used to link to bare /family, which opens the first family. */
describe('sidebar family rows', () => {
  it('each row opens its own family', async () => {
    renderAt('/dashboard');
    const mehtas = await screen.findByTitle('Mehtas');
    expect(mehtas.getAttribute('href')).toBe('/family?family=fam-b');
    expect(screen.getByTitle('Shahs').getAttribute('href')).toBe('/family?family=fam-a');
  });

  it('marks only the family on screen as current', async () => {
    renderAt('/family?family=fam-b');
    expect((await screen.findByTitle('Mehtas')).getAttribute('aria-current')).toBe('page');
    expect(screen.getByTitle('Shahs').getAttribute('aria-current')).toBeNull();
  });

  it('treats bare /family as the first family, in the icon rail too', async () => {
    renderAt('/family', true);
    expect((await screen.findByTitle('Shahs')).getAttribute('aria-current')).toBe('page');
    expect(screen.getByTitle('Mehtas').getAttribute('href')).toBe('/family?family=fam-b');
  });
});
