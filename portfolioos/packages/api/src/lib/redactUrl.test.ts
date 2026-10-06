import { describe, it, expect } from 'vitest';
import { redactUrl } from './redactUrl.js';

describe('redactUrl', () => {
  it('hides invite and claim tokens in the path', () => {
    expect(redactUrl('/api/families/claims/abc123XYZ')).toBe('/api/families/claims/[redacted]');
    expect(redactUrl('/api/families/invitations/tok/peek')).toBe('/api/families/invitations/[redacted]/peek');
    expect(redactUrl('/api/professional-invitations/tok/accept')).toBe(
      '/api/professional-invitations/[redacted]/accept',
    );
  });

  it('hides credential query parameters and keeps the rest', () => {
    expect(redactUrl('/api/fo/brokers/kite/callback?code=SECRET&status=success')).toBe(
      '/api/fo/brokers/kite/callback?code=[redacted]&status=success',
    );
    expect(redactUrl('/api/documents/d1/oo-download?token=jwt.x.y')).toBe('/api/documents/d1/oo-download?token=[redacted]');
  });

  it('leaves ordinary URLs alone', () => {
    expect(redactUrl('/api/portfolios/p1/holdings?page=2')).toBe('/api/portfolios/p1/holdings?page=2');
  });
});
