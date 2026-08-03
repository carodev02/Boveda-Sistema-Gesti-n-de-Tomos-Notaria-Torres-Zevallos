import {Router} from 'express';
import {documentReport} from '../controllers/reports.controller.js';
import {authenticate} from '../middlewares/auth.middleware.js';
import {asyncHandler} from '../utils/http.js';
export const reportsRouter=Router();
reportsRouter.use(authenticate);
reportsRouter.get('/documents',asyncHandler(documentReport));
