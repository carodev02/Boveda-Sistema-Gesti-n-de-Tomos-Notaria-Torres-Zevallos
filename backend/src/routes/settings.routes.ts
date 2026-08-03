import {Role} from '@prisma/client';
import {Router} from 'express';
import {getSettings,updateSettings} from '../controllers/settings.controller.js';
import {authenticate,requireRoles} from '../middlewares/auth.middleware.js';
import {asyncHandler} from '../utils/http.js';
export const settingsRouter=Router();
settingsRouter.use(authenticate);
settingsRouter.get('/',asyncHandler(getSettings));
settingsRouter.put('/',requireRoles(Role.NOTARIO,Role.ADMINISTRADOR),asyncHandler(updateSettings));
