import {AuditResult,UserStatus} from '@prisma/client';
import type {NextFunction,Request,Response} from 'express';
import jwt from 'jsonwebtoken';
import {env} from '../config/env.js';
import {prisma} from '../config/prisma.js';
import {recordAudit} from '../services/audit.service.js';
import {hashToken} from '../utils/security.js';

export const SESSION_COOKIE='sigadn_session';

function tokenFrom(req:Request){const authorization=req.get('authorization');return req.cookies?.[SESSION_COOKIE] as string|undefined||(authorization?.startsWith('Bearer ')?authorization.slice(7):undefined)}

export async function authenticate(req:Request,res:Response,next:NextFunction){
  const token=tokenFrom(req);
  if(!token){res.status(401).json({error:'Sesión no válida.'});return}
  try{
    const payload=jwt.verify(token,env.JWT_SECRET) as jwt.JwtPayload;
    const session=await prisma.userSession.findUnique({where:{tokenHash:hashToken(token)},include:{user:true}});
    if(!session||session.id!==payload.sid||session.revokedAt||session.expiresAt<=new Date()||session.user.deletedAt||session.user.status!==UserStatus.ACTIVO){res.status(401).json({error:'La sesión expiró o fue revocada.'});return}
    req.auth={userId:session.user.id,sessionId:session.id,username:session.user.username,role:session.user.role,status:session.user.status};
    await prisma.userSession.update({where:{id:session.id},data:{lastActivityAt:new Date()}});
    next();
  }catch{res.status(401).json({error:'Sesión no válida.'})}
}

export function requireRoles(...roles:NonNullable<Request['auth']>['role'][]){
  return async(req:Request,res:Response,next:NextFunction)=>{
    if(req.auth&&roles.includes(req.auth.role)){next();return}
    await recordAudit(req,{action:'UNAUTHORIZED_ACCESS',module:'Seguridad',detail:`${req.method} ${req.originalUrl}`,result:AuditResult.DENEGADO}).catch(()=>undefined);
    res.status(403).json({error:'No tiene permiso para realizar esta acción.'});
  };
}
