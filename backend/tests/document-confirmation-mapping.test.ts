import {describe,expect,it} from 'vitest';
import {fromApi} from '../../src/services/documentsApi';

describe('confirmación hacia Gestión Documental',()=>{
  it('presenta el nombre normalizado y conserva el identificador definitivo',()=>{
    const row={
      id:'96e5cc86-9f38-4a69-9cbe-40bca3b4cf20',displayName:'DON NARCISO - KARDEX 41245 - MINUTA.pdf',
      originalFileName:'document-clean.pdf',filePath:'documents/minuta/2026/document.pdf',storageName:'document.pdf',
      fileHash:'hash',fileSize:1024,mimeType:'application/pdf',pageCount:1,documentMode:'actual',documentType:'Minuta',
      year:2026,biennium:null,tomo:'',fojaInitial:1360,fojaFinal:null,escritura:null,kardex:'41245',minuta:'462',
      actoJuridico:'Poder especial',documentDate:'2026-04-07',observations:null,ocrConfidence:0.94,
      documentStatus:'CONFIRMED',ocrStatus:'PROCESSED',createdAt:'2026-07-20T16:00:00.000Z',
      contractors:[{name:'DON NARCISO'}],
    } as Parameters<typeof fromApi>[0];

    const document=fromApi(row);

    expect(document.backendId).toBe(row.id);
    expect(document.fileName).toBe(row.displayName);
    expect(document.kardex).toBe('41245');
    expect(document.documento).toBe('CONFIRMED');
    expect(document.ocr).toBe('PROCESSED');
  });
});
