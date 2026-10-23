// @vitest-environment jsdom
/**
 * A failed preview (e.g. a 403 from a gate) used to leave the composer on
 * "Preparing the email…" for good. It now says what went wrong.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InviteEmailComposer } from './InviteEmailComposer';
import { accountHolderInviteSource } from './inviteEmailSources';

afterEach(cleanup);

describe('InviteEmailComposer', () => {
  it('shows the error instead of spinning forever when the preview fails', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <InviteEmailComposer
          source={{
            key: ['test-invite-fail'],
            preview: () => Promise.reject(new Error('Turn on two-factor sign-in')),
            send: () => Promise.reject(new Error('unused')),
          }}
          onDone={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Try again/)).toBeTruthy();
    expect(screen.queryByText(/Preparing the email/)).toBeNull();
  });

  it("the account holder's source uses their own endpoints, not the CA workspace's", () => {
    expect(accountHolderInviteSource('c1').key).toEqual(['me', 'professional-invite-email', 'c1']);
  });
});
