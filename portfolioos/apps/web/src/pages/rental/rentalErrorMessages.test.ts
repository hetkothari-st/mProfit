import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AxiosError, AxiosHeaders } from 'axios';
import { apiErrorMessage } from '@/api/client';

/**
 * REGRESSION: rental dialogs showed axios's own text ("Request failed with
 * status code 409") instead of the server's message, because they rendered
 * `err instanceof Error ? err.message : …`. An AxiosError IS an Error, so
 * that branch always won and the response body was never read.
 */
describe('rental pages surface the server message', () => {
  const dir = __dirname;
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'));

  it.each(files)('%s does not render raw Error.message', (file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    expect(src).not.toMatch(/instanceof Error \? \w+(\.error)?\.message/);
  });

  it('apiErrorMessage reads the server message off an axios error', () => {
    const err = new AxiosError('Request failed with status code 409', '409', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      data: { success: false, error: 'This property still has 1 tenancy in Rentals.' },
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
    expect(err instanceof Error ? err.message : '').toBe('Request failed with status code 409');
    expect(apiErrorMessage(err, 'x')).toBe('This property still has 1 tenancy in Rentals.');
  });
});
