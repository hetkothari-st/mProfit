import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { apiErrorMessage, decodeBlobError } from './client';

function blobError(body: string, type: string) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed with status code 404', 'ERR_BAD_REQUEST', config, null, {
    status: 404,
    statusText: 'Not Found',
    headers: {},
    config,
    data: new Blob([body], { type }),
  });
}

describe('decodeBlobError', () => {
  it("surfaces the server's message from a blob error body", async () => {
    const err = await decodeBlobError(
      blobError(JSON.stringify({ error: 'This file is no longer stored on the server. Please upload it again.' }), 'application/json'),
    );
    expect(apiErrorMessage(err)).toMatch(/no longer stored/);
  });

  it('leaves a non-JSON blob error alone', async () => {
    const err = await decodeBlobError(blobError('<html>', 'text/html'));
    expect(apiErrorMessage(err)).toMatch(/status code 404/);
  });
});
