import {Role} from '@prisma/client';
import {z} from 'zod';

export const loginSchema=z.object({email:z.email(),password:z.string().min(8).max(200)});
const passwordPolicy=z.string().min(8).max(200).regex(/[A-Z]/,'Debe contener una letra mayúscula.').regex(/[a-z]/,'Debe contener una letra minúscula.').regex(/\d/,'Debe contener un número.');
export const changePasswordSchema=z.object({currentPassword:z.string().min(1),newPassword:passwordPolicy});
export const publicRegisterSchema=z.object({
  fullName:z.string().trim().min(2).max(160),
  email:z.email(),
  password:z.string().min(8).max(200).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[^A-Za-z0-9]/),
  confirmPassword:z.string(),
  requestedRole:z.enum([Role.ADMINISTRADOR,Role.SECRETARIA,Role.ARCHIVADOR])
}).refine(value=>value.password===value.confirmPassword,{path:['confirmPassword'],message:'Las contraseñas no coinciden.'});
