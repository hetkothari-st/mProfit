import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import { uploadSorterFiles } from '../middleware/documentUpload.js';
import * as c from '../controllers/documentSorter.controller.js';

export const documentSorterRouter = Router();

documentSorterRouter.use(authenticate, requireFeature('DOCUMENT_SORTER'));

documentSorterRouter.post('/upload', uploadSorterFiles, asyncHandler(c.upload));
documentSorterRouter.get('/tree', asyncHandler(c.tree));
documentSorterRouter.patch('/files/:id', asyncHandler(c.patchFile));
documentSorterRouter.post('/files/:id/password', asyncHandler(c.submitFilePassword));
documentSorterRouter.post('/people', asyncHandler(c.addPerson));
documentSorterRouter.patch('/people/:id', asyncHandler(c.patchPerson));
documentSorterRouter.post('/people/merge', asyncHandler(c.merge));
documentSorterRouter.get('/folder-zip', asyncHandler(c.folderZip));
