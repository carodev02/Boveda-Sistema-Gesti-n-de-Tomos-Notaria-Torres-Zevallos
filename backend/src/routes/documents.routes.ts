import {Router} from 'express';
import type {NextFunction,Request,Response} from 'express';
import {confirmDocument,getDocument,listDocuments,streamDocument,uploadDocument} from '../controllers/documents.controller.js';
import {authenticate} from '../middlewares/auth.middleware.js';
import {asyncHandler} from '../utils/http.js';

export const documentsRouter=Router();
documentsRouter.use(authenticate);
documentsRouter.get('/',asyncHandler(listDocuments));
documentsRouter.get('/:id',asyncHandler(getDocument));
documentsRouter.get('/:id/file',asyncHandler(streamDocument));
documentsRouter.post('/',expressRaw,asyncHandler(uploadDocument));
documentsRouter.post('/:uploadId/confirm',asyncHandler(confirmDocument));

function expressRaw(req:Request,_res:Response,next:NextFunction){
  const chunks:Buffer[]=[];req.on('data',(chunk:Buffer)=>chunks.push(chunk));req.on('end',()=>{req.body=Buffer.concat(chunks);next()});req.on('error',next);
}
