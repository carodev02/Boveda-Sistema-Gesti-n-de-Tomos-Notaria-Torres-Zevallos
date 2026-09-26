import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('actividad reciente del Dashboard',()=>{
 it('expone cinco acciones respetando el alcance del usuario',()=>{
  const controller=readFileSync(new URL('../src/controllers/audit.controller.ts',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../src/routes/audit.routes.ts',import.meta.url),'utf8');
  expect(controller).toContain("global?{}:{userId:req.auth!.userId}");
  expect(controller).toContain('take:5');
  expect(routes.indexOf("auditRouter.get('/recent'")).toBeLessThan(routes.indexOf('auditRouter.use(authenticate,requireRoles'));
 });
});
