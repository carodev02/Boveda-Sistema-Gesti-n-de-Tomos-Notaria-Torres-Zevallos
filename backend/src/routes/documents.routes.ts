import {Router} from 'express';
import type {NextFunction,Request,Response} from 'express';
import {cancelProcessingJob,confirmDocument,deleteDocument,getDocument,getProcessingJob,listDocuments,restoreDocument,streamDocument,updateQuality,uploadDocument} from '../controllers/documents.controller.js';
import {authenticate} from '../middlewares/auth.middleware.js';
import {asyncHandler} from '../utils/http.js';

export const documentsRouter=Router();
documentsRouter.use(authenticate);
documentsRouter.get('/',asyncHandler(listDocuments));
documentsRouter.post('/',expressRaw,asyncHandler(uploadDocument));
documentsRouter.post('/upload',expressRaw,asyncHandler(uploadDocument));
documentsRouter.get('/:uploadId/job',asyncHandler(getProcessingJob));
documentsRouter.patch('/:uploadId/quality',asyncHandler(updateQuality));
documentsRouter.post('/:uploadId/cancel',asyncHandler(cancelProcessingJob));
documentsRouter.post('/:uploadId/confirm',asyncHandler(confirmDocument));
documentsRouter.delete('/:id',asyncHandler(deleteDocument));
documentsRouter.post('/:id/restore',asyncHandler(restoreDocument));
documentsRouter.get('/:id/file',asyncHandler(streamDocument));
documentsRouter.get('/:id',asyncHandler(getDocument));

function expressRaw(req:Request,_res:Response,next:NextFunction){
  const chunks:Buffer[]=[];req.on('data',(chunk:Buffer)=>chunks.push(chunk));req.on('end',()=>{req.body=Buffer.concat(chunks);next()});req.on('error',next);
}
