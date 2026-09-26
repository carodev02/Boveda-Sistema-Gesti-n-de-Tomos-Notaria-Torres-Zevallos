import {Router} from 'express';
import type {NextFunction,Request,Response} from 'express';
import {Role} from '@prisma/client';
import {cancelProcessingJob,confirmDocument,continueQuality,deleteDocument,getDocument,getProcessingJob,getProcessingResults,listAttentionJobs,listDocuments,replaceDocumentFile,restoreDocument,startOcr,streamDocument,updateDocumentMetadata,updateDocumentTypeGroup,updateQuality,updateTomeNumber,uploadDocument} from '../controllers/documents.controller.js';
import {env} from '../config/env.js';
import {authenticate,requireRoles} from '../middlewares/auth.middleware.js';
import {asyncHandler,HttpError} from '../utils/http.js';

export const documentsRouter=Router();
documentsRouter.use(authenticate);
documentsRouter.get('/',asyncHandler(listDocuments));
documentsRouter.get('/attention-jobs',asyncHandler(listAttentionJobs));
documentsRouter.post('/',expressRaw,asyncHandler(uploadDocument));
documentsRouter.post('/upload',expressRaw,asyncHandler(uploadDocument));
documentsRouter.post('/uploads/from-scan',expressRaw,asyncHandler(uploadDocument));
documentsRouter.get('/:uploadId/job',asyncHandler(getProcessingJob));
documentsRouter.get('/document-processing-jobs/:jobId/results',asyncHandler(getProcessingResults));
documentsRouter.patch('/:uploadId/quality',asyncHandler(updateQuality));
documentsRouter.post('/:uploadId/quality/continue',asyncHandler(continueQuality));
documentsRouter.post('/:uploadId/ocr/start',asyncHandler(startOcr));
documentsRouter.post('/:uploadId/cancel',asyncHandler(cancelProcessingJob));
documentsRouter.post('/:uploadId/confirm',asyncHandler(confirmDocument));
documentsRouter.patch('/tomes/number',requireRoles(Role.ADMINISTRADOR,Role.NOTARIO),asyncHandler(updateTomeNumber));
documentsRouter.patch('/types/name',requireRoles(Role.ADMINISTRADOR,Role.NOTARIO),asyncHandler(updateDocumentTypeGroup));
documentsRouter.patch('/:id',asyncHandler(updateDocumentMetadata));
documentsRouter.delete('/:id',asyncHandler(deleteDocument));
documentsRouter.post('/:id/restore',asyncHandler(restoreDocument));
documentsRouter.put('/:id/file',expressRaw,asyncHandler(replaceDocumentFile));
documentsRouter.get('/:id/file',asyncHandler(streamDocument));
documentsRouter.get('/:id',asyncHandler(getDocument));

function expressRaw(req:Request,_res:Response,next:NextFunction){
  const chunks:Buffer[]=[];let size=0;let finished=false;const maximum=(env.MAX_PDF_UPLOAD_MB+1)*1024*1024;
  req.on('data',(chunk:Buffer)=>{if(finished)return;size+=chunk.length;if(size>maximum){finished=true;chunks.length=0;req.resume();next(new HttpError(413,`El PDF supera el límite de ${env.MAX_PDF_UPLOAD_MB} MB.`));return}chunks.push(chunk)});
  req.on('end',()=>{if(finished)return;finished=true;req.body=Buffer.concat(chunks,size);next()});req.on('error',error=>{if(!finished){finished=true;next(error)}});
}
