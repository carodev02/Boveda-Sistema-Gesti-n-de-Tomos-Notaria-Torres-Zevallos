import {describe,expect,it} from 'vitest';
import {buildTomeHierarchy} from '../../src/services/tomeHierarchy';
import type {DocumentRecord} from '../../src/data/repository';
const document=(values:Partial<DocumentRecord>):DocumentRecord=>({id:1,documentMode:'actual',tipo:'Minuta',ano:2026,tomo:'80',numeroMinuta:'',actoJuridico:'',kardex:'41245',escritura:'',contratantes:[],observaciones:'',fecha:'',fechaRegistro:'2026-07-20T00:00:00Z',cantidadPaginas:1,documento:'CONFIRMED',ocr:'PROCESSED',fileName:'K-41245.pdf',fileSize:1,file:new Blob(),source:'manual',...values});
describe('distribución visual de Gestión de Tomos',()=>{
 it('muestra Año, Tomo, Minuta y PDF sin nodo Kardex adicional',()=>{const groups=buildTomeHierarchy([document({})]);const tome=groups[0].tomes[0];expect(groups[0].label).toBe('Año 2026');expect(tome.label).toBe('Tomo 80');expect(tome.categories[0].name).toBe('Minuta');expect(tome.categories[0].documents[0].label).toBe('K-41245.pdf')});
 it('mantiene Acta y Minuta como categorías del mismo tomo',()=>{const groups=buildTomeHierarchy([document({id:1}),document({id:2,tipo:'Acta',fileName:'DON NARCISO ZUÑIGA CHAVEZ - KARDEX 41245.pdf',contratantes:['DON NARCISO ZUÑIGA CHAVEZ']})]);expect(groups[0].tomes[0].categories.map(item=>item.name)).toEqual(['Minuta','Acta'])});
 it('muestra juntos documentos de Kardex diferentes sin perder sus filas',()=>{const groups=buildTomeHierarchy([document({id:1,kardex:'41245'}),document({id:2,kardex:'41246',fileName:'K-41246.pdf'})]);expect(groups[0].tomes[0].categories[0].documents.map(item=>item.label)).toEqual(['K-41245.pdf','K-41246.pdf'])});
 it('conserva separados los tomos',()=>{const groups=buildTomeHierarchy([document({id:1,tomo:'80'}),document({id:2,tomo:'81'})]);expect(groups[0].tomes.map(item=>item.label)).toEqual(['Tomo 80','Tomo 81'])});
});
