import {Prisma} from '@prisma/client';
import type {NextFunction,Request,Response} from 'express';
import {ZodError} from 'zod';
import {HttpError} from '../utils/http.js';

export function notFound(req:Request,res:Response){res.status(404).json({error:`Ruta no encontrada: ${req.method} ${req.path}`})}
export function errorHandler(error:unknown,_req:Request,res:Response,next:NextFunction){
  void next;
  if(error instanceof ZodError){res.status(400).json({error:'Datos inválidos.',details:error.issues});return}
  if(error instanceof HttpError){res.status(error.status).json({error:error.message,details:error.details});return}
  const prismaCode=typeof error==='object'&&error!==null&&'code' in error?String(error.code):undefined;
  if((error instanceof Prisma.PrismaClientKnownRequestError||prismaCode==='P2002')&&prismaCode==='P2002'){const meta=typeof error==='object'&&error!==null&&'meta' in error?error.meta as {target?:unknown}:undefined;const target=Array.isArray(meta?.target)?meta.target.map(String).join(','):String(meta?.target??'');const message=/fileHash/i.test(target)?'Este PDF ya está registrado.':/storageName/i.test(target)?'Ya existe un archivo con ese identificador.':/username/i.test(target)&&/email/i.test(target)?'El usuario o correo ya está registrado.':/username/i.test(target)?'El nombre de usuario ya está registrado.':'El correo ya está registrado.';res.status(409).json({error:message,details:{code:'UNIQUE_CONSTRAINT',target}});return}
  console.error(error);res.status(500).json({error:'Error interno del servidor.'});
}
