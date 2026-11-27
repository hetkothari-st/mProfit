// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({
  notes: vi.fn(),
  addNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  tasks: vi.fn(),
  addTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));
vi.mock('@/api/caPractice.api', () => ({ caPracticeApi: api }));

import { ClientNotesTasksTab } from './ClientNotesTasksTab';

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset().mockResolvedValue(undefined);
  api.notes.mockResolvedValue([
    { id: 'n1', clientId: 'c1', body: 'Has a second house in Pune.', pinned: true, createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z' },
  ]);
  api.tasks.mockResolvedValue([
    { id: 't1', clientId: 'c1', title: 'Collect Form 16', dueDate: '2026-06-15T00:00:00.000Z', status: 'OPEN', doneAt: null, createdAt: '2026-11-20T10:00:00Z' },
  ]);
});
afterEach(() => cleanup());

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ClientNotesTasksTab clientId="c1" />
    </QueryClientProvider>,
  );
}

describe('ClientNotesTasksTab', () => {
  it('says the notes are private to the practice', async () => {
    renderTab();
    expect(await screen.findByText(/only you can see these/i)).toBeTruthy();
    expect(await screen.findByText('Has a second house in Pune.')).toBeTruthy();
    expect(await screen.findByText('Collect Form 16')).toBeTruthy();
  });

  it('adds a note', async () => {
    renderTab();
    fireEvent.change(await screen.findByRole('textbox', { name: /new note/i }), { target: { value: 'Prefers WhatsApp' } });
    fireEvent.click(screen.getByRole('button', { name: /add note/i }));
    await waitFor(() => expect(api.addNote).toHaveBeenCalledWith('c1', 'Prefers WhatsApp'));
  });

  it('adds a task with a due date and ticks one off', async () => {
    renderTab();
    fireEvent.change(await screen.findByRole('textbox', { name: /new task/i }), { target: { value: 'File ITR' } });
    fireEvent.change(screen.getByLabelText(/task due date/i), { target: { value: '2026-07-20' } });
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    await waitFor(() => expect(api.addTask).toHaveBeenCalledWith('c1', { title: 'File ITR', dueDate: '2026-07-20' }));

    fireEvent.click(screen.getByRole('checkbox', { name: /collect form 16/i }));
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith('c1', 't1', { status: 'DONE' }));
  });
});
