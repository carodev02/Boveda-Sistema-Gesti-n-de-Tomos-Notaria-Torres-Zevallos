import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const css=readFileSync(new URL('../../src/pages/documents.css',import.meta.url),'utf8');
const component=readFileSync(new URL('../../src/pages/Documentos.tsx',import.meta.url),'utf8');

describe('columna fija de acciones documentales',()=>{
  it('mantiene encabezado y celdas pegados al extremo derecho',()=>{expect(css).toContain('.documentsTable th:last-child,.documentsTable td:last-child{position:sticky;right:0');expect(css).toContain('min-width:150px');expect(css).toContain('border-left:1px solid var(--border)')});
  it('reserva espacio para Ver PDF y el menú compacto',()=>{expect(css).toContain('min-width:91px');expect(component).toContain('Ver PDF');expect(component).toContain('aria-label="Más acciones"')});
  it('limita Eliminar documento a Notario y Administrador',()=>{expect(component).toContain("user?.role==='Notario'||user?.role==='Administrador'");expect(component).toContain('canDelete&&<button className="dangerItem"')});
  it('mantiene conectado el modal con motivo obligatorio',()=>{expect(component).toContain('id="delete-document-title"');expect(component).toContain('Motivo de eliminación *');expect(component).toContain('softDeleteDocument(selected.id,finalReason)')});
});
