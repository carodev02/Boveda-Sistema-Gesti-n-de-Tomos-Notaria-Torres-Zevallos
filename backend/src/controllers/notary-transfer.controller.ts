import {Role,UserStatus} from '@prisma/client';
import type {Request,Response} from 'express';
import {prisma} from '../config/prisma.js';
import {reasonSchema} from '../schemas/user.schemas.js';
import {recordAudit} from '../services/audit.service.js';
import {HttpError} from '../utils/http.js';

export async function transferNotary(req:Request,res:Response){
  const {reason}=reasonSchema.parse(req.body);const nextId=String(req.params.id);if(!reason)throw new HttpError(400,'El motivo es obligatorio para transferir el rol de Notario.');
  const next=await prisma.user.findUnique({where:{id:nextId}});if(!next||next.deletedAt)throw new HttpError(404,'Usuario no encontrado.');
  if(next.status!==UserStatus.ACTIVO)throw new HttpError(409,'El nuevo Notario debe estar activo.');
  const current=await prisma.user.findFirst({where:{role:Role.NOTARIO,status:UserStatus.ACTIVO,deletedAt:null}});if(!current)throw new HttpError(409,'No existe un Notario activo para transferir.');if(current.id===next.id)throw new HttpError(409,'El usuario seleccionado ya es el Notario activo.');
  await recordAudit(req,{action:'NOTARY_ROLE_TRANSFER_STARTED',module:'Usuarios',targetType:'User',targetId:next.id,detail:reason,oldValues:{userId:current.id,role:current.role},newValues:{userId:next.id,role:Role.NOTARIO}});
  try{await prisma.$transaction(async tx=>{await tx.user.update({where:{id:current.id},data:{role:Role.ADMINISTRADOR}});await tx.user.update({where:{id:next.id},data:{role:Role.NOTARIO}})});await recordAudit(req,{action:'NOTARY_ROLE_TRANSFERRED',module:'Usuarios',targetType:'User',targetId:next.id,detail:reason,oldValues:{userId:current.id,role:Role.NOTARIO},newValues:{userId:next.id,role:Role.NOTARIO}});res.json({ok:true})}catch(error){await recordAudit(req,{action:'NOTARY_ROLE_TRANSFER_FAILED',module:'Usuarios',targetType:'User',targetId:next.id,detail:reason,result:'ERROR'}).catch(()=>undefined);throw error}
}
