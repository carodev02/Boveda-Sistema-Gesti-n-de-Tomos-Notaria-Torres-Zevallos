import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {Request,Response} from 'express';
import {prisma} from '../config/prisma.js';
import {env} from '../config/env.js';
import {recordAudit} from '../services/audit.service.js';
import {HttpError} from '../utils/http.js';

const root=path.resolve(env.STORAGE_ROOT);
const tempRoot=path.join(root,'temp');
const safe=(value:string)=>value.replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-|-$/g,'')||'sin-clasificar';
const pages=(buffer:Buffer)=>Math.max(1,(buffer.toString('latin1').match(/\/Type\s*\/Page(?:\s|\/|>)/g)??[]).length);
const meta=(value:unknown)=>typeof value==='string'?value.trim():undefined;

export async function uploadDocument(req:Request,res:Response){
  const body=req.body as Buffer;
  if(!Buffer.isBuffer(body)||body.length===0)throw new HttpError(400,'El archivo PDF está vacío.');
  if(body.length>50*1024*1024)throw new HttpError(413,'El PDF supera el límite de 50 MB.');
  if(req.get('content-type')?.split(';')[0]!=='application/pdf')throw new HttpError(415,'Solo se permiten archivos PDF.');
  if(body.subarray(0,5).toString()!=='%PDF-')throw new HttpError(400,'El archivo no es un PDF válido.');
  await fs.mkdir(tempRoot,{recursive:true});
  const uploadId=crypto.randomUUID();
  const hash=crypto.createHash('sha256').update(body).digest('hex');
  const tempPath=path.join(tempRoot,`${uploadId}.pdf`);
  await fs.writeFile(tempPath,body);
  res.status(201).json({uploadId,hash,size:body.length,mimeType:'application/pdf',pageCount:pages(body),tempPath});
}

export async function confirmDocument(req:Request,res:Response){
  const uploadId=String(req.params.uploadId);const input=req.body as Record<string,unknown>;
  const tempPath=path.join(tempRoot,`${uploadId}.pdf`);const body=await fs.readFile(tempPath).catch(()=>null);
  if(!body)throw new HttpError(404,'La carga temporal no existe o expiró.');
  const hash=crypto.createHash('sha256').update(body).digest('hex');
  const existing=await prisma.document.findFirst({where:{fileHash:hash,deletedAt:null}});if(existing)throw new HttpError(409,'Este PDF ya está registrado.');
  const documentId=crypto.randomUUID();const storageName=`${documentId}.pdf`;
  const documentType=safe(String(input.documentType??'sin-clasificar'));const period=safe(String(input.year??input.biennium??'sin-periodo'));const tomo=safe(String(input.tomo??'sin-tomo'));
  const relative=path.join('documents',documentType,period,`tomo-${tomo}`,storageName);const finalPath=path.join(root,relative);await fs.mkdir(path.dirname(finalPath),{recursive:true});await fs.rename(tempPath,finalPath);
  const contractors=Array.isArray(input.contractors)?input.contractors.map(String).filter(Boolean):[];
  const originalFileName=String(input.originalFileName??'documento.pdf');const displayName=String(input.displayName??originalFileName);
  const created=await prisma.document.create({data:{id:documentId,displayName,originalFileName,storageName,filePath:relative,fileHash:hash,fileSize:body.length,mimeType:'application/pdf',pageCount:Number(input.pageCount)||pages(body),documentMode:String(input.documentMode??'actual'),documentType:String(input.documentType??'Sin clasificar'),year:input.year?Number(input.year):undefined,biennium:meta(input.biennium),tomo:String(input.tomo??''),fojaInitial:input.fojaInitial?Number(input.fojaInitial):undefined,fojaFinal:input.fojaFinal?Number(input.fojaFinal):undefined,escritura:meta(input.escritura),kardex:meta(input.kardex),minuta:meta(input.minuta),actoJuridico:meta(input.actoJuridico),documentDate:meta(input.documentDate),observations:meta(input.observations),ocrConfidence:input.ocrConfidence?Number(input.ocrConfidence):undefined,documentStatus:String(input.documentStatus??'Validado'),ocrStatus:String(input.ocrStatus??'Procesado'),createdBy:req.auth!.userId,contractors:{create:contractors.map((name,position)=>({name,position}))}} ,include:{contractors:true}});
  await recordAudit(req,{action:'DOCUMENT_CREATED',module:'Documentos',targetType:'Document',targetId:created.id,detail:created.displayName,newValues:{filePath:created.filePath,fileHash:created.fileHash,pageCount:created.pageCount}});
  res.status(201).json({document:created,message:'Documento registrado correctamente'});
}

export async function listDocuments(req:Request,res:Response){const rows=await prisma.document.findMany({where:{deletedAt:null},include:{contractors:true},orderBy:{createdAt:'desc'},take:Math.min(Number(req.query.limit)||50,100),skip:Math.max(Number(req.query.offset)||0,0)});res.json({documents:rows});}
export async function getDocument(req:Request,res:Response){const row=await prisma.document.findFirst({where:{id:String(req.params.id),deletedAt:null},include:{contractors:true}});if(!row)throw new HttpError(404,'Documento no encontrado.');res.json({document:row});}
export async function streamDocument(req:Request,res:Response){const row=await prisma.document.findFirst({where:{id:String(req.params.id),deletedAt:null}});if(!row)throw new HttpError(404,'Documento no encontrado.');res.type(row.mimeType);res.setHeader('Content-Disposition',`inline; filename="${row.originalFileName.replace(/"/g,'')}"`);res.sendFile(path.resolve(root,row.filePath));}
