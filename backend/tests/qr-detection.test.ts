import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {normalizeQrUrl,qrDetectionFields} from '../src/services/ocr-worker.service.js';
import {mapOcrFieldsToReview} from '../../src/services/ocrProcessingService.js';

describe('extracción QR dedicada',()=>{
  it('persiste URL, valor crudo, página y caja cuando la decodificación es válida',()=>{
    const fields=qrDetectionFields([{qrDetected:true,qrRawValue:'https://notaria.test/acta/1',qrUrl:'https://notaria.test/acta/1',pageNumber:2,boundingBox:{x:10,y:20,width:80,height:80},decoder:'opencv-qrcode'}]);
    expect(Object.fromEntries(fields.map(field=>[field.fieldName,field.normalizedValue]))).toMatchObject({qrDetected:'true',qrRawValue:'https://notaria.test/acta/1',qrUrl:'https://notaria.test/acta/1',qrPageNumber:'2',qrBoundingBox:'{"x":10,"y":20,"width":80,"height":80}'});
    expect(fields.find(field=>field.fieldName==='qrRawValue')?.requiresReview).toBe(false);
  });
  it('conserva texto no URL para revisión sin inventar qrUrl',()=>{
    const fields=qrDetectionFields([{qrDetected:true,qrRawValue:'ACTA VALIDADA 123',qrUrl:null,pageNumber:3,boundingBox:{x:1,y:2,width:3,height:4},requiresReview:true}]);
    expect(fields.some(field=>field.fieldName==='qrUrl')).toBe(false);
    expect(fields.find(field=>field.fieldName==='qrRawValue')).toMatchObject({normalizedValue:'ACTA VALIDADA 123',requiresReview:true,sourcePage:3});
  });
  it('no crea campos cuando el decodificador no detecta QR',()=>expect(qrDetectionFields([])).toEqual([]));
  it('extrae el enlace web real cuando el QR contiene texto adicional',()=>expect(normalizeQrUrl('Validación: https://notaria.test/documento/630.')).toBe('https://notaria.test/documento/630'));
  it('rechaza protocolos inseguros y texto que no contiene una URL',()=>{expect(normalizeQrUrl('javascript:alert(1)')).toBeUndefined();expect(normalizeQrUrl('ACTA VALIDADA 630')).toBeUndefined()});
  it('lleva qrUrl persistido hasta Revisión mínima',()=>expect(mapOcrFieldsToReview([{fieldName:'qrUrl',normalizedValue:'https://notaria.test/acta/1',pageNumber:2}]).qrUrl).toBe('https://notaria.test/acta/1'));
  it('la revisión muestra QR solo si existe y no ofrece inventarlo manualmente',()=>{
    const source=readFileSync(new URL('../../src/pages/DigitalizacionProcess.tsx',import.meta.url),'utf8');
    expect(source).toContain('values.qrUrl &&');
    expect(source).toContain('qrRawValue&&');
    expect(source).not.toContain('Agregar URL de QR');
  });
  it('presenta el enlace QR persistido en la información documental',()=>{
    const source=readFileSync(new URL('../../src/pages/Visor.tsx',import.meta.url),'utf8');
    expect(source).toContain('Enlace del QR');
    expect(source).toContain('{document.qrUrl}</a>');
    expect(source).toContain('void openQr(document.qrUrl!)');
    const desktop=readFileSync(new URL('../../src-tauri/src/lib.rs',import.meta.url),'utf8');
    expect(desktop).toContain('fn open_external_url');
    expect(desktop).toContain('url.dll,FileProtocolHandler');
  });
  it('permite agregar o corregir el enlace QR al editar el mismo documento',()=>{
    const viewer=readFileSync(new URL('../../src/pages/Visor.tsx',import.meta.url),'utf8');
    const api=readFileSync(new URL('../../src/services/documentsApi.ts',import.meta.url),'utf8');
    const controller=readFileSync(new URL('../src/controllers/documents.controller.ts',import.meta.url),'utf8');
    expect(viewer).toContain('<label>Enlace del QR<input type="url"');
    expect(viewer).toContain('patch.qrUrl=qrUrl');
    expect(api).toContain('qrUrl:string');
    expect(controller).toContain("fieldName:'qrUrl'");
    expect(controller).toContain("changedKeys=['documentType'");
  });
});
