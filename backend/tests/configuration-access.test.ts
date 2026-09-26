import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {hasPermission} from '../../src/data/permissions';

describe('acceso a Configuración',()=>{
 it('permite solamente a Administrador y Notario',()=>{
  expect(hasPermission('Administrador','settings.functional')).toBe(true);
  expect(hasPermission('Notario','settings.functional')).toBe(true);
  expect(hasPermission('Secretaria','settings.functional')).toBe(false);
  expect(hasPermission('Archivador','settings.functional')).toBe(false);
 });
 it('muestra el acceso en el menú para ambos roles',()=>{
  const source=readFileSync(new URL('../../src/components/AppLayout.tsx',import.meta.url),'utf8');
  expect(source).toContain("['Administrador','Notario'].includes(user.role)");
 });
 it('protege también la escritura central para ambos roles',()=>{
  const source=readFileSync(new URL('../src/routes/settings.routes.ts',import.meta.url),'utf8');
  expect(source).toContain('requireRoles(Role.NOTARIO,Role.ADMINISTRADOR)');
 });
});
