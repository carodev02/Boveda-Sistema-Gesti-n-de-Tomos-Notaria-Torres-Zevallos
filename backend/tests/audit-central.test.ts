import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const routes=readFileSync(new URL('../src/routes/audit.routes.ts',import.meta.url),'utf8');
const documents=readFileSync(new URL('../src/controllers/documents.controller.ts',import.meta.url),'utf8');
const auth=readFileSync(new URL('../src/controllers/auth.controller.ts',import.meta.url),'utf8');

describe('auditoría central',()=>{
  it('protege la lectura en backend para Notario y Administrador',()=>{
    expect(routes).toContain('requireRoles(Role.ADMINISTRADOR,Role.NOTARIO)');
    expect(routes.indexOf("post('/events',authenticate")).toBeLessThan(routes.indexOf('requireRoles(Role.ADMINISTRADOR,Role.NOTARIO)'));
  });
  it('registra el ciclo documental crítico',()=>{
    for(const action of ['DOCUMENT_UPLOAD_COMPLETED','OCR_STARTED','OCR_COMPLETED','DOCUMENT_REVIEW_CONFIRMED','DOCUMENT_CREATED','DOCUMENT_DOWNLOADED','DOCUMENT_DELETED'])expect(documents).toContain(action);
  });
  it('registra inicio y cierre de sesión',()=>{
    expect(auth).toContain("action:'LOGIN_SUCCESS'");
    expect(auth).toContain("action:'LOGOUT'");
  });
});
