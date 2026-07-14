import {Role} from '@prisma/client';
import {describe,expect,it} from 'vitest';
import {publicRegisterSchema} from '../src/schemas/auth.schemas.js';

const valid={fullName:'María Torres',email:'maria@notaria.pe',password:'Segura-2026!',confirmPassword:'Segura-2026!',requestedRole:Role.SECRETARIA};

describe('registro público',()=>{
  it('acepta únicamente los roles habilitados para solicitud',()=>{
    const parsed=publicRegisterSchema.parse(valid);
    expect(parsed.requestedRole).toBe(Role.SECRETARIA);
    expect(parsed).not.toHaveProperty('username');
    expect(publicRegisterSchema.safeParse({...valid,requestedRole:Role.ADMINISTRADOR}).success).toBe(true);
    expect(publicRegisterSchema.safeParse({...valid,requestedRole:Role.ARCHIVADOR}).success).toBe(true);
    expect(publicRegisterSchema.safeParse({...valid,requestedRole:Role.NOTARIO}).success).toBe(false);
    expect(publicRegisterSchema.safeParse({...valid,requestedRole:Role.AUDITOR}).success).toBe(false);
  });

  it('rechaza contraseñas que no coinciden',()=>{
    expect(publicRegisterSchema.safeParse({...valid,confirmPassword:'Otra-2026!'}).success).toBe(false);
  });
});
