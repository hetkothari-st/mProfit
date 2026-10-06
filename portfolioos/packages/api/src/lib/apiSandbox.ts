import type { NextFunction, Request, Response } from 'express';

/**
 * Every API response carries `Content-Security-Policy: sandbox; default-src
 * 'none'`. The API returns JSON and stored files, never a page meant to run:
 * if someone opens a stored file directly (an emailed HTML "contract note",
 * an uploaded SVG), the browser renders it with no scripts, in an opaque
 * origin, loading nothing.
 *
 * The one exception is the broker OAuth callback, which returns a small page
 * whose script hands the result back to the app window and closes itself.
 */
const HTML_PAGE_ROUTES = [/^\/api\/fo\/brokers\/[^/]+\/callback(?:[/?]|$)/];

export const API_SANDBOX_CSP = "sandbox; default-src 'none'; frame-ancestors 'none'";

export function apiSandbox(req: Request, res: Response, next: NextFunction): void {
  if (!HTML_PAGE_ROUTES.some((re) => re.test(req.originalUrl))) {
    res.setHeader('Content-Security-Policy', API_SANDBOX_CSP);
  }
  next();
}
