import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';
import { fakeResponse } from '../helpers/fakeResponse.js';

// The web reset dialog sent no `source`; the server defaulted to EXTENSION and
// queued nothing, and the extension has no consumer for reset sessions — so the
// reset never started. Default is now the headless worker, and an explicit
// EXTENSION request is refused up front instead of hanging.

const queueAdd = vi.fn();
vi.mock('../../src/jobs/pfFetchWorker.js', () => ({ pfFetchQueue: { add: queueAdd } }));
const startPasswordReset = vi.fn(async () => ({ sessionId: 'sess-r' }));
vi.mock('../../src/services/pf/uanLookup.service.js', () => ({
  startUanLookup: vi.fn(async () => ({ sessionId: 'sess-l' })),
  startPasswordReset,
}));

const { startPasswordResetHandler } = await import('../../src/controllers/pf.controller.js');

beforeEach(() => {
  queueAdd.mockReset();
  startPasswordReset.mockClear();
});

const body = { uan: '100123456789', mobile: '9876543210', newPassword: 'Abc@1234' };

describe('EPFO password reset from the web app', () => {
  it('queues the headless reset when the client sends no source', async () => {
    queueAdd.mockResolvedValue(true);
    const cap = fakeResponse();
    await startPasswordResetHandler({ user: { id: 'u1' }, body } as unknown as Request, cap.res);
    expect(cap.statusCode).toBe(200);
    expect(queueAdd).toHaveBeenCalledWith('password-reset', expect.objectContaining({ sessionId: 'sess-r' }));
  });

  it('refuses EXTENSION with a reason rather than creating a session nobody runs', async () => {
    const cap = fakeResponse();
    await startPasswordResetHandler(
      { user: { id: 'u1' }, body: { ...body, source: 'EXTENSION' } } as unknown as Request,
      cap.res,
    );
    expect(cap.statusCode).toBe(422);
    expect(startPasswordReset).not.toHaveBeenCalled();
  });
});
