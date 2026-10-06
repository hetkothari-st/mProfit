import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  photoUpload,
  listPhotosHandler,
  listCoversHandler,
  uploadPhotoHandler,
  servePhotoHandler,
  makeCoverHandler,
  deletePhotoHandler,
  listLocationsHandler,
  getLocationHandler,
  setLocationHandler,
  resetLocationHandler,
} from '../controllers/propertyMedia.controller.js';

/** Photos of Real Estate and Rental properties (stored in the database). */
export const propertyPhotosRouter = Router();
propertyPhotosRouter.use(authenticate);
propertyPhotosRouter.get('/', asyncHandler(listPhotosHandler));
propertyPhotosRouter.get('/covers', asyncHandler(listCoversHandler));
propertyPhotosRouter.post('/', photoUpload, asyncHandler(uploadPhotoHandler));
propertyPhotosRouter.get('/:id/:size(full|thumb)', asyncHandler(servePhotoHandler));
propertyPhotosRouter.post('/:id/cover', asyncHandler(makeCoverHandler));
propertyPhotosRouter.delete('/:id', asyncHandler(deletePhotoHandler));

/** Map pins — looked up from the address (OpenStreetMap) or placed by hand. */
export const propertyLocationRouter = Router();
propertyLocationRouter.use(authenticate);
propertyLocationRouter.get('/', asyncHandler(listLocationsHandler));
propertyLocationRouter.get('/:ownerType/:id', asyncHandler(getLocationHandler));
propertyLocationRouter.put('/:ownerType/:id', asyncHandler(setLocationHandler));
propertyLocationRouter.delete('/:ownerType/:id', asyncHandler(resetLocationHandler));
