// @vitest-environment jsdom
/**
 * Axios defaults to timeout 0 (wait forever), so a stalled request left its
 * screen loading indefinitely.
 */
import { describe, it, expect } from 'vitest';
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { api, applyTransferTimeout, DEFAULT_TIMEOUT_MS, TRANSFER_TIMEOUT_MS } from './client';

const cfg = (over: Partial<InternalAxiosRequestConfig>): InternalAxiosRequestConfig => ({
  headers: new AxiosHeaders(),
  timeout: DEFAULT_TIMEOUT_MS,
  ...over,
});

describe('api client timeouts', () => {
  it('has a finite default', () => {
    expect(api.defaults.timeout).toBe(DEFAULT_TIMEOUT_MS);
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('gives uploads and downloads the longer transfer budget', () => {
    expect(applyTransferTimeout(cfg({ data: new FormData() })).timeout).toBe(TRANSFER_TIMEOUT_MS);
    expect(applyTransferTimeout(cfg({ responseType: 'blob' })).timeout).toBe(TRANSFER_TIMEOUT_MS);
  });

  it('keeps an explicit per-call timeout and leaves JSON calls alone', () => {
    expect(applyTransferTimeout(cfg({ data: new FormData(), timeout: 90_000 })).timeout).toBe(90_000);
    expect(applyTransferTimeout(cfg({ data: { a: 1 } })).timeout).toBe(DEFAULT_TIMEOUT_MS);
  });
});
