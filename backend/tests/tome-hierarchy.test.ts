import {describe,expect,it} from 'vitest';
import {buildTomeHierarchy} from '../../src/services/tomeHierarchy';
import type {DocumentRecord} from '../../src/data/repository';

const document=(values:Partial<DocumentRecord>):DocumentRecord=>({id:1,documentMode:'actual',tipo:'Minuta',ano:2026,tomo:'80',numeroMinuta:'',actoJuridico:'',kardex:'41245',escritura:'',contratantes:[],observaciones:'',fecha:'',fechaRegistro:'2026-07-20T00:00:00Z',cantidadPaginas:1,documento:'CONFIRMED',ocr:'PROCESSED',fileName:'temporal.pdf',fileSize:1,file:new Blob(),source:'manual',...values});

describe('organización real de tomos',()=>{
  it('agrupa por año, tomo y kardex',()=>{const groups=buildTomeHierarchy([document({})]);const kardex=groups[0].tomes[0].kardexCases[0];expect(groups[0].label).toBe('Año 2026');expect(groups[0].tomes[0].label).toBe('Tomo 80');expect(kardex.label).toBe('Kardex 41245');expect(kardex.categories[0].documents[0].label).toBe('K-41245.pdf')});
  it('relaciona Acta y Minuta del mismo kardex',()=>{const groups=buildTomeHierarchy([document({id:1}),document({id:2,tipo:'Acta',contratantes:['DON NARCISO ZUÑIGA CHAVEZ']})]);const categories=groups[0].tomes[0].kardexCases[0].categories;expect(categories.map(item=>item.name)).toEqual(['Minuta','Acta']);expect(categories[1].documents[0].label).toContain('KARDEX 41245.pdf')});
  it('no agrupa kardex diferentes',()=>{const groups=buildTomeHierarchy([document({id:1,kardex:'41245'}),document({id:2,kardex:'41246'})]);expect(groups[0].tomes[0].kardexCases).toHaveLength(2)});
  it('no agrupa el mismo kardex de tomos diferentes',()=>{const groups=buildTomeHierarchy([document({id:1,tomo:'80'}),document({id:2,tomo:'81'})]);expect(groups[0].tomes).toHaveLength(2)});
  it('prioriza límites numéricos del bienio',()=>{const groups=buildTomeHierarchy([document({ano:undefined,bienniumStart:1994,bienniumEnd:1995,tomo:'80'})]);expect(groups[0].label).toBe('Bienio 1994-1995')});
});
