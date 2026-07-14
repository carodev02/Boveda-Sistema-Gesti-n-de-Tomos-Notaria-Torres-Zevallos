import crypto from 'node:crypto';
import {AuditResult,UserStatus} from '@prisma/client';
import type {Request,Response} from 'express';
import jwt from 'jsonwebtoken';
import {env} from '../config/env.js';
import {prisma} from '../config/prisma.js';
import {SESSION_COOKIE} from '../middlewares/auth.middleware.js';
import {changePasswordSchema,loginSchema,publicRegisterSchema} from '../schemas/auth.schemas.js';
import {recordAudit} from '../services/audit.service.js';
import {HttpError} from '../utils/http.js';
import {publicUser} from '../utils/user-dto.js';
import {hashPassword,hashToken,verifyPassword} from '../utils/security.js';

const cookieOptions={httpOnly:true,sameSite:'lax' as const,secure:env.COOKIE_SECURE,path:'/',maxAge:env.SESSION_EXPIRATION_HOURS*3600000};

export async function register(req:Request,res:Response){
  const input=publicRegisterSchema.parse(req.body);
  const created=await prisma.user.create({data:{fullName:input.fullName,email:input.email.toLowerCase(),passwordHash:await hashPassword(input.password),role:input.requestedRole,status:UserStatus.PENDIENTE,passwordResetRequired:false}});
  await recordAudit(req,{userId:null,action:'USER_CREATED',module:'Autenticación',targetType:'User',targetId:created.id,newValues:{email:created.email,requestedRole:created.role,status:created.status}});
  await recordAudit(req,{userId:null,action:'USER_ROLE_REQUESTED',module:'Autenticación',targetType:'User',targetId:created.id,newValues:{requestedRole:created.role}});
  res.status(201).json({message:'Tu cuenta fue creada y está pendiente de aprobación.'});
}

export async function login(req:Request,res:Response){
  const input=loginSchema.parse(req.body);
  const identity=input.email.toLowerCase();
  const user=await prisma.user.findUnique({where:{email:identity}});
  if(!user||user.deletedAt){await recordAudit(req,{userId:null,action:'LOGIN_FAILED',module:'Autenticación',detail:identity,result:AuditResult.ERROR});throw new HttpError(401,'Correo o contraseña incorrectos.');}
  if(!await verifyPassword(input.password,user.passwordHash)){
    const failed=user.failedLoginAttempts+1;const blocked=failed>=env.MAX_FAILED_LOGIN_ATTEMPTS;
    await prisma.user.update({where:{id:user.id},data:{failedLoginAttempts:failed,status:blocked?UserStatus.BLOQUEADO:undefined}});
    await recordAudit(req,{userId:user.id,action:'LOGIN_FAILED',module:'Autenticación',detail:blocked?'Cuenta bloqueada por intentos fallidos':undefined,result:AuditResult.ERROR});
    throw new HttpError(401,blocked?'La cuenta fue bloqueada por intentos fallidos.':'Correo o contraseña incorrectos.');
  }
  if(user.status===UserStatus.BLOQUEADO){await recordAudit(req,{userId:user.id,action:'LOGIN_BLOCKED',module:'Autenticación',result:AuditResult.DENEGADO});throw new HttpError(423,'La cuenta está bloqueada.');}
  if(user.status!==UserStatus.ACTIVO)throw new HttpError(403,'La cuenta no está activa.');
  const sessionId=crypto.randomUUID();const expiresAt=new Date(Date.now()+env.SESSION_EXPIRATION_HOURS*3600000);
  const token=jwt.sign({sid:sessionId},env.JWT_SECRET,{subject:user.id,expiresIn:env.SESSION_EXPIRATION_HOURS*3600});
  await prisma.$transaction([
    prisma.user.update({where:{id:user.id},data:{lastAccessAt:new Date(),failedLoginAttempts:0}}),
    prisma.userSession.create({data:{id:sessionId,userId:user.id,tokenHash:hashToken(token),ipAddress:req.ip,userAgent:req.get('user-agent'),expiresAt}})
  ]);
  res.cookie(SESSION_COOKIE,token,cookieOptions);
  await recordAudit(req,{userId:user.id,action:'LOGIN_SUCCESS',module:'Autenticación'});
  res.json({user:publicUser({...user,lastAccessAt:new Date()})});
}

export async function logout(req:Request,res:Response){await prisma.userSession.update({where:{id:req.auth!.sessionId},data:{revokedAt:new Date()}});await recordAudit(req,{action:'LOGOUT',module:'Autenticación'});res.clearCookie(SESSION_COOKIE,{...cookieOptions,maxAge:undefined});res.status(204).send()}
export async function me(req:Request,res:Response){const user=await prisma.user.findUniqueOrThrow({where:{id:req.auth!.userId}});res.json({user:publicUser(user)})}
export async function changePassword(req:Request,res:Response){const input=changePasswordSchema.parse(req.body);const user=await prisma.user.findUniqueOrThrow({where:{id:req.auth!.userId}});if(!await verifyPassword(input.currentPassword,user.passwordHash))throw new HttpError(400,'La contraseña actual no es correcta.');await prisma.$transaction([prisma.user.update({where:{id:user.id},data:{passwordHash:await hashPassword(input.newPassword),passwordResetRequired:false,tempPasswordExpiresAt:null}}),prisma.userSession.updateMany({where:{userId:user.id,id:{not:req.auth!.sessionId}},data:{revokedAt:new Date()}})]);await recordAudit(req,{action:'PASSWORD_CHANGED',module:'Seguridad'});res.status(204).send()}
export async function sessions(req:Request,res:Response){const rows=await prisma.userSession.findMany({where:{userId:req.auth!.userId,revokedAt:null,expiresAt:{gt:new Date()}},orderBy:{lastActivityAt:'desc'}});res.json(rows.map(row=>({...row,current:row.id===req.auth!.sessionId,tokenHash:undefined}))) }
export async function revokeSession(req:Request,res:Response){const session=await prisma.userSession.findFirst({where:{id:String(req.params.id),userId:req.auth!.userId}});if(!session)throw new HttpError(404,'Sesión no encontrada.');await prisma.userSession.update({where:{id:session.id},data:{revokedAt:new Date()}});await recordAudit(req,{action:'SESSION_REVOKED',module:'Seguridad',targetType:'UserSession',targetId:session.id});res.status(204).send()}
export async function revokeOtherSessions(req:Request,res:Response){await prisma.userSession.updateMany({where:{userId:req.auth!.userId,id:{not:req.auth!.sessionId},revokedAt:null},data:{revokedAt:new Date()}});await recordAudit(req,{action:'OTHER_SESSIONS_REVOKED',module:'Seguridad'});res.status(204).send()}
