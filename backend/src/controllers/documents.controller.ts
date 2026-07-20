import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {Request,Response} from 'express';
import {prisma} from '../config/prisma.js';
import {env} from '../config/env.js';
import {recordAudit} from '../services/audit.service.js';
import {HttpError} from '../utils/http.js';
import {enqueueOcrJob} from '../services/ocr-worker.service.js';

const root=path.resolve(env.STORAGE_ROOT);
const tempRoot=path.join(root,'temporary');
const safe=(value:string)=>value.replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-|-$/g,'')||'sin-clasificar';
const pages=(buffer:Buffer)=>Math.max(1,(buffer.toString('latin1').match(/\/Type\s*\/Page(?:\s|\/|>)/g)??[]).length);
const meta=(value:unknown)=>typeof value==='string'?value.trim():undefined;

export async function uploadDocument(req:Request,res:Response){
  const contentType=req.get('content-type')?.split(';')[0];
  let body=req.body as Buffer;let originalFileName=decodeURIComponent(String(req.get('x-file-name')??'documento.pdf'));
  if(contentType==='multipart/form-data'){const parsed=parseMultipart(req.body as Buffer,req.get('content-type')??'');body=parsed.file;originalFileName=parsed.fileName||originalFileName}
  if(!Buffer.isBuffer(body)||body.length===0)throw new HttpError(400,'El archivo PDF está vacío.');
  if(body.length>50*1024*1024)throw new HttpError(413,'El PDF supera el límite de 50 MB.');
  if(contentType!=='application/pdf'&&contentType!=='multipart/form-data')throw new HttpError(415,'Solo se permiten archivos PDF.');
  if(body.subarray(0,5).toString()!=='%PDF-')throw new HttpError(400,'El archivo no es un PDF válido.');
  await fs.mkdir(tempRoot,{recursive:true});
  const uploadId=crypto.randomUUID();
  const hash=crypto.createHash('sha256').update(body).digest('hex');
  const tempPath=path.join(tempRoot,uploadId,`${crypto.randomUUID()}.pdf`);
  await fs.mkdir(path.dirname(tempPath),{recursive:true});
  await fs.writeFile(tempPath,body);
  const job=await prisma.documentProcessingJob.create({data:{id:uploadId,originalFileName,temporaryPath:path.relative(root,tempPath),fileHash:hash,fileSize:body.length,mimeType:'application/pdf',pageCount:pages(body),createdBy:req.auth!.userId,status:'UPLOADED'}});
  await recordAudit(req,{action:'DOCUMENT_UPLOAD_COMPLETED',module:'Documentos',targetType:'DocumentProcessingJob',targetId:job.id,detail:job.originalFileName,newValues:{fileHash:hash,pageCount:job.pageCount}});
  res.status(201).json({uploadId:job.id,jobId:job.id,originalFileName:job.originalFileName,hash,size:body.length,mimeType:'application/pdf',pageCount:job.pageCount,status:job.status,temporaryFileStored:true});
}

function parseMultipart(buffer:Buffer,contentType:string){const boundaryMatch=contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);if(!boundaryMatch)throw new HttpError(400,'Carga multipart inválida.');const boundary=Buffer.from(`--${boundaryMatch[1]??boundaryMatch[2]}`);const start=buffer.indexOf(Buffer.from('\r\n\r\n'));if(start<0)throw new HttpError(400,'Carga multipart inválida.');const header=buffer.subarray(0,start).toString('utf8');const nameMatch=header.match(/filename="([^"]*)"/i);const end=buffer.indexOf(boundary,start+4);const file=buffer.subarray(start+4,end>0?end-2:buffer.length);return {file,fileName:nameMatch?.[1]??'documento.pdf'}}

export async function confirmDocument(req:Request,res:Response){
  const uploadId=String(req.params.uploadId);const input=req.body as Record<string,unknown>;
  const job=await prisma.documentProcessingJob.findFirst({where:{id:uploadId,createdBy:req.auth!.userId}});if(!job)throw new HttpError(404,'El trabajo documental no existe.');
  const tempPath=path.resolve(root,job.temporaryPath);const body=await fs.readFile(tempPath).catch(()=>null);
  if(!body)throw new HttpError(404,'La carga temporal no existe o expiró.');
  const hash=crypto.createHash('sha256').update(body).digest('hex');
  const existing=await prisma.document.findFirst({where:{fileHash:hash,deletedAt:null}});if(existing)throw new HttpError(409,'Este PDF ya está registrado.');
  const documentId=crypto.randomUUID();const storageName=`${documentId}.pdf`;await recordAudit(req,{action:'DOCUMENT_SAVE_STARTED',module:'Documentos',targetType:'DocumentProcessingJob',targetId:job.id,detail:job.originalFileName});
  const documentType=safe(String(input.documentType??'sin-clasificar'));const period=safe(String(input.year??input.biennium??'sin-periodo'));const tomo=safe(String(input.tomo??'sin-tomo'));
  const relative=path.join('documents',documentType,period,`tomo-${tomo}`,storageName);const finalPath=path.join(root,relative);await fs.mkdir(path.dirname(finalPath),{recursive:true});await prisma.documentProcessingJob.update({where:{id:job.id},data:{status:'SAVING'}});await fs.rename(tempPath,finalPath);
  const contractors=Array.isArray(input.contractors)?input.contractors.map(String).filter(Boolean):[];
  const ocrFields=Array.isArray(input.ocrFields)?input.ocrFields as Array<{key?:unknown;value?:unknown;confidence?:unknown;review?:unknown}>:[];
  const originalFileName=String(input.originalFileName??'documento.pdf');const displayName=String(input.displayName??originalFileName);
  const created=await prisma.document.create({data:{id:documentId,displayName,originalFileName,storageName,filePath:relative,fileHash:hash,fileSize:body.length,mimeType:'application/pdf',pageCount:Number(input.pageCount)||pages(body),documentMode:String(input.documentMode??'actual'),documentType:String(input.documentType??'Sin clasificar'),year:input.year?Number(input.year):undefined,biennium:meta(input.biennium),tomo:String(input.tomo??''),fojaInitial:input.fojaInitial?Number(input.fojaInitial):undefined,fojaFinal:input.fojaFinal?Number(input.fojaFinal):undefined,escritura:meta(input.escritura),kardex:meta(input.kardex),minuta:meta(input.minuta),actoJuridico:meta(input.actoJuridico),documentDate:meta(input.documentDate),observations:meta(input.observations),ocrConfidence:input.ocrConfidence?Number(input.ocrConfidence):undefined,documentStatus:String(input.documentStatus??'Validado'),ocrStatus:String(input.ocrStatus??'Procesado'),createdBy:req.auth!.userId,processingJob:{connect:{id:job.id}},contractors:{create:contractors.map((name,position)=>({name,position}))}} ,include:{contractors:true}});
  if(ocrFields.length)await prisma.ocrField.createMany({data:ocrFields.filter(field=>typeof field.key==='string').map(field=>({jobId:job.id,fieldName:String(field.key),extractedValue:Array.isArray(field.value)?field.value.join(', '):String(field.value??''),normalizedValue:Array.isArray(field.value)?field.value.join(', '):String(field.value??''),confidence:typeof field.confidence==='number'?field.confidence:Number(field.confidence)||0,requiresReview:Boolean(field.review)}))});
  await prisma.documentProcessingJob.update({where:{id:job.id},data:{status:'COMPLETED',documentId:created.id}});
  await recordAudit(req,{action:'DOCUMENT_CREATED',module:'Documentos',targetType:'Document',targetId:created.id,detail:created.displayName,newValues:{filePath:created.filePath,fileHash:created.fileHash,pageCount:created.pageCount}});
  res.status(201).json({document:created,documentId:created.id,status:'COMPLETED',displayName:created.displayName,logicalLocation:{documentType:created.documentType,period:created.year??created.biennium??'',volume:created.tomo,folios:created.fojaInitial||created.fojaFinal?`Fojas ${created.fojaInitial??''}-${created.fojaFinal??''}`:''},message:'Documento archivado correctamente'});
}

export async function updateQuality(req:Request,res:Response){
  const jobId=String(req.params.uploadId);const input=req.body as {issues?:Array<{pageNumber:number;issueType:string;severity:string;message:string;suggestedAction?:string}>;override?:boolean};
  const job=await prisma.documentProcessingJob.findFirst({where:{id:jobId,createdBy:req.auth!.userId}});if(!job)throw new HttpError(404,'El trabajo documental no existe.');
  await prisma.qualityIssue.deleteMany({where:{jobId}});if(input.issues?.length)await prisma.qualityIssue.createMany({data:input.issues.map(issue=>({...issue,jobId}))});
  const status=input.override?'OCR_PENDING':input.issues?.length?'QUALITY_REVIEW':'OCR_PENDING';await prisma.documentProcessingJob.update({where:{id:jobId},data:{status}});
  await recordAudit(req,{action:input.override?'QUALITY_OVERRIDE_ACCEPTED':'QUALITY_ANALYSIS_COMPLETED',module:'Documentos',targetType:'DocumentProcessingJob',targetId:jobId,detail:input.override?'El usuario continuó pese a incidencias':'Control de calidad confirmado'});
  res.json({jobId,status,issues:input.issues??[]});
}

export async function continueQuality(req:Request,res:Response){
  const jobId=String(req.params.uploadId);const job=await prisma.documentProcessingJob.findFirst({where:{id:jobId,createdBy:req.auth!.userId}});if(!job)throw new HttpError(404,'El trabajo documental no existe.');
  const issues=await prisma.qualityIssue.findMany({where:{jobId}});const override=issues.length>0;
  await prisma.documentProcessingJob.update({where:{id:jobId},data:{status:'OCR_PENDING'}});
  await recordAudit(req,{action:'QUALITY_OVERRIDE_ACCEPTED',module:'Documentos',targetType:'DocumentProcessingJob',targetId:jobId,detail:override?'El usuario aceptó continuar con incidencias':'Calidad verificada',newValues:{qualityOverrideAccepted:override}});
  const queued=await enqueueOcrJob(jobId);res.json({...queued,qualityOverrideAccepted:override});
}

export async function getProcessingJob(req:Request,res:Response){const job=await prisma.documentProcessingJob.findFirst({where:{id:String(req.params.uploadId),createdBy:req.auth!.userId},include:{qualityIssues:true,ocrPages:true,ocrFields:true}});if(!job)throw new HttpError(404,'El trabajo documental no existe.');res.json({job});}
export async function getProcessingResults(req:Request,res:Response){const job=await prisma.documentProcessingJob.findFirst({where:{id:String(req.params.jobId),createdBy:req.auth!.userId},include:{ocrPages:{orderBy:{pageNumber:'asc'}},ocrFields:{orderBy:[{sourcePage:'asc'},{fieldName:'asc'}]}}});if(!job)throw new HttpError(404,'No se encontrÃ³ el proceso de lectura.');if(['QUEUED','OCR_PROCESSING','PROCESSING'].includes(job.status))return res.json({jobId:job.id,status:job.status,pages:[],fields:[],confirmedFields:[],reviewFields:[],reviewCount:0});const fields=job.ocrFields.map(field=>({...field,extractedValue:field.extractedValue??'',normalizedValue:field.normalizedValue??'',pageNumber:field.sourcePage}));const reviewFields=fields.filter(field=>field.requiresReview||!field.normalizedValue);const confirmedFields=fields.filter(field=>!field.requiresReview&&Boolean(field.normalizedValue));res.json({jobId:job.id,status:job.status,documentId:job.documentId,uploadId:job.id,pages:job.ocrPages.map(page=>({id:page.id,pageNumber:page.pageNumber,rawText:page.text,normalizedText:page.text,averageConfidence:page.confidence,processingMethod:page.engine,status:'COMPLETED'})),fields,confirmedFields,reviewFields,reviewCount:reviewFields.length});}
export async function cancelProcessingJob(req:Request,res:Response){const job=await prisma.documentProcessingJob.findFirst({where:{id:String(req.params.uploadId),createdBy:req.auth!.userId}});if(!job)throw new HttpError(404,'El trabajo documental no existe.');if(job.status==='COMPLETED')throw new HttpError(409,'El trabajo ya fue completado.');await prisma.documentProcessingJob.update({where:{id:job.id},data:{status:'CANCELLED'}});await fs.rm(path.resolve(root,job.temporaryPath),{force:true});await recordAudit(req,{action:'DOCUMENT_JOB_CANCELLED',module:'Documentos',targetType:'DocumentProcessingJob',targetId:job.id,detail:job.originalFileName});res.json({jobId:job.id,status:'CANCELLED'});}

export async function listDocuments(req:Request,res:Response){const rows=await prisma.document.findMany({where:{deletedAt:null},include:{contractors:true},orderBy:{createdAt:'desc'},take:Math.min(Number(req.query.limit)||50,100),skip:Math.max(Number(req.query.offset)||0,0)});res.json({documents:rows});}
export async function getDocument(req:Request,res:Response){const row=await prisma.document.findFirst({where:{id:String(req.params.id),deletedAt:null},include:{contractors:true}});if(!row)throw new HttpError(404,'Documento no encontrado.');res.json({document:row});}
export async function streamDocument(req:Request,res:Response){const row=await prisma.document.findFirst({where:{id:String(req.params.id),deletedAt:null}});if(!row)throw new HttpError(404,'Documento no encontrado.');res.type(row.mimeType);res.setHeader('Content-Disposition',`inline; filename="${row.originalFileName.replace(/"/g,'')}"`);res.sendFile(path.resolve(root,row.filePath));}

export async function deleteDocument(req:Request,res:Response){
  const id=String(req.params.id);const row=await prisma.document.findUnique({where:{id}});if(!row)throw new HttpError(404,'Documento no encontrado.');
  if(!['ADMINISTRADOR','NOTARIO'].includes(req.auth!.role))throw new HttpError(403,'No tiene permiso para eliminar documentos.');
  const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'Eliminación solicitada';
  if(row.isTestData){await prisma.$transaction(async tx=>{await tx.document.delete({where:{id}});await recordAudit(req,{action:'DOCUMENT_TEST_PERMANENTLY_DELETED',module:'Documentos',targetType:'Document',targetId:id,detail:row.displayName,oldValues:{filePath:row.filePath,isTestData:true}})});await fs.rm(path.resolve(root,row.filePath),{force:true});return res.json({deleted:true,permanent:true});}
  const updated=await prisma.document.update({where:{id},data:{deletedAt:new Date(),deletedBy:req.auth!.userId,deletionReason:reason}});await recordAudit(req,{action:'DOCUMENT_SOFT_DELETED',module:'Documentos',targetType:'Document',targetId:id,detail:row.displayName,oldValues:{filePath:row.filePath},newValues:{deletionReason:reason}});res.json({document:updated,deleted:true,permanent:false});
}

export async function restoreDocument(req:Request,res:Response){const id=String(req.params.id);const row=await prisma.document.findUnique({where:{id}});if(!row)throw new HttpError(404,'Documento no encontrado.');if(!['ADMINISTRADOR','NOTARIO'].includes(req.auth!.role))throw new HttpError(403,'No tiene permiso para restaurar documentos.');const updated=await prisma.document.update({where:{id},data:{deletedAt:null,deletedBy:null,deletionReason:null}});await recordAudit(req,{action:'DOCUMENT_RESTORED',module:'Documentos',targetType:'Document',targetId:id,detail:row.displayName});res.json({document:updated});}
