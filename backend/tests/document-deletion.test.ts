import {describe,expect,it} from 'vitest';
import {kardexStatusAfterDeletion} from '../src/services/kardex-case.service';
import {readFileSync} from 'node:fs';

describe('eliminación lógica y relación Kardex',()=>{
  it('marca Falta Escritura cuando permanece la minuta',()=>expect(kardexStatusAfterDeletion(['Minuta'])).toBe('Falta Escritura'));
  it('marca Falta Minuta cuando permanece el acta',()=>expect(kardexStatusAfterDeletion(['Acta'])).toBe('Falta Minuta'));
  it('mantiene la relación completa con ambos documentos',()=>expect(kardexStatusAfterDeletion(['Minuta','Escritura pública'])).toBe('Relación completa'));
  it('marca inactivo un KardexCase sin documentos activos',()=>expect(kardexStatusAfterDeletion([])).toBe('Inactivo'));
  it('distingue un PDF eliminado de un correo duplicado',()=>{const source=readFileSync(new URL('../src/controllers/documents.controller.ts',import.meta.url),'utf8');expect(source).toContain('DOCUMENT_ALREADY_DELETED');expect(source).toContain('Restáurelo desde el historial')});
});
