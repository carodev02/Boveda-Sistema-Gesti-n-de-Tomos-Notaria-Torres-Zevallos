import {Role,UserStatus} from '@prisma/client';
import type {Request,Response} from 'express';
import {prisma} from '../config/prisma.js';

export async function listAudit(req:Request,res:Response){
  const global=([Role.NOTARIO,Role.ADMINISTRADOR] as Role[]).includes(req.auth!.role);
  const from=req.query.from?new Date(String(req.query.from)):undefined;const to=req.query.to?new Date(String(req.query.to)):undefined;
  const rows=await prisma.auditEvent.findMany({where:{
    ...(!global?{userId:req.auth!.userId}:{}),...(req.query.userId?{userId:String(req.query.userId)}:{}),
    ...(req.query.action?{action:String(req.query.action)}:{}),...(req.query.module?{module:String(req.query.module)}:{}),
    ...(req.query.result?{result:String(req.query.result) as 'EXITOSO'|'ERROR'|'DENEGADO'}:{}),
    ...((from||to)?{createdAt:{gte:from,lte:to}}:{})
  },include:{user:{select:{username:true,email:true,fullName:true,role:true,status:true,deletedAt:true}}},orderBy:{createdAt:'desc'},take:500});
  res.json(rows);
}
export async function auditStats(_req:Request,res:Response){const activeUsers=await prisma.user.count({where:{status:UserStatus.ACTIVO,deletedAt:null}});res.json({activeUsers})}
export async function getAudit(req:Request,res:Response){const event=await prisma.auditEvent.findUniqueOrThrow({where:{id:String(req.params.id)},include:{user:{select:{username:true,email:true,fullName:true,role:true,status:true,deletedAt:true}}}});if(!([Role.NOTARIO,Role.ADMINISTRADOR] as Role[]).includes(req.auth!.role)&&event.userId!==req.auth!.userId){res.status(403).json({error:'No puede consultar actividad de otros usuarios.'});return}res.json(event)}
