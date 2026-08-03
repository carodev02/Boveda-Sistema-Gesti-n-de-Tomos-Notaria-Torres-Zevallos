import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {changePasswordSchema} from '../src/schemas/auth.schemas.js';
import {profileSchema} from '../src/schemas/user.schemas.js';

describe('perfil autenticado',()=>{
  it('acepta nombre, correo y teléfono reales y rechaza propiedades ajenas al perfil',()=>{
    expect(profileSchema.parse({fullName:'María Torres',email:'maria@notaria.pe',phone:'999888777'})).toMatchObject({phone:'999888777'});
    expect(profileSchema.safeParse({fullName:'María Torres',email:'maria@notaria.pe',role:'NOTARIO'}).success).toBe(false);
  });
  it('aplica la misma política de contraseña de la interfaz',()=>{
    expect(changePasswordSchema.safeParse({currentPassword:'Actual-2026!',newPassword:'Nueva-2026!'}).success).toBe(true);
    expect(changePasswordSchema.safeParse({currentPassword:'Actual-2026!',newPassword:'Nueva2026'}).success).toBe(false);
  });
  it('el backend limita perfil al usuario autenticado y audita cambios',()=>{
    const routes=readFileSync(new URL('../src/routes/profile.routes.ts',import.meta.url),'utf8');
    const controller=readFileSync(new URL('../src/controllers/profile.controller.ts',import.meta.url),'utf8');
    expect(routes).toContain('profileRouter.use(authenticate)');
    expect(controller).toContain('where:{id:req.auth!.userId}');
    expect(controller).toContain("action:'PROFILE_UPDATED'");
  });
  it('audita la contraseña actual incorrecta sin registrar secretos',()=>{
    const controller=readFileSync(new URL('../src/controllers/auth.controller.ts',import.meta.url),'utf8');
    expect(controller).toContain("action:'PASSWORD_CHANGE_REJECTED'");
    expect(controller).not.toContain('oldValues:{password');
    expect(controller).not.toContain('newValues:{password');
  });
});
