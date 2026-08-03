import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {documentFolioDisplay,documentTableFolio} from '../../src/services/documentFolio';
import {fromApi} from '../../src/services/documentsApi';

describe('fojas del detalle documental',()=>{
  it('diferencia rango del tomo y foja exacta',()=>expect(documentFolioDisplay({folioRangeStart:11,folioRangeEnd:22,printedFolio:1360})).toEqual({range:'11–22',exact:'1360'}));
  it('muestra foja exacta sin rango',()=>expect(documentFolioDisplay({printedFolio:1360})).toEqual({range:'No registrado',exact:'1360'}));
  it('muestra rango sin foja exacta',()=>expect(documentFolioDisplay({folioRangeStart:11,folioRangeEnd:22})).toEqual({range:'11–22',exact:'No detectada'}));
  it('muestra estados explícitos cuando faltan',()=>expect(documentFolioDisplay({})).toEqual({range:'No registrado',exact:'No detectada'}));
  it('la tabla usa solamente printedFolio',()=>{expect(documentTableFolio({printedFolio:1360})).toBe(1360);expect(documentTableFolio({})).toBe('—')});
  it('mapea y conserva separados los tres campos del backend',()=>{const row={id:'f6e88078-cae1-4457-9b68-0edfcfa9c590',displayName:'K-41245.pdf',originalFileName:'original.pdf',filePath:'x',storageName:'x.pdf',fileHash:'h',fileSize:1,mimeType:'application/pdf',pageCount:1,documentMode:'actual',documentType:'Minuta',year:2026,biennium:null,bienniumStart:null,bienniumEnd:null,tomo:'80',folioRangeStart:11,folioRangeEnd:22,printedFolio:1360,fojaInitial:1360,fojaFinal:null,escritura:null,kardex:'41245',minuta:null,actoJuridico:null,documentDate:null,observations:null,ocrConfidence:null,documentStatus:'CONFIRMED',ocrStatus:'PROCESSED',createdAt:'2026-07-20T00:00:00Z',contractors:[]} as Parameters<typeof fromApi>[0];const document=fromApi(row);expect(documentFolioDisplay(document)).toEqual({range:'11–22',exact:'1360'});expect(documentTableFolio(document)).toBe(1360)});
  it('no presenta el rango del lomo como resultado documental',()=>{const viewer=readFileSync(new URL('../../src/pages/Visor.tsx',import.meta.url),'utf8');const workflow=readFileSync(new URL('../../src/pages/DigitalizacionProcess.tsx',import.meta.url),'utf8');expect(viewer).not.toMatch(/Rango (?:de fojas|indicado)/);expect(viewer).toContain('<dt>Foja exacta</dt><dd>{exact}</dd>');expect((workflow.match(/Rango de fojas indicado en el lomo/g)??[])).toHaveLength(1);expect(workflow).not.toContain('· Fojas ${folio}')});
});
