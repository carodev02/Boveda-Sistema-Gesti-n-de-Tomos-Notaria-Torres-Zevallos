import type {Request,Response} from 'express';
import {prisma} from '../config/prisma.js';
import {profileSchema} from '../schemas/user.schemas.js';
import {recordAudit} from '../services/audit.service.js';
import {publicUser} from '../utils/user-dto.js';

export async function getProfile(req:Request,res:Response){const user=await prisma.user.findUniqueOrThrow({where:{id:req.auth!.userId}});res.json(publicUser(user))}
export async function updateProfile(req:Request,res:Response){const input=profileSchema.parse(req.body);const previous=await prisma.user.findUniqueOrThrow({where:{id:req.auth!.userId}});const updated=await prisma.user.update({where:{id:previous.id},data:{fullName:input.fullName,email:input.email.toLowerCase(),phone:input.phone||null}});await recordAudit(req,{action:'PROFILE_UPDATED',module:'Perfil',targetType:'User',targetId:updated.id,oldValues:{fullName:previous.fullName,email:previous.email,phone:previous.phone},newValues:{fullName:updated.fullName,email:updated.email,phone:updated.phone}});res.json(publicUser(updated))}
