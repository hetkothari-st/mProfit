import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  postScanJob,
  listScans,
  getScan,
  postCancelScan,
  postResumeScan,
  listDocs,
  getDoc,
  getDocPreviewUrl,
  getDocRaw,
  listSenders,
  postApproveDoc,
  postRejectDoc,
  postBulkApprove,
  postBulkReject,
  listAutoApproveRules,
  postAutoApproveRule,
  deleteAutoApproveRule,
} from '../controllers/gmailScan.controller.js';

export const gmailScanRouter = Router();
gmailScanRouter.use(authenticate);

gmailScanRouter.post('/scan-jobs', asyncHandler(postScanJob));
gmailScanRouter.get('/scan-jobs', asyncHandler(listScans));
gmailScanRouter.get('/scan-jobs/:id', asyncHandler(getScan));
gmailScanRouter.post('/scan-jobs/:id/cancel', asyncHandler(postCancelScan));
gmailScanRouter.post('/scan-jobs/:id/resume', asyncHandler(postResumeScan));

gmailScanRouter.get('/discovered-docs', asyncHandler(listDocs));
gmailScanRouter.get('/discovered-docs/senders', asyncHandler(listSenders));
gmailScanRouter.post('/discovered-docs/bulk-approve', asyncHandler(postBulkApprove));
gmailScanRouter.post('/discovered-docs/bulk-reject', asyncHandler(postBulkReject));
gmailScanRouter.get('/discovered-docs/:id', asyncHandler(getDoc));
gmailScanRouter.get('/discovered-docs/:id/preview-url', asyncHandler(getDocPreviewUrl));
gmailScanRouter.get('/discovered-docs/:id/raw', asyncHandler(getDocRaw));
gmailScanRouter.post('/discovered-docs/:id/approve', asyncHandler(postApproveDoc));
gmailScanRouter.post('/discovered-docs/:id/reject', asyncHandler(postRejectDoc));

gmailScanRouter.get('/auto-approve-rules', asyncHandler(listAutoApproveRules));
gmailScanRouter.post('/auto-approve-rules', asyncHandler(postAutoApproveRule));
gmailScanRouter.delete('/auto-approve-rules/:id', asyncHandler(deleteAutoApproveRule));
