import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireFeature } from '../../src/middleware/requirePlan.js';
import { ForbiddenError, UnauthorizedError } from '../../src/lib/errors.js';

function makeReq(user: Request['user']): Request {
  return { user } as Request;
}

describe('requireFeature', () => {
  it('calls next() with no args when the user meets the tier', () => {
    const mw = requireFeature('TAX_REPORT_CATALOG');
    const req = makeReq({ id: 'u1', email: 'a@b.com', role: 'INVESTOR', plan: 'PLUS' } as never);
    const next = vi.fn();
    mw(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(ForbiddenError) when the user is below the required tier', () => {
    const mw = requireFeature('ACCOUNTING_MODULE');
    const req = makeReq({ id: 'u1', email: 'a@b.com', role: 'INVESTOR', plan: 'PLUS' } as never);
    const next = vi.fn();
    mw(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0];
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.message).toMatch(/PRO_ADVISOR/);
  });

  it('gates ADMIN role on their own plan too, same as any user (no automatic bypass)', () => {
    const mw = requireFeature('ACCOUNTING_MODULE');
    const deniedReq = makeReq({ id: 'u1', email: 'a@b.com', role: 'ADMIN', plan: 'FREE' } as never);
    const deniedNext = vi.fn();
    mw(deniedReq, {} as Response, deniedNext as NextFunction);
    expect(deniedNext.mock.calls[0]![0]).toBeInstanceOf(ForbiddenError);

    const allowedReq = makeReq({
      id: 'u1',
      email: 'a@b.com',
      role: 'ADMIN',
      plan: 'PRO_ADVISOR',
    } as never);
    const allowedNext = vi.fn();
    mw(allowedReq, {} as Response, allowedNext as NextFunction);
    expect(allowedNext).toHaveBeenCalledWith();
  });

  it('calls next(UnauthorizedError) when there is no authenticated user', () => {
    const mw = requireFeature('AI_INSIGHTS');
    const req = makeReq(undefined);
    const next = vi.fn();
    mw(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]![0]).toBeInstanceOf(UnauthorizedError);
  });

  it('denies a FREE-tier user for every gated feature', () => {
    const mw = requireFeature('MULTIPLE_PORTFOLIOS');
    const req = makeReq({ id: 'u1', email: 'a@b.com', role: 'INVESTOR', plan: 'FREE' } as never);
    const next = vi.fn();
    mw(req, {} as Response, next as NextFunction);
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ForbiddenError);
  });
});
