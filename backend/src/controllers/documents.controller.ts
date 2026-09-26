import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {Request,Response} from 'express';
import type {Prisma} from '@prisma/client';
import {prisma} from '../config/prisma.js';
import {env} from '../config/env.js';
import {recordAudit} from '../services/audit.service.js';
import {HttpError} from '../utils/http.js';
import {enqueueOcrJob,getOcrProgress,normalizeQrUrl} from '../services/ocr-worker.service.js';
import {associateKardexCase,kardexPeriodKey,kardexStatusAfterDeletion,normalizeKardex,refreshKardexCaseAfterDeletion} from '../services/kardex-case.service.js';
import {alignKardexDocumentsToTome,moveDocumentType,moveTomeDocuments,type DocumentPeriodScope} from '../services/kardex-tome-reconciliation.service.js';
import {hasDamagedText,sanitizeDisplayText} from '../utils/display-text.js';
import {requiredTomeNumber} from '../utils/tome-number.js';
import {resolveDocumentFile} from '../services/document-file-storage.service.js';
import {inlineContentDisposition} from '../utils/content-disposition.js';
import {documentDisplayName} from '../utils/document-filename.js';

const root=path.resolve(env.STORAGE_ROOT);
const tempRoot=path.join(root,'temporary');
const safe=(value:string)=>value.replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-|-$/g,'')||'sin-clasificar';
const pages=(buffer:Buffer)=>Math.max(1,(buffer.toString('latin1').match(/\/Type\s*\/Page(?:\s|\/|>)/g)??[]).length);
const meta=(value:unknown)=>typeof value==='string'?(sanitizeDisplayText(value)||undefined):undefined;
const qrFieldInclude={select:{ocrFields:{where:{fieldName:{in:['qrUrl','qrRawValue','qrPageNumber']}},select:{fieldName:true,normalizedValue:true,extractedValue:true,sourcePage:true,createdAt:true},orderBy:{createdAt:'desc' as const}}}};
type QrBacked={documentType?:string;relatedDocuments?:Array<{documentType:string}>;processingJob?:{ocrFields:Array<{fieldName:string;normalizedValue:string|null;extractedValue:string|null;sourcePage:number|null}>}|null};
function attachQrMetadata<T extends QrBacked>(row:T){const fields=row.processingJob?.ocrFields??[];const value=(name:string)=>fields.find(field=>field.fieldName===name)?.normalizedValue??fields.find(field=>field.fieldName===name)?.extractedValue??undefined;const qrUrl=normalizeQrUrl(value('qrUrl')??value('qrRawValue'));const qrRawValue=value('qrRawValue');const qrPageNumber=Number(value('qrPageNumber')??fields.find(field=>field.fieldName==='qrUrl')?.sourcePage)||undefined;const relationStatus=row.documentType&&row.relatedDocuments?kardexStatusAfterDeletion([row.documentType,...row.relatedDocuments.map(item=>item.documentType)]):undefined;return {...row,...(relationStatus?{relationStatus}:{}),qrUrl,qrRawValue,qrPageNumber}}
const frontendNumericId=(id:string)=>{let value=0;for(const char of id)value=(value*31+char.charCodeAt(0))>>>0;return value||1};
const elevated=(role:string)=>role==='ADMINISTRADOR'||role==='NOTARIO';
function assertDocumentManagement(req:Request,document:{createdBy:string}){if(!elevated(req.auth!.role)&&document.createdBy!==req.auth!.userId)throw new HttpError(403,'Solo puede realizar acciones sobre documentos subidos por su propia cuenta.');}
async function resolveDocumentId(value:string){if(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))return value;if(!/^\d+$/.test(value))return value;const expected=Number(value);const rows=await prisma.document.findMany({select:{id:true}});return rows.find(row=>frontendNumericId(row.id)===expected)?.id??value}

export async function uploadDocument(req:Request,res:Response){
  const contentType=req.get('content-type')?.split(';')[0];
  const importValidated=req.get('x-import-validated')==='true';
  let body=req.body as Buffer;let originalFileName=decodeURIComponent(String(req.get('x-file-name')??'documento.pdf'));
  if(contentType==='multipart/form-data'){const parsed=parseMultipart(req.body as Buffer,req.get('content-type')??'');body=parsed.file;originalFileName=parsed.fileName||originalFileName}
  if(!Buffer.isBuffer(body)||body.length===0)throw new HttpError(400,'El archivo PDF está vacío.');
  if(body.length>env.MAX_PDF_UPLOAD_MB*1024*1024)throw new HttpError(413,`El PDF supera el límite de ${env.MAX_PDF_UPLOAD_MB} MB.`);
  if(contentType!=='application/pdf'&&contentType!=='multipart/form-data')throw new HttpError(415,'Solo se permiten archivos PDF.');
  if(body.subarray(0,5).toString()!=='%PDF-'){if(importValidated)await recordAudit(req,{action:'IMPORT_FILE_FAILED',module:'Importaciones',detail:originalFileName,result:'ERROR',newValues:{reason:'INVALID_PDF_HEADER'}});throw new HttpError(400,'El archivo no es un PDF válido.');}
  await fs.mkdir(tempRoot,{recursive:true});
  const uploadId=crypto.randomUUID();
  const hash=crypto.createHash('sha256').update(body).digest('hex');
  const reportedPageCount=Number(req.get('x-page-count'));
  const pageCount=Number.isInteger(reportedPageCount)&&reportedPageCount>0&&reportedPageCount<=10000?reportedPageCount:pages(body);
  const tempPath=path.join(tempRoot,uploadId,`${crypto.randomUUID()}.pdf`);
  await fs.mkdir(path.dirname(tempPath),{recursive:true});
  await fs.writeFile(tempPath,body);
  const job=await prisma.documentProcessingJob.create({data:{id:uploadId,originalFileName,temporaryPath:path.relative(root,tempPath),fileHash:hash,fileSize:body.length,mimeType:'application/pdf',pageCount,station:importValidated?'IMPORT':undefined,createdBy:req.auth!.userId,status:importValidated?'REVIEW_REQUIRED':'UPLOADED'}});
  await recordAudit(req,{action:importValidated?'IMPORT_FILE_UPLOADED':'DOCUMENT_UPLOAD_COMPLETED',module:importValidated?'Importaciones':'Documentos',targetType:'DocumentProcessingJob',targetId:job.id,detail:job.originalFileName,newValues:{fileHash:hash,pageCount:job.pageCount,importValidated}});
  res.status(201).json({uploadId:job.id,jobId:job.id,originalFileName:job.originalFileName,hash,size:body.length,mimeType:'application/pdf',pageCount:job.pageCount,status:job.status,temporaryFileStored:true});
}

function parseMultipart(buffer:Buffer,contentType:string){const boundaryMatch=contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);if(!boundaryMatch)throw new HttpError(400,'Carga multipart inválida.');const boundary=Buffer.from(`--${boundaryMatch[1]??boundaryMatch[2]}`);const start=buffer.indexOf(Buffer.from('\r\n\r\n'));if(start<0)throw new HttpError(400,'Carga multipart inválida.');const header=buffer.subarray(0,start).toString('utf8');const nameMatch=header.match(/filename="([^"]*)"/i);const end=buffer.indexOf(boundary,start+4);const file=buffer.subarray(start+4,end>0?end-2:buffer.length);return {file,fileName:nameMatch?.[1]??'documento.pdf'}}

export async function confirmDocument(req:Request,res:Response){
  const uploadId=String(req.params.uploadId);const input=req.body as Record<string,unknown>;
  const normalizedTome=requiredTomeNumber(input.tomo);const qrUrl=normalizeQrUrl(input.qrUrl);if(input.qrUrl&&!qrUrl)throw new HttpError(400,'El enlace leído del QR no es una URL HTTP/HTTPS válida.');
  const job=await prisma.documentProcessingJob.findFirst({where:{id:uploadId,createdBy:req.auth!.userId}});if(!job)throw new HttpError(404,'El trabajo documental no existe.');
  if(job.documentId){const document=await prisma.document.findUnique({where:{id:job.documentId},include:{contractors:true,processingJob:qrFieldInclude,kardexCase:{include:{documents:{where:{deletedAt:null},include:{contractors:true}}}}}});if(document)return res.json({document:attachQrMetadata(document),documentId:document.id,status:'COMPLETED',displayName:document.displayName})}
  if(job.status!=='REVIEW_REQUIRED')throw new HttpError(409,'El documento todavía no está listo para confirmarse.');
  const tempPath=path.resolve(root,job.temporaryPath);const body=await fs.readFile(tempPath).catch(()=>null);
  if(!body)throw new HttpError(404,'La carga temporal no existe o expiró.');
  const hash=crypto.createHash('sha256').update(body).digest('hex');
  const existing=await prisma.document.findFirst({where:{fileHash:hash},select:{id:true,displayName:true,deletedAt:true}});if(existing){if(job.station==='IMPORT')await recordAudit(req,{action:'IMPORT_FILE_FAILED',module:'Importaciones',targetType:'DocumentProcessingJob',targetId:job.id,detail:job.originalFileName,result:'ERROR',newValues:{reason:'DUPLICATE_HASH',existingDocumentId:existing.id}});throw new HttpError(409,existing.deletedAt?'Este PDF ya fue registrado y está eliminado. Restáurelo desde el historial en lugar de crear un duplicado.':'Este PDF ya está registrado.',{code:existing.deletedAt?'DOCUMENT_ALREADY_DELETED':'DOCUMENT_ALREADY_EXISTS',documentId:existing.id,displayName:existing.displayName});}
  const documentId=crypto.randomUUID();const storageName=`${documentId}.pdf`;await recordAudit(req,{action:'DOCUMENT_REVIEW_CONFIRMED',module:'Digitalización',targetType:'DocumentProcessingJob',targetId:job.id,detail:job.originalFileName});await recordAudit(req,{action:'DOCUMENT_SAVE_STARTED',module:'Documentos',targetType:'DocumentProcessingJob',targetId:job.id,detail:job.originalFileName});
  const documentType=safe(sanitizeDisplayText(input.documentType??'sin-clasificar'));const period=safe(String(input.year??input.biennium??'sin-periodo'));const tomo=safe(normalizedTome);
  const relative=path.join('documents',documentType,period,`tomo-${tomo}`,storageName);const finalPath=path.join(root,relative);await fs.mkdir(path.dirname(finalPath),{recursive:true});await prisma.documentProcessingJob.update({where:{id:job.id},data:{status:'SAVING'}});await fs.rename(tempPath,finalPath);
  const contractors=Array.isArray(input.contractors)?input.contractors.map(sanitizeDisplayText).filter(Boolean):[];
  const ocrFields=Array.isArray(input.ocrFields)?input.ocrFields as Array<{key?:unknown;value?:unknown;confidence?:unknown;review?:unknown}>:[];
  const originalFileName=job.originalFileName;const displayName=sanitizeDisplayText(input.displayName??originalFileName)||originalFileName;
  const biennium=meta(input.biennium);const bienniumMatch=biennium?.match(/^(\d{4})\s*[-–]\s*(\d{4})$/);
  const created=await prisma.document.create({data:{id:documentId,displayName,originalFileName,storageName,filePath:relative,fileHash:hash,fileSize:body.length,mimeType:'application/pdf',pageCount:Number(input.pageCount)||pages(body),documentMode:'actual',documentType:sanitizeDisplayText(input.documentType??'Sin clasificar'),year:input.year?Number(input.year):undefined,biennium,bienniumStart:input.bienniumStart?Number(input.bienniumStart):bienniumMatch?Number(bienniumMatch[1]):undefined,bienniumEnd:input.bienniumEnd?Number(input.bienniumEnd):bienniumMatch?Number(bienniumMatch[2]):undefined,tomo:normalizedTome,fojaInitial:input.fojaInitial?Number(input.fojaInitial):undefined,fojaFinal:input.fojaFinal?Number(input.fojaFinal):undefined,escritura:meta(input.escritura),kardex:meta(input.kardex),minuta:meta(input.minuta),actoJuridico:meta(input.actoJuridico),documentDate:meta(input.documentDate),observations:meta(input.observations),ocrConfidence:input.ocrConfidence?Number(input.ocrConfidence):undefined,documentStatus:'CONFIRMED',ocrStatus:'PROCESSED',createdBy:req.auth!.userId,processingJob:{connect:{id:job.id}},contractors:{create:contractors.map((name,position)=>({name,position}))}} ,include:{contractors:true}});
  const {confirmed,relation}=await prisma.$transaction(async tx=>{
    if(ocrFields.length)await tx.ocrField.createMany({data:ocrFields.filter(field=>typeof field.key==='string').map(field=>({jobId:job.id,fieldName:String(field.key),extractedValue:Array.isArray(field.value)?field.value.join(', '):String(field.value??''),normalizedValue:Array.isArray(field.value)?field.value.join(', '):String(field.value??''),confidence:typeof field.confidence==='number'?field.confidence:Number(field.confidence)||0,requiresReview:Boolean(field.review)}))});if(qrUrl){await tx.ocrField.deleteMany({where:{jobId:job.id,fieldName:'qrUrl'}});await tx.ocrField.create({data:{jobId:job.id,fieldName:'qrUrl',extractedValue:qrUrl,normalizedValue:qrUrl,confidence:1,requiresReview:false}})}
    await tx.document.update({where:{id:created.id},data:{folioRangeStart:input.folioRangeStart!=null?Number(input.folioRangeStart):undefined,folioRangeEnd:input.folioRangeEnd!=null?Number(input.folioRangeEnd):undefined,printedFolio:input.printedFolio!=null?Number(input.printedFolio):input.fojaInitial!=null?Number(input.fojaInitial):undefined}});
    const relation=await associateKardexCase(tx,{documentId:created.id,kardex:input.kardex,documentType:created.documentType,year:created.year??undefined,bienniumStart:created.bienniumStart??undefined,bienniumEnd:created.bienniumEnd??undefined,tomeNumber:created.tomo,legalAct:created.actoJuridico??undefined,primaryContractor:contractors[0]});
    await tx.documentProcessingJob.update({where:{id:job.id},data:{status:'COMPLETED',documentId:created.id}});
    const confirmed=await tx.document.findUniqueOrThrow({where:{id:created.id},include:{contractors:true,processingJob:qrFieldInclude,kardexCase:{include:{documents:{where:{deletedAt:null},include:{contractors:true}}}}}});return {confirmed,relation};
  });
  await recordAudit(req,{action:relation.duplicateMinuta?'KARDEX_CASE_CONFLICT':'DOCUMENT_CREATED',module:'Documentos',targetType:'Document',targetId:confirmed.id,detail:confirmed.displayName,newValues:{filePath:confirmed.filePath,fileHash:confirmed.fileHash,pageCount:confirmed.pageCount,kardexCaseId:relation.caseId,relationStatus:relation.status,locationConflict:relation.locationConflict,contractorConflict:relation.contractorConflict}});
  res.status(201).json({document:attachQrMetadata(confirmed),documentId:confirmed.id,status:'COMPLETED',displayName:confirmed.displayName,relation,logicalLocation:{documentType:confirmed.documentType,period:confirmed.year??confirmed.biennium??'',volume:confirmed.tomo,folioRangeStart:confirmed.folioRangeStart,folioRangeEnd:confirmed.folioRangeEnd,printedFolio:confirmed.printedFolio},message:'Documento archivado correctamente'});
}

export async function updateQuality(req:Request,res:Response){
  const jobId=String(req.params.uploadId);const input=req.body as {issues?:Array<{pageNumber:number;issueType:string;severity:string;message:string;suggestedAction?:string}>;override?:boolean};
  const job=await prisma.documentProcessingJob.findFirst({where:{id:jobId,...(elevated(req.auth!.role)?{}:{createdBy:req.auth!.userId})}});if(!job)throw new HttpError(404,'El trabajo documental no existe.');
  await prisma.qualityIssue.deleteMany({where:{jobId}});if(input.issues?.length)await prisma.qualityIssue.createMany({data:input.issues.map(issue=>({...issue,jobId}))});
  const status=input.override?'OCR_PENDING':input.issues?.length?'QUALITY_REVIEW':'OCR_PENDING';await prisma.documentProcessingJob.update({where:{id:jobId},data:{status}});
  await recordAudit(req,{action:input.override?'QUALITY_OVERRIDE_ACCEPTED':'QUALITY_ANALYSIS_COMPLETED',module:'Documentos',targetType:'DocumentProcessingJob',targetId:jobId,detail:input.override?'El usuario continuó pese a incidencias':'Control de calidad confirmado'});
  res.json({jobId,status,issues:input.issues??[]});
}

export async function continueQuality(req:Request,res:Response){
  const jobId=String(req.params.uploadId);const job=await prisma.documentProcessingJob.findFirst({where:{id:jobId,...(elevated(req.auth!.role)?{}:{createdBy:req.auth!.userId})}});if(!job)throw new HttpError(404,'El trabajo documental no existe.');
  const issues=await prisma.qualityIssue.findMany({where:{jobId}});const override=issues.length>0;
  await prisma.documentProcessingJob.update({where:{id:jobId},data:{status:'OCR_PENDING'}});
  await recordAudit(req,{action:'QUALITY_OVERRIDE_ACCEPTED',module:'Documentos',targetType:'DocumentProcessingJob',targetId:jobId,detail:override?'El usuario aceptó continuar con incidencias':'Calidad verificada',newValues:{qualityOverrideAccepted:override}});
  const queued=await enqueueOcrJob(jobId);res.json({...queued,qualityOverrideAccepted:override});
}

export async function getProcessingJob(req:Request,res:Response){const job=await prisma.documentProcessingJob.findFirst({where:{id:String(req.params.uploadId),...(elevated(req.auth!.role)?{}:{createdBy:req.auth!.userId})},include:{qualityIssues:true,ocrPages:true,ocrFields:true}});if(!job)throw new HttpError(404,'El trabajo documental no existe.');if(job.status==='OCR_PENDING')void enqueueOcrJob(job.id);if(job.status==='REVIEW_REQUIRED'||job.status==='FAILED'){const action=job.status==='REVIEW_REQUIRED'?'OCR_COMPLETED':'OCR_FAILED';const previous=await prisma.auditEvent.findFirst({where:{action,targetType:'DocumentProcessingJob',targetId:job.id}});if(!previous)await recordAudit(req,{action,module:'Digitalización',targetType:'DocumentProcessingJob',targetId:job.id,detail:job.errorMessage??job.originalFileName,result:job.status==='FAILED'?'ERROR':'EXITOSO',newValues:{pageCount:job.pageCount,status:job.status}});}const savedPages=job.ocrPages.length;const live=getOcrProgress(job.id);const processedPages=live?.processedPages??savedPages;const errorCode=/^([A-Z][A-Z_]+):/.exec(job.errorMessage??'')?.[1];const stages:Record<string,string>={UPLOADED:'PREPARING',QUALITY_REVIEW:'PREPARING',OCR_PENDING:'PREPARING',OCR_PROCESSING:'RUNNING_OCR',PROCESSING:'RUNNING_OCR',COMPLETED:'COMPLETED',REVIEW_REQUIRED:'REVIEW_REQUIRED',FAILED:'RUNNING_OCR',CANCELLED:'RUNNING_OCR'};res.json({jobId:job.id,status:job.status,currentStage:stages[job.status]??'PREPARING',totalPages:live?.totalPages||job.pageCount,processedPages,progress:live?.progress??(job.pageCount?Math.round(savedPages/job.pageCount*100):undefined),elapsedSeconds:live?.elapsedSeconds,estimatedSecondsRemaining:live?.estimatedSecondsRemaining,failedPages:live?.failedPages,errorCode,error:job.errorMessage,job});}
export async function getProcessingResults(req:Request,res:Response){const job=await prisma.documentProcessingJob.findFirst({where:{id:String(req.params.jobId),createdBy:req.auth!.userId},include:{ocrPages:{orderBy:{pageNumber:'asc'}},ocrFields:{orderBy:[{sourcePage:'asc'},{fieldName:'asc'}]}}});if(!job)throw new HttpError(404,'No se encontró el proceso de lectura.');if(['OCR_PENDING','OCR_PROCESSING','PROCESSING'].includes(job.status))return res.json({jobId:job.id,status:job.status,pages:[],fields:[],confirmedFields:[],reviewFields:[],reviewCount:0});const fields=job.ocrFields.map(field=>{const normalizedValue=sanitizeDisplayText(field.normalizedValue??'');return {...field,extractedValue:field.extractedValue??'',normalizedValue,pageNumber:field.sourcePage,requiresReview:field.requiresReview||hasDamagedText(field.normalizedValue)}});const reviewFields=fields.filter(field=>field.requiresReview||!field.normalizedValue);const confirmedFields=fields.filter(field=>!field.requiresReview&&Boolean(field.normalizedValue));res.json({jobId:job.id,status:job.status,documentId:job.documentId,uploadId:job.id,pages:job.ocrPages.map(page=>({id:page.id,pageNumber:page.pageNumber,rawText:page.text,normalizedText:sanitizeDisplayText(page.text),averageConfidence:page.confidence,processingMethod:page.engine,status:'COMPLETED'})),fields,confirmedFields,reviewFields,reviewCount:reviewFields.length});}
export async function cancelProcessingJob(req:Request,res:Response){const job=await prisma.documentProcessingJob.findFirst({where:{id:String(req.params.uploadId),...(elevated(req.auth!.role)?{}:{createdBy:req.auth!.userId})}});if(!job)throw new HttpError(404,'El trabajo documental no existe.');if(job.status==='COMPLETED')throw new HttpError(409,'El trabajo ya fue completado.');await prisma.documentProcessingJob.update({where:{id:job.id},data:{status:'CANCELLED'}});await fs.rm(path.resolve(root,job.temporaryPath),{force:true});await recordAudit(req,{action:'DOCUMENT_JOB_CANCELLED',module:'Documentos',targetType:'DocumentProcessingJob',targetId:job.id,detail:job.originalFileName});res.json({jobId:job.id,status:'CANCELLED'});}

type DocumentWithCase=Awaited<ReturnType<typeof loadDocument>>;
const loadDocument=(id:string)=>prisma.document.findFirst({where:{id,deletedAt:null},include:{contractors:true,processingJob:qrFieldInclude,kardexCase:{include:{documents:{where:{deletedAt:null},include:{contractors:true}}}}}});
async function attachRelatedDocuments(row:NonNullable<DocumentWithCase>){const normalizedKardex=normalizeKardex(row.kardexCase?.normalizedKardex??row.kardex);const periodKey=row.kardexCase?.periodKey??kardexPeriodKey({year:row.year??undefined,bienniumStart:row.bienniumStart??undefined,bienniumEnd:row.bienniumEnd??undefined,tomeNumber:row.tomo});const tomeNumber=String(row.kardexCase?.tomeNumber??row.tomo).trim();if(!normalizedKardex)return {...row,relatedDocuments:[]};const candidates=await prisma.document.findMany({where:{id:{not:row.id},deletedAt:null,documentStatus:'CONFIRMED',OR:[...(row.kardexCaseId?[{kardexCaseId:row.kardexCaseId}]:[]),{year:row.year,tomo:row.tomo},{bienniumStart:row.bienniumStart,bienniumEnd:row.bienniumEnd,tomo:row.tomo}]},select:{id:true,displayName:true,documentType:true,kardex:true,minuta:true,escritura:true,tomo:true,year:true,bienniumStart:true,bienniumEnd:true,kardexCase:{select:{normalizedKardex:true,periodKey:true,tomeNumber:true}}}});const relatedDocuments=candidates.filter(candidate=>normalizeKardex(candidate.kardexCase?.normalizedKardex??candidate.kardex)===normalizedKardex&&(candidate.kardexCase?.periodKey??kardexPeriodKey({year:candidate.year??undefined,bienniumStart:candidate.bienniumStart??undefined,bienniumEnd:candidate.bienniumEnd??undefined,tomeNumber:candidate.tomo}))===periodKey&&String(candidate.kardexCase?.tomeNumber??candidate.tomo).trim()===tomeNumber).map(candidate=>({id:candidate.id,filename:candidate.displayName,displayName:candidate.displayName,documentClass:candidate.documentType,documentType:candidate.documentType,registryType:/minuta/i.test(candidate.documentType)?null:candidate.documentType,instrumentNumber:candidate.escritura,minuteNumber:candidate.minuta,kardexNumber:normalizeKardex(candidate.kardexCase?.normalizedKardex??candidate.kardex)}));const hasMinuta=[row,...candidates.filter(candidate=>relatedDocuments.some(item=>item.id===candidate.id))].some(item=>/minuta/i.test(item.documentType));const hasActa=[row,...candidates.filter(candidate=>relatedDocuments.some(item=>item.id===candidate.id))].some(item=>!/minuta/i.test(item.documentType));return {...row,relatedDocuments,relationStatus:hasMinuta&&hasActa?'Relación completa':row.kardexCase?.status};}
export async function listDocuments(req:Request,res:Response){res.setHeader('Cache-Control','no-store');const includeDeleted=req.query.includeDeleted==='true'&&elevated(req.auth!.role);const where=includeDeleted?{}:{deletedAt:null};const take=Math.min(Number(req.query.limit)||50,100);const skip=Math.max(Number(req.query.offset)||0,0);const [rows,total]=await prisma.$transaction([prisma.document.findMany({where,include:{contractors:true,processingJob:qrFieldInclude,kardexCase:{include:{documents:{where:{deletedAt:null},include:{contractors:true}}}}},orderBy:[{createdAt:'desc'},{id:'asc'}],take,skip}),prisma.document.count({where})]);const items=await Promise.all(rows.map(row=>row.deletedAt?Promise.resolve(attachQrMetadata({...row,relatedDocuments:[]})):attachRelatedDocuments(row).then(attachQrMetadata)));const manageableDocumentIds=items.filter(row=>elevated(req.auth!.role)||row.createdBy===req.auth!.userId).map(row=>row.id);res.json({items,total,documents:items,manageableDocumentIds});}
export async function getDocument(req:Request,res:Response){res.setHeader('Cache-Control','no-store');const id=await resolveDocumentId(String(req.params.id));const row=await loadDocument(id);if(!row){const deleted=await prisma.document.findFirst({where:{id,deletedAt:{not:null}},select:{id:true}}).catch(()=>null);if(deleted)throw new HttpError(410,'Este documento fue eliminado.');throw new HttpError(404,'Documento no encontrado.')}res.json({document:attachQrMetadata(await attachRelatedDocuments(row)),canManage:elevated(req.auth!.role)||row.createdBy===req.auth!.userId});}

function editablePeriod(input:Record<string,unknown>){
 const hasYear=input.year!==undefined&&input.year!==null&&String(input.year).trim()!=='';
 const hasBiennium=input.bienniumStart!==undefined||input.bienniumEnd!==undefined;
 if(hasYear&&hasBiennium)throw new HttpError(400,'Indique un año o un bienio, no ambos.');
 if(hasYear){const year=Number(input.year);if(!Number.isInteger(year)||year<1500||year>2200)throw new HttpError(400,'El año no es válido.');return {scope:{year} satisfies DocumentPeriodScope,label:`Año ${year}`,key:String(year),values:{year}}}
 const bienniumStart=Number(input.bienniumStart),bienniumEnd=Number(input.bienniumEnd);
 if(!Number.isInteger(bienniumStart)||!Number.isInteger(bienniumEnd)||bienniumStart<1500||bienniumEnd>2200||bienniumStart>bienniumEnd)throw new HttpError(400,'El bienio no es válido.');
 return {scope:{bienniumStart,bienniumEnd} satisfies DocumentPeriodScope,label:`Bienio ${bienniumStart}-${bienniumEnd}`,key:`${bienniumStart}-${bienniumEnd}`,values:{bienniumStart,bienniumEnd}};
}

export async function updateTomeNumber(req:Request,res:Response){const input=req.body as Record<string,unknown>;const period=editablePeriod(input);const currentTome=requiredTomeNumber(input.currentTome);const newTome=requiredTomeNumber(input.newTome);if(currentTome===newTome)return res.json({updated:0,...period.values,currentTome,newTome,message:'No se realizaron cambios.'});const updated=await moveTomeDocuments(period.scope,currentTome,newTome);if(!updated)throw new HttpError(404,'No se encontraron documentos activos en el tomo indicado.');await recordAudit(req,{action:'TOME_NUMBER_UPDATED',module:'Gestión de Tomos',targetType:'Tome',targetId:`${period.key}:${currentTome}`,detail:`${period.label} · Tomo ${currentTome} → Tomo ${newTome}`,oldValues:{...period.values,tomo:currentTome},newValues:{...period.values,tomo:newTome,documentsUpdated:updated}});res.json({updated,...period.values,currentTome,newTome,message:`${updated} documento(s) movido(s) al Tomo ${newTome}.`})}
export async function updateDocumentTypeGroup(req:Request,res:Response){const input=req.body as Record<string,unknown>;const period=editablePeriod(input);const tome=requiredTomeNumber(input.tome);const currentType=sanitizeDisplayText(input.currentType).trim();const newType=sanitizeDisplayText(input.newType).trim();if(!currentType||!newType)throw new HttpError(400,'El tipo documental actual y el nuevo son obligatorios.');if(currentType===newType)return res.json({updated:0,...period.values,tome,currentType,newType,message:'No se realizaron cambios.'});const updated=await moveDocumentType(period.scope,tome,currentType,newType);if(!updated)throw new HttpError(404,'No se encontraron documentos activos en el tipo documental indicado.');await recordAudit(req,{action:'DOCUMENT_TYPE_GROUP_UPDATED',module:'Gestión de Tomos',targetType:'DocumentType',targetId:`${period.key}:${tome}:${currentType}`,detail:`${period.label} · Tomo ${tome} · ${currentType} → ${newType}`,oldValues:{...period.values,tomo:tome,documentType:currentType},newValues:{...period.values,tomo:tome,documentType:newType,documentsUpdated:updated}});res.json({updated,...period.values,tome,currentType,newType,message:`${updated} documento(s) movido(s) a ${newType}.`})}

export async function updateDocumentMetadata(req:Request,res:Response){
  const id=await resolveDocumentId(String(req.params.id));
  const current=await prisma.document.findFirst({where:{id,deletedAt:null},include:{contractors:true}});
  if(!current)throw new HttpError(404,'Documento no encontrado.');
  assertDocumentManagement(req,current);
  const processingJob=await prisma.documentProcessingJob.findUnique({where:{documentId:id},include:{ocrFields:{where:{fieldName:'qrUrl'},orderBy:{createdAt:'desc'},take:1}}});
  const input=req.body as Record<string,unknown>;
  const has=(key:string)=>Object.prototype.hasOwnProperty.call(input,key);
  const documentType=has('documentType')?sanitizeDisplayText(input.documentType).trim():current.documentType;
  const kardex=has('kardex')?normalizeKardex(input.kardex):normalizeKardex(current.kardex);
  const tomo=has('tomo')?requiredTomeNumber(input.tomo):current.tomo;
  const year=has('year')?(input.year==null||input.year===''?undefined:Number(input.year)):current.year??undefined;
  if(!documentType)throw new HttpError(400,'El tipo documental es obligatorio.');
  if(!kardex)throw new HttpError(400,'El Kardex es obligatorio.');
  if(year!==undefined&&(!Number.isInteger(year)||year<1500||year>2200))throw new HttpError(400,'El año no es válido.');
  const contractors=has('contractors')&&Array.isArray(input.contractors)?input.contractors.map(sanitizeDisplayText).filter(Boolean):current.contractors.map(item=>item.name);
  const escritura=has('escritura')?meta(input.escritura):current.escritura??undefined;
  const printedFolio=has('printedFolio')?(input.printedFolio==null||input.printedFolio===''?undefined:Number(input.printedFolio)):current.printedFolio??current.fojaInitial??undefined;
  if(printedFolio!==undefined&&(!Number.isInteger(printedFolio)||printedFolio<1))throw new HttpError(400,'La foja exacta debe ser un número positivo.');
  const currentQrUrl=normalizeQrUrl(processingJob?.ocrFields[0]?.normalizedValue??processingJob?.ocrFields[0]?.extractedValue);const qrInput=has('qrUrl')?String(input.qrUrl??'').trim():currentQrUrl??'';const qrUrl=qrInput?normalizeQrUrl(qrInput):undefined;if(qrInput&&!qrUrl)throw new HttpError(400,'El enlace del QR debe comenzar con http:// o https:// y contener un dominio válido.');if(has('qrUrl')&&!processingJob)throw new HttpError(409,'Este documento no tiene un proceso de lectura asociado para guardar el QR.');
  const changedKeys=['documentType','year','tomo','printedFolio','escritura','minuta','actoJuridico','kardex','contractors','observations','qrUrl'].filter(has);
  if(!changedKeys.length){const unchanged=await loadDocument(id);if(!unchanged)throw new HttpError(404,'Documento no encontrado.');return res.json({document:attachQrMetadata(await attachRelatedDocuments(unchanged)),message:'No se realizaron cambios.'})}
  const oldValues={documentType:current.documentType,year:current.year,tomo:current.tomo,printedFolio:current.printedFolio,escritura:current.escritura,minuta:current.minuta,actoJuridico:current.actoJuridico,kardex:current.kardex,contractors:current.contractors.map(item=>item.name),observations:current.observations,qrUrl:currentQrUrl};
  const relationChanged=['documentType','year','tomo','kardex','actoJuridico','contractors'].some(has);
  const renameChanged=['documentType','kardex','escritura','contractors'].some(has);
  const existingNames=renameChanged?(await prisma.document.findMany({where:{id:{not:id},deletedAt:null},select:{displayName:true}})).map(row=>row.displayName):[];
  const nextDisplayName=renameChanged?documentDisplayName({documentType,kardex,instrumentNumber:escritura,primaryContractor:contractors[0],existingNames}):current.displayName;
  await prisma.$transaction(async tx=>{
    const oldCaseId=current.kardexCaseId;
    const data:Prisma.DocumentUncheckedUpdateInput={};
    if(renameChanged)data.displayName=nextDisplayName;
    if(has('documentType'))data.documentType=documentType;
    if(has('year')){data.year=year??null;data.biennium=null;data.bienniumStart=null;data.bienniumEnd=null}
    if(has('tomo'))data.tomo=tomo;
    if(has('printedFolio')){data.printedFolio=printedFolio??null;data.fojaInitial=printedFolio??null}
    if(has('escritura'))data.escritura=meta(input.escritura)??null;
    if(has('minuta'))data.minuta=meta(input.minuta)??null;
    if(has('actoJuridico'))data.actoJuridico=meta(input.actoJuridico)??null;
    if(has('kardex'))data.kardex=kardex;
    if(has('observations'))data.observations=meta(input.observations)??null;
    if(relationChanged)data.kardexCaseId=null;
    if(has('contractors')){await tx.documentContractor.deleteMany({where:{documentId:id}});if(contractors.length)await tx.documentContractor.createMany({data:contractors.map((name,position)=>({documentId:id,name,position}))})}
    if(has('qrUrl')&&processingJob){await tx.ocrField.deleteMany({where:{jobId:processingJob.id,fieldName:'qrUrl'}});if(qrUrl)await tx.ocrField.create({data:{jobId:processingJob.id,fieldName:'qrUrl',extractedValue:qrUrl,normalizedValue:qrUrl,confidence:1,requiresReview:false}})}
    await tx.document.update({where:{id},data});
    if(relationChanged){if(oldCaseId)await refreshKardexCaseAfterDeletion(tx,oldCaseId);await associateKardexCase(tx,{documentId:id,kardex,documentType,year,tomeNumber:tomo,legalAct:has('actoJuridico')?meta(input.actoJuridico):current.actoJuridico??undefined,primaryContractor:contractors[0]});if(!has('kardex'))await tx.document.update({where:{id},data:{kardex:current.kardex}})}
  });
  if(has('tomo'))await alignKardexDocumentsToTome(kardex,tomo);
  const updated=await loadDocument(id);if(!updated)throw new HttpError(404,'Documento no encontrado.');
  await recordAudit(req,{action:'DOCUMENT_METADATA_UPDATED',module:'Documentos',targetType:'Document',targetId:id,detail:updated.displayName,oldValues,newValues:{documentType,year,tomo,printedFolio,escritura:updated.escritura,minuta:updated.minuta,actoJuridico:updated.actoJuridico,kardex:updated.kardex,contractors,observations:updated.observations,qrUrl}});
  res.json({document:attachQrMetadata(await attachRelatedDocuments(updated)),message:'Información documental actualizada correctamente.'});
}
export async function streamDocument(req:Request,res:Response){const id=await resolveDocumentId(String(req.params.id));const row=await prisma.document.findFirst({where:{id,deletedAt:null}}).catch(()=>null);if(!row){const deleted=await prisma.document.findFirst({where:{id,deletedAt:{not:null}},select:{id:true}}).catch(()=>null);if(deleted)throw new HttpError(410,'Este documento fue eliminado.');throw new HttpError(404,'Documento no encontrado.')}const file=await resolveDocumentFile(root,row);if(!file)throw new HttpError(404,'El archivo PDF no está disponible en el almacenamiento central.',{code:'DOCUMENT_FILE_NOT_FOUND'});await recordAudit(req,{action:'DOCUMENT_DOWNLOADED',module:'Documentos',targetType:'Document',targetId:row.id,detail:row.displayName,newValues:{storagePath:file.relativePath,resolvedBy:file.foundBy}});res.type(row.mimeType);res.setHeader('Content-Disposition',inlineContentDisposition(row.displayName));res.sendFile(file.absolutePath);}

export async function replaceDocumentFile(req:Request,res:Response){
  const id=await resolveDocumentId(String(req.params.id));const row=await prisma.document.findFirst({where:{id,deletedAt:null}});if(!row)throw new HttpError(404,'Documento no encontrado.');
  assertDocumentManagement(req,row);
  const body=req.body as Buffer;const originalFileName=decodeURIComponent(String(req.get('x-file-name')??'reemplazo.pdf'));
  if(!Buffer.isBuffer(body)||body.length===0)throw new HttpError(400,'El PDF de reemplazo está vacío.');
  if(body.length>env.MAX_PDF_UPLOAD_MB*1024*1024)throw new HttpError(413,`El PDF supera el límite de ${env.MAX_PDF_UPLOAD_MB} MB.`);
  if(req.get('content-type')?.split(';')[0]!=='application/pdf'||body.subarray(0,5).toString()!=='%PDF-')throw new HttpError(400,'El archivo seleccionado no es un PDF válido.');
  const hash=crypto.createHash('sha256').update(body).digest('hex');const duplicate=await prisma.document.findFirst({where:{id:{not:id},fileHash:hash},select:{id:true,displayName:true,deletedAt:true}});if(duplicate)throw new HttpError(409,duplicate.deletedAt?'Ese PDF pertenece a un documento eliminado.':'Ese PDF ya está registrado en otro documento.',{documentId:duplicate.id,displayName:duplicate.displayName});
  const resolved=await resolveDocumentFile(root,row);if(!resolved)throw new HttpError(404,'El archivo actual no está disponible en el almacenamiento central.');
  const replacementPath=`${resolved.absolutePath}.${crypto.randomUUID()}.replacement`;const backupPath=`${resolved.absolutePath}.${crypto.randomUUID()}.backup`;await fs.writeFile(replacementPath,body);
  try{
    await fs.rename(resolved.absolutePath,backupPath);await fs.rename(replacementPath,resolved.absolutePath);
    try{await prisma.document.update({where:{id},data:{originalFileName:sanitizeDisplayText(originalFileName)||'reemplazo.pdf',fileHash:hash,fileSize:body.length,mimeType:'application/pdf',pageCount:pages(body),ocrStatus:'OCR_PENDING'}})}catch(error){await fs.rm(resolved.absolutePath,{force:true});await fs.rename(backupPath,resolved.absolutePath);throw error}
    await fs.rm(backupPath,{force:true});
  }catch(error){await fs.rm(replacementPath,{force:true}).catch(()=>undefined);const backupExists=await fs.stat(backupPath).then(stat=>stat.isFile()).catch(()=>false);if(backupExists){await fs.rm(resolved.absolutePath,{force:true}).catch(()=>undefined);await fs.rename(backupPath,resolved.absolutePath)}throw error}
  await recordAudit(req,{action:'DOCUMENT_FILE_REPLACED',module:'Documentos',targetType:'Document',targetId:id,detail:row.displayName,oldValues:{originalFileName:row.originalFileName,fileHash:row.fileHash,fileSize:row.fileSize,pageCount:row.pageCount},newValues:{originalFileName,fileHash:hash,fileSize:body.length,pageCount:pages(body)}});
  const updated=await loadDocument(id);if(!updated)throw new HttpError(404,'Documento no encontrado después del reemplazo.');res.json({document:attachQrMetadata(await attachRelatedDocuments(updated)),message:'PDF reemplazado correctamente.'});
}

export async function deleteDocument(req:Request,res:Response){
  const id=String(req.params.id);const row=await prisma.document.findUnique({where:{id}});if(!row)throw new HttpError(404,'Documento no encontrado.');
  assertDocumentManagement(req,row);
  if(row.deletedAt||row.documentStatus==='DELETED')throw new HttpError(409,'Este documento ya fue eliminado.');
  const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';if(!reason)throw new HttpError(400,'El motivo de eliminación es obligatorio.');if(reason.length>250)throw new HttpError(400,'El motivo de eliminación no puede superar 250 caracteres.');
  if(['Documento duplicado','Documento incorrecto'].includes(reason)){
    const file=await resolveDocumentFile(root,row);
    const staged=file?`${file.absolutePath}.deleting-${id}`:undefined;
    if(file&&staged)await fs.rename(file.absolutePath,staged);
    let relationStatus:string|undefined;
    try{
      await prisma.$transaction(async tx=>{
        await tx.documentProcessingJob.deleteMany({where:{documentId:id}});
        await tx.document.delete({where:{id}});
        relationStatus=row.kardexCaseId?await refreshKardexCaseAfterDeletion(tx,row.kardexCaseId):undefined;
        await tx.auditEvent.create({data:{userId:req.auth!.userId,action:'DOCUMENT_DELETED',module:'Documentos',targetType:'Document',targetId:id,detail:row.displayName,oldValues:{filename:row.displayName,kardexNumber:row.kardex,documentClass:row.documentType,documentStatus:row.documentStatus},newValues:{deletedByUserId:req.auth!.userId,deletionReason:reason,documentStatus:'DELETED',permanent:true,relationStatus:relationStatus??null}}});
      });
    }catch(error){if(file&&staged)await fs.rename(staged,file.absolutePath).catch(()=>undefined);throw error}
    if(staged)await fs.rm(staged,{force:true});
    res.json({deleted:true,permanent:true,message:'Documento y PDF eliminados. Puede cargar nuevamente el archivo corregido.'});return;
  }
  const result=await prisma.$transaction(async tx=>{const document=await tx.document.update({where:{id},data:{deletedAt:new Date(),deletedBy:req.auth!.userId,deletionReason:reason,documentStatus:'DELETED'}});const relationStatus=row.kardexCaseId?await refreshKardexCaseAfterDeletion(tx,row.kardexCaseId):undefined;return {document,relationStatus}});
  await recordAudit(req,{action:'DOCUMENT_DELETED',module:'Documentos',targetType:'Document',targetId:id,detail:row.displayName,oldValues:{filename:row.displayName,kardexNumber:row.kardex,documentClass:row.documentType,documentStatus:row.documentStatus},newValues:{deletedByUserId:req.auth!.userId,deletionReason:reason,documentStatus:'DELETED',relationStatus:result.relationStatus}});
  res.json({...result,deleted:true,permanent:false,message:'Documento eliminado correctamente.'});
}

export async function listAttentionJobs(req:Request,res:Response){
 const jobs=await prisma.documentProcessingJob.findMany({where:{documentId:null,status:{in:['UPLOADED','QUALITY_ANALYSIS','QUALITY_REVIEW','OCR_PENDING','OCR_PROCESSING','REVIEW_REQUIRED','READY_TO_SAVE','FAILED']},...(elevated(req.auth!.role)?{}:{createdBy:req.auth!.userId})},orderBy:{createdAt:'desc'},take:200,select:{id:true,originalFileName:true,pageCount:true,status:true,errorMessage:true,createdAt:true,createdBy:true}});
 res.json({jobs});
}

export async function startOcr(req:Request,res:Response){const jobId=String(req.params.uploadId);const job=await prisma.documentProcessingJob.findFirst({where:{id:jobId,...(elevated(req.auth!.role)?{}:{createdBy:req.auth!.userId})}});if(!job)throw new HttpError(404,'El trabajo documental no existe.');const queued=await enqueueOcrJob(job.id);await recordAudit(req,{action:'OCR_STARTED',module:'Digitalización',targetType:'DocumentProcessingJob',targetId:job.id,detail:job.originalFileName,newValues:{status:queued.status}});res.json(queued);}

export async function restoreDocument(req:Request,res:Response){const id=String(req.params.id);const row=await prisma.document.findUnique({where:{id}});if(!row)throw new HttpError(404,'Documento no encontrado.');if(!['ADMINISTRADOR','NOTARIO'].includes(req.auth!.role))throw new HttpError(403,'No tiene permiso para restaurar documentos.');const result=await prisma.$transaction(async tx=>{const document=await tx.document.update({where:{id},data:{deletedAt:null,deletedBy:null,deletionReason:null,documentStatus:'CONFIRMED'}});const relationStatus=row.kardexCaseId?await refreshKardexCaseAfterDeletion(tx,row.kardexCaseId):undefined;return {document,relationStatus}});await recordAudit(req,{action:'DOCUMENT_RESTORED',module:'Documentos',targetType:'Document',targetId:id,detail:row.displayName,newValues:{documentStatus:'CONFIRMED',relationStatus:result.relationStatus}});res.json(result);}
