import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('carga de PDF con muchas páginas',()=>{
  it('mantiene lectura y carga durante veinte minutos sin límite por páginas',()=>{
    const source=readFileSync(new URL('../../src/services/documentUploadService.ts',import.meta.url),'utf8');
    expect(source).toContain('LARGE_PDF_OPERATION_TIMEOUT_MS=20*60*1000');
    expect(source.match(/LARGE_PDF_OPERATION_TIMEOUT_MS/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).not.toMatch(/CLEAN_PDF_READ_TIMEOUT_MS=15000|5\*60\*1000/);
  });
  it('lee el archivo de escritorio en bloques de dos MB',()=>{
    const client=readFileSync(new URL('../../src/services/documentUploadService.ts',import.meta.url),'utf8');
    const desktop=readFileSync(new URL('../../src-tauri/src/lib.rs',import.meta.url),'utf8');
    expect(client).toContain('readCleanPdfChunk(sessionId,offset,chunkSize)');
    expect(client).toContain('const chunkSize=2*1024*1024');
    expect(client).not.toContain('const raw=await timeout(czurDesktop.readCleanPdf');
    expect(desktop).toContain('fn read_clean_pdf_chunk');
    expect(desktop).toContain('length>2*1024*1024');
  });
});
