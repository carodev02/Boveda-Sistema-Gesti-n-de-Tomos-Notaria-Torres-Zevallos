import {Router} from 'express';
import type {NextFunction,Request,Response} from 'express';
import {cancelProcessingJob,confirmDocument,continueQuality,deleteDocument,getDocument,getProcessingJob,listDocuments,restoreDocument,streamDocument,updateQuality,uploadDocument} from '../controllers/documents.controller.js';
import {authenticate} from '../middlewares/auth.middleware.js';
import {asyncHandler} from '../utils/http.js';

export const documentsRouter=Router();
documentsRouter.use(authenticate);
documentsRouter.get('/',asyncHandler(listDocuments));
documentsRouter.post('/',expressRaw,asyncHandler(uploadDocument));
documentsRouter.post('/upload',expressRaw,asyncHandler(uploadDocument));
documentsRouter.get('/:uploadId/job',asyncHandler(getProcessingJob));
documentsRouter.patch('/:uploadId/quality',asyncHandler(updateQuality));
documentsRouter.post('/:uploadId/quality/continue',asyncHandler(continueQuality));
documentsRouter.post('/:uploadId/ocr/start',asyncHandler(async(req,res)=>{const jobId=String(req.params.uploadId);const job=await getProcessingJobForStart(req,jobId);const {enqueueOcrJob}=await import('../services/ocr-worker.service.js');res.json(await enqueueOcrJob(job.id))}));
documentsRouter.post('/:uploadId/cancel',asyncHandler(cancelProcessingJob));
documentsRouter.post('/:uploadId/confirm',asyncHandler(confirmDocument));
documentsRouter.delete('/:id',asyncHandler(deleteDocument));
documentsRouter.post('/:id/restore',asyncHandler(restoreDocument));
documentsRouter.get('/:id/file',asyncHandler(streamDocument));
documentsRouter.get('/:id',asyncHandler(getDocument));

function expressRaw(req:Request,_res:Response,next:NextFunction){
  const chunks:Buffer[]=[];req.on('data',(chunk:Buffer)=>chunks.push(chunk));req.on('end',()=>{req.body=Buffer.concat(chunks);next()});req.on('error',next);
}

async function getProcessingJobForStart(req:Request,id:string){const {prisma}=await import('../config/prisma.js');const job=await prisma.documentProcessingJob.findFirst({where:{id,createdBy:req.auth!.userId}});if(!job)throw new Error('El trabajo documental no existe.');return job}
