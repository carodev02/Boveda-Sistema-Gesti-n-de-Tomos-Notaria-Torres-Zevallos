import {Role,UserStatus} from '@prisma/client';
import {z} from 'zod';

const reason=z.string().trim().min(3).max(500);
export const profileSchema=z.object({fullName:z.string().trim().min(2).max(160),email:z.email(),phone:z.string().trim().max(40).nullable().optional()}).strict();
export const createUserSchema=z.object({username:z.string().trim().min(3).max(100),fullName:z.string().trim().min(2).max(160),email:z.email(),phone:z.string().trim().max(40).optional(),role:z.enum(Role),status:z.enum(UserStatus).default(UserStatus.PENDIENTE),reason:z.string().trim().min(3).max(500).default('Creación autorizada')});
export const updateUserSchema=z.object({fullName:z.string().trim().min(2).max(160).optional(),email:z.email().optional(),phone:z.string().trim().max(40).nullable().optional()}).strict();
export const reasonSchema=z.object({reason});
export const changeRoleSchema=z.object({role:z.enum(Role),reason});
