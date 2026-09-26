import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const controller=readFileSync(new URL('../src/controllers/documents.controller.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../src/routes/documents.routes.ts',import.meta.url),'utf8');
const viewer=readFileSync(new URL('../../src/pages/Visor.tsx',import.meta.url),'utf8');
const tomes=readFileSync(new URL('../../src/pages/Tomos.tsx',import.meta.url),'utf8');

describe('propiedad y acceso a documentos',()=>{
 it('todos pueden listar y visualizar los documentos',()=>{expect(routes).toContain("documentsRouter.get('/',asyncHandler(listDocuments))");expect(routes).toContain("documentsRouter.get('/:id',asyncHandler(getDocument))")});
 it('solo propietario, Administrador o Notario pueden modificar',()=>{expect(controller).toContain("document.createdBy!==req.auth!.userId");expect(controller).toContain('assertDocumentManagement(req,current)');expect(controller).toContain('assertDocumentManagement(req,row)')});
 it('comunica al visor cuáles documentos puede gestionar',()=>{expect(controller).toContain('manageableDocumentIds');expect(viewer).toContain('canManageRemoteDocument(document,sessionUser?.role)');expect(viewer).toContain('viewingReadOnlyDocument')});
 it('reserva cambios globales de tomos para Administrador y Notario',()=>{expect(routes).toContain("'/tomes/number',requireRoles(Role.ADMINISTRADOR,Role.NOTARIO)");expect(tomes).toContain("user?.role==='Administrador'||user?.role==='Notario'")});
});
