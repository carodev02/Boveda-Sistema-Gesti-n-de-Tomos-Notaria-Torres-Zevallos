import {describe,expect,it} from 'vitest';
import {buildTomeHierarchy} from '../../src/services/tomeHierarchy';
import type {DocumentRecord} from '../../src/data/repository';

const document=(values:Partial<DocumentRecord>):DocumentRecord=>({id:1,documentMode:'actual',tipo:'Minuta',ano:2026,tomo:'80',numeroMinuta:'',actoJuridico:'',kardex:'41245',escritura:'',contratantes:[],observaciones:'',fecha:'',fechaRegistro:'2026-07-20T00:00:00Z',cantidadPaginas:1,documento:'CONFIRMED',ocr:'PROCESSED',fileName:'temporal.pdf',fileSize:1,file:new Blob(),source:'manual',...values});

describe('organización real de tomos',()=>{
  it('agrupa minuta confirmada por año y tomo con nombre K-kardex',()=>{const groups=buildTomeHierarchy([document({})]);expect(groups[0].label).toBe('Año 2026');expect(groups[0].tomes[0].label).toBe('Tomo 80');expect(groups[0].tomes[0].categories[0].name).toBe('Minuta');expect(groups[0].tomes[0].categories[0].documents[0].label).toBe('K-41245.pdf')});
  it('separa Acta de Minuta y usa el contratante real',()=>{const groups=buildTomeHierarchy([document({id:1}),document({id:2,tipo:'Acta',contratantes:['DON NARCISO ZUÑIGA CHAVEZ']})]);const categories=groups[0].tomes[0].categories;expect(categories.map(item=>item.name)).toEqual(['Acta','Minuta']);expect(categories[0].documents[0].label).toBe('DON NARCISO ZUÑIGA CHAVEZ - KARDEX 41245.pdf')});
  it('prioriza límites numéricos del bienio y ordena tomos numéricamente',()=>{const groups=buildTomeHierarchy([document({ano:undefined,bienio:'texto heredado',bienniumStart:1994,bienniumEnd:1995,tomo:'80'}),document({id:2,ano:undefined,bienniumStart:1994,bienniumEnd:1995,tomo:'2'})]);expect(groups[0].label).toBe('Bienio 1994-1995');expect(groups[0].tomes.map(item=>item.label)).toEqual(['Tomo 2','Tomo 80'])});
  it('excluye pendientes y muestra confirmados incompletos para revisión',()=>{const groups=buildTomeHierarchy([document({documento:'REVIEW_REQUIRED'}),document({id:2,ano:undefined,tomo:'',kardex:''})]);expect(groups).toHaveLength(1);expect(groups[0].label).toBe('Período sin identificar');expect(groups[0].tomes[0].label).toBe('Tomo sin identificar');expect(groups[0].tomes[0].categories[0].documents[0].requiresReview).toBe(true)});
});
