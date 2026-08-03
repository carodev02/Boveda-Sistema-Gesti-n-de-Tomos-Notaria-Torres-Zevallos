import {describe,expect,it} from 'vitest';
import {buildTomeHierarchy} from '../../src/services/tomeHierarchy';
import type {DocumentRecord} from '../../src/data/repository';

const document=(values:Partial<DocumentRecord>):DocumentRecord=>({id:1,backendId:'doc-1',documentMode:'actual',tipo:'Minuta',ano:2026,tomo:'1',numeroMinuta:'',actoJuridico:'',kardex:'10131',escritura:'',contratantes:[],observaciones:'',fecha:'',fechaRegistro:'2026-07-20T00:00:00Z',cantidadPaginas:1,documento:'CONFIRMED',ocr:'PROCESSED',fileName:'K-10131.pdf',fileSize:1,file:new Blob(),source:'manual',...values});

describe('jerarquía de Gestión de Tomos por Kardex',()=>{
 it('organiza Año → Tomo → Kardex → Minuta/Acta → PDF',()=>{
  const minuta=document({backendId:'minuta',tomo:'80'});
  const acta=document({id:2,backendId:'acta',tipo:'Acta',tomo:'80',fileName:'ACTA.pdf'});
  const year=buildTomeHierarchy([minuta,acta])[0];
  const tome=year.tomes[0];
  expect(year.label).toBe('Año 2026');
  expect(tome.label).toBe('Tomo 80');
  expect(tome.kardexCases).toHaveLength(1);
  expect(tome.kardexCases[0].label).toBe('Kardex 10131');
  expect(tome.kardexCases[0].categories.map(item=>item.name)).toEqual(['Minuta','Acta']);
  expect(tome.kardexCases[0].categories.flatMap(item=>item.documents)).toHaveLength(2);
 });

 it('conserva la foja exacta en el documento del Kardex',()=>{
  const year=buildTomeHierarchy([document({tipo:'Acta',tomo:'23',printedFolio:636,fileName:'JHON JOSE VARGAS HERNANDEZ - KARDEX 10131 - ESCRITURA 629.pdf'})])[0];
  const acta=year.tomes[0].kardexCases[0].categories[0];
  expect(acta.name).toBe('Acta');
  expect(acta.sourceTypes).toEqual(['Acta']);
  expect(acta.documents[0]).toMatchObject({label:'JHON JOSE VARGAS HERNANDEZ - KARDEX 10131 - ESCRITURA 629.pdf',exactFolio:636});
 });

 it('mantiene Kardex iguales en tomos distintos sin mezclarlos',()=>{
  const groups=buildTomeHierarchy([document({backendId:'minuta'}),document({id:2,backendId:'acta',tipo:'Acta',tomo:'23',fileName:'ACTA.pdf'})]);
  expect(groups[0].tomes.map(tome=>[tome.label,tome.kardexCases[0].label])).toEqual([['Tomo 1','Kardex 10131'],['Tomo 23','Kardex 10131']]);
 });

 it('presenta Escritura Pública como Acta pero conserva su tipo editable',()=>{
  const category=buildTomeHierarchy([document({tipo:'Escritura Pública',tomo:'80',fileName:'ESCRITURA.pdf'})])[0].tomes[0].kardexCases[0].categories[0];
  expect(category.name).toBe('Acta');
  expect(category.sourceTypes).toEqual(['Escritura Pública']);
 });

 it('mueve el mismo id y elimina el tomo anterior vacío',()=>{
  const old=document({tipo:'Acta',tomo:'1'});
  const updated=document({tipo:'Acta',tomo:'23'});
  const groups=buildTomeHierarchy([old,updated]);
  expect(groups[0].tomes.map(tome=>tome.label)).toEqual(['Tomo 23']);
  expect(groups[0].tomes[0].kardexCases[0].categories[0].documents).toHaveLength(1);
 });

 it('excluye registros no confirmados y eliminados',()=>{
  const groups=buildTomeHierarchy([document({backendId:'active'}),document({id:2,backendId:'pending',documento:'READY'}),document({id:3,backendId:'deleted',deletedAt:'2026-07-22T00:00:00Z'})]);
  expect(groups[0].tomes[0].kardexCases[0].categories[0].documents).toHaveLength(1);
 });
});
