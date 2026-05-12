import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { getPreferencesHandler, updatePreferencesHandler } from '../controllers/userPreferences.controller.js';

export const userPreferencesRouter = Router();
userPreferencesRouter.use(authenticate);

userPreferencesRouter.get('/', asyncHandler(getPreferencesHandler));
userPreferencesRouter.patch('/', asyncHandler(updatePreferencesHandler));
