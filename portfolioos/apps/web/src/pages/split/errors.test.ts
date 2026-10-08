import { describe, it, expect } from 'vitest';
import { splitErrorMessage } from './errors';

const axiosErr = (error: string) => ({ isAxiosError: true, message: 'Request failed', response: { status: 409, data: { success: false, error } } });

describe('splitErrorMessage', () => {
  it('strips the SPLIT_ code and capitalises', () => {
    expect(splitErrorMessage(axiosErr('SPLIT_MEMBER_HAS_BALANCE: settle this member to zero first'), 'x')).toBe('Settle this member to zero first');
  });
  it('leaves plain messages alone apart from capitalising', () => {
    expect(splitErrorMessage(axiosErr('already there'), 'x')).toBe('Already there');
  });
  it('uses the fallback when there is nothing to read', () => {
    expect(splitErrorMessage({}, 'Could not save')).toBe('Could not save');
  });
});
