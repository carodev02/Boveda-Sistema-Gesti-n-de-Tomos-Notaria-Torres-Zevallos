import {describe,expect,it} from 'vitest';
import {documentFolioDisplay} from '../../src/services/documentFolio';
import {fromApi} from '../../src/services/documentsApi';

describe('fojas del detalle documental',()=>{
  it('diferencia rango del tomo y foja exacta',()=>expect(documentFolioDisplay({folioRangeStart:22,folioRangeEnd:24,printedFolio:23})).toEqual({range:'22-24',exact:'23'}));
  it('muestra estados explícitos cuando faltan',()=>expect(documentFolioDisplay({})).toEqual({range:'No registrado',exact:'No detectada'}));
  it('mapea los tres campos devueltos por el backend',()=>{const row={id:'f6e88078-cae1-4457-9b68-0edfcfa9c590',displayName:'K-41245.pdf',originalFileName:'original.pdf',filePath:'x',storageName:'x.pdf',fileHash:'h',fileSize:1,mimeType:'application/pdf',pageCount:1,documentMode:'actual',documentType:'Minuta',year:2026,biennium:null,bienniumStart:null,bienniumEnd:null,tomo:'80',folioRangeStart:22,folioRangeEnd:24,printedFolio:23,fojaInitial:23,fojaFinal:null,escritura:null,kardex:'41245',minuta:null,actoJuridico:null,documentDate:null,observations:null,ocrConfidence:null,documentStatus:'CONFIRMED',ocrStatus:'PROCESSED',createdAt:'2026-07-20T00:00:00Z',contractors:[]} as Parameters<typeof fromApi>[0];const document=fromApi(row);expect(documentFolioDisplay(document)).toEqual({range:'22-24',exact:'23'})});
});
