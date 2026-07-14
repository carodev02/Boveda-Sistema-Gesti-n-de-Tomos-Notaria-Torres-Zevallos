import {Router} from 'express';
import {changePassword,login,logout,me,register,revokeOtherSessions,revokeSession,sessions} from '../controllers/auth.controller.js';
import {authenticate} from '../middlewares/auth.middleware.js';
import {asyncHandler} from '../utils/http.js';

export const authRouter=Router();
authRouter.post('/login',asyncHandler(login));
authRouter.post('/register',asyncHandler(register));
authRouter.post('/logout',authenticate,asyncHandler(logout));
authRouter.get('/me',authenticate,asyncHandler(me));
authRouter.post('/change-password',authenticate,asyncHandler(changePassword));
authRouter.get('/sessions',authenticate,asyncHandler(sessions));
authRouter.delete('/sessions/others',authenticate,asyncHandler(revokeOtherSessions));
authRouter.delete('/sessions/:id',authenticate,asyncHandler(revokeSession));
