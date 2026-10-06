import type { NextFunction, Request, Response } from 'express';
import { writeAuditLog } from './audit.js';

/**
 * Every file a signed-in user downloads — reports, statements, exports,
 * receipts, vault documents — leaves a `data_export` audit row, without each
 * of the ~70 download handlers having to remember to write one. A response
 * counts as a file when it is an attachment or a document/spreadsheet/archive
 * type; JSON API responses don't.
 */
const FILE_TYPES = /^(application\/(pdf|zip|octet-stream|vnd\.|x-zip)|text\/csv)/i;

export function auditDownloads(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    if (!req.user || res.statusCode !== 200) return;
    const disposition = String(res.getHeader('content-disposition') ?? '');
    const type = String(res.getHeader('content-type') ?? '');
    if (!/attachment/i.test(disposition) && !FILE_TYPES.test(type)) return;
    void writeAuditLog({
      userId: req.user.id,
      action: 'data_export',
      resource: req.baseUrl + req.path,
      metadata: { method: req.method, contentType: type.split(';')[0] },
      req,
    });
  });
  next();
}
