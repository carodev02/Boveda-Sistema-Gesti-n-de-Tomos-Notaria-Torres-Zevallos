import {Router} from 'express';
import {queryDocumentAssistant} from '../controllers/assistant.controller.js';
import {authenticate} from '../middlewares/auth.middleware.js';
import {asyncHandler} from '../utils/http.js';

export const assistantRouter=Router();
assistantRouter.use(authenticate);
assistantRouter.post('/query',asyncHandler(queryDocumentAssistant));

