// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { runWillRules, type WillPayload } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { willApi } from '@/api/will.api';
import { PeopleStep } from './PeopleStep';
import type { WillStepProps } from './types';
import { fullPayload, person, TODAY } from '../willTestData';

vi.mock('@/api/will.api', () => ({ willApi: { suggestions: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(willApi.suggestions).mockResolvedValue([
    { userId: 'fam-1', name: 'Meera Rao', relation: 'Daughter', relationship: 'DAUGHTER', dob: '2015-04-01' },
  ]);
});
afterEach(cleanup);

function setup(payload: WillPayload = fullPayload()) {
  const update = vi.fn();
  const p: WillStepProps = {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide: true, update,
    refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 0, goTo: vi.fn(),
  };
  renderWithProviders(<PeopleStep {...p} />);
  return update;
}

describe('PeopleStep', () => {
  it('adds a person from the family quick-pick', async () => {
    const update = setup();
    fireEvent.click(await screen.findByRole('button', { name: /add meera rao/i }));
    const [section, data] = update.mock.calls[0]!;
    expect(section).toBe('people');
    expect(data.people.at(-1)).toMatchObject({ name: 'Meera Rao', relationship: 'DAUGHTER', dob: '2015-04-01', sourceFamilyMemberId: 'fam-1' });
  });

  it('adds a person with the form, and refuses an empty name', () => {
    const update = setup();
    fireEvent.click(screen.getByRole('button', { name: /add a person/i }));
    fireEvent.click(screen.getByRole('button', { name: /save person/i }));
    expect(screen.getByText(/enter a name/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Kavya Iyer' } });
    fireEvent.change(screen.getByLabelText(/relationship/i), { target: { value: 'NIECE' } });
    fireEvent.click(screen.getByRole('button', { name: /save person/i }));
    expect(update.mock.calls[0]![1].people.at(-1)).toMatchObject({ name: 'Kavya Iyer', relationship: 'NIECE', partyType: 'INDIVIDUAL' });
  });

  it('removing a person also clears their roles and shares', () => {
    const update = setup();
    const card = screen.getByTestId('person-p-spouse');
    fireEvent.click(within(card).getByRole('button', { name: /remove/i }));
    const people = update.mock.calls.find((c) => c[0] === 'people')![1];
    expect(people.roles.executorId).toBeNull();
    const allocation = update.mock.calls.find((c) => c[0] === 'allocation')![1];
    expect(allocation.residuary).toEqual([{ personId: 'p-son', sharePct: '40' }]);
  });

  it('picks an executor among adult individuals only', () => {
    const update = setup();
    fireEvent.click(screen.getByRole('tab', { name: /executor/i }));
    const select = screen.getByLabelText(/^executor$/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).not.toContain('Pune Animal Trust');
    fireEvent.change(select, { target: { value: 'p-son' } });
    expect(update.mock.calls[0]![1].roles.executorId).toBe('p-son');
  });

  it('says a guardian is not needed without minor children, and asks for one with them', async () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: /guardian/i }));
    expect(screen.getByText(/no children under 18/i)).toBeTruthy();
    cleanup();
    const p = fullPayload();
    p.people.push(person({ id: 'kid', name: 'Meera', relationship: 'DAUGHTER', dob: '2016-01-01' }));
    setup(p);
    fireEvent.click(screen.getByRole('tab', { name: /guardian/i }));
    await waitFor(() => expect(screen.getByLabelText(/^guardian$/i)).toBeTruthy());
  });
});
