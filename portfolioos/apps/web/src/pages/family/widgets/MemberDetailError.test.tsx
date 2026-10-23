// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemberDetailError } from './MemberDetailError';

afterEach(cleanup);

function refusal(status: number, message: string) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { success: false, error: message, code: 'FORBIDDEN' },
  });
}

function renderError(error: unknown) {
  return render(
    <MemoryRouter>
      <MemberDetailError error={error} />
    </MemoryRouter>,
  );
}

/** The page used to blame permissions for every failure, plan refusals included. */
describe('a member page that could not load', () => {
  it('shows a plan refusal as a plan lock, with the way to upgrade', () => {
    renderError(refusal(403, 'This feature requires the FAMILY plan or higher'));
    expect(screen.getByText('Member view is locked')).toBeTruthy();
    expect(screen.getByText(/requires the FAMILY plan/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View plans' }).getAttribute('href')).toBe('/pricing');
    expect(screen.queryByText(/no longer have permission/)).toBeNull();
  });

  it('shows any other refusal in the server’s words', () => {
    renderError(refusal(403, 'You are not a member of this family'));
    expect(screen.getByText('You are not a member of this family')).toBeTruthy();
    expect(screen.queryByText('Member view is locked')).toBeNull();
  });
});
