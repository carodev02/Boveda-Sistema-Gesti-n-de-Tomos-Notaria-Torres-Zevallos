import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const controller=readFileSync(new URL('../src/controllers/documents.controller.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../src/routes/documents.routes.ts',import.meta.url),'utf8');
const viewer=readFileSync(new URL('../../src/pages/Visor.tsx',import.meta.url),'utf8');

describe('reemplazo seguro del PDF de un documento',()=>{
  it('permite reemplazar al propietario y valida el permiso en el controlador',()=>{expect(routes).toContain("documentsRouter.put('/:id/file',expressRaw,asyncHandler(replaceDocumentFile))");expect(controller).toContain('assertDocumentManagement(req,row)')});
  it('valida firma PDF, tamaño y duplicados',()=>{expect(controller).toContain("body.subarray(0,5).toString()!=='%PDF-'");expect(controller).toContain('env.MAX_PDF_UPLOAD_MB');expect(controller).toContain('fileHash:hash')});
  it('conserva el nombre visible y registra auditoría',()=>{expect(controller).toContain("action:'DOCUMENT_FILE_REPLACED'");expect(controller).not.toContain('data:{displayName:originalFileName,fileHash:hash')});
  it('ofrece el botón en el visor y recarga el archivo',()=>{expect(viewer).toContain("button.textContent='Reemplazar PDF'");expect(viewer).toContain('replaceRemotePdf(document.backendId!,file)');expect(viewer).toContain('setDocument(updated)')});
});
