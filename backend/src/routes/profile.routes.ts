import {Router} from 'express';import {getProfile,updateProfile} from '../controllers/profile.controller.js';import {authenticate} from '../middlewares/auth.middleware.js';import {asyncHandler} from '../utils/http.js';
export const profileRouter=Router();profileRouter.use(authenticate);profileRouter.get('/',asyncHandler(getProfile));profileRouter.patch('/',asyncHandler(updateProfile));
