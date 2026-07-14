import {AuditResult,Prisma} from '@prisma/client';
import type {Request} from 'express';
import {prisma} from '../config/prisma.js';
import {clientIp} from '../utils/http.js';

type AuditInput={action:string;module:string;targetType?:string;targetId?:string;detail?:string;oldValues?:unknown;newValues?:unknown;result?:AuditResult;userId?:string|null};
const json=(value:unknown)=>value===undefined?undefined:value as Prisma.InputJsonValue;

export function recordAudit(req:Request,input:AuditInput){
  return prisma.auditEvent.create({data:{
    userId:input.userId===undefined?req.auth?.userId:input.userId,
    action:input.action,module:input.module,targetType:input.targetType,targetId:input.targetId,
    detail:input.detail,oldValues:json(input.oldValues),newValues:json(input.newValues),
    ipAddress:clientIp(req),userAgent:req.get('user-agent'),result:input.result??AuditResult.EXITOSO
  }});
}
