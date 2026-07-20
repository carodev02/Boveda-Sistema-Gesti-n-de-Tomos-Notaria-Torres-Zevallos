import {describe,expect,it} from 'vitest';
import {extractScanFields} from '../src/services/ocr-worker.service';

describe('campos OCR del flujo CZUR',()=>{
  it('extrae kardex e instrumento sin inventar campos ausentes',()=>{
    const fields=extractScanFields([{pageNumber:1,rawText:'OTORGANTE: ANA TORRES. KARDEX: 468 ESCRITURA N° 119'}]);
    const value=(name:string)=>fields.find(field=>field.fieldName===name)?.normalizedValue;
    expect(value('kardexNumber')).toBe('468');
    expect(value('instrumentNumber')).toBe('119');
    expect(value('destinationInstrumentNumber')).toBe('119');
    expect(value('destinationRegistryType')).toBe('escrituras-publicas');
    expect(value('minuteNumber')).toBe('');
  });
  it('recorta y limpia el contratante y clasifica el acto aunque no exista número',()=>{
    const fields=extractScanFields([{pageNumber:1,averageConfidence:83,rawText:'PODER ESPECIAL, QUE OTORGA DON NINO ZU�IGA CAMPOS. A FAVOR DE DON NARCISO ZU�IGA CHAVEZ, DE NACIONALIDAD PERUANA, IDENTIFICADO CON DNI 08628371'}]);
    const field=(name:string)=>fields.find(item=>item.fieldName===name);
    expect(field('primaryContractor')?.normalizedValue).toBe('DON NARCISO ZUÑIGA CHAVEZ');
    expect(field('legalAct')?.normalizedValue).toBe('poder-especial');
    expect(field('destinationRegistryType')?.normalizedValue).toBe('poderes');
    expect(field('destinationInstrumentNumber')?.requiresReview).toBe(true);
    expect(field('primaryContractor')?.sourcePage).toBe(1);
  });
  it('reconoce el Kardex recuperado por la pasada dirigida al encabezado',()=>{
    const fields=extractScanFields([{pageNumber:1,rawText:'PODER ESPECIAL\nKARDEX_HEADER 41245\nMINUTE_HEADER 462'}]);
    expect(fields.find(field=>field.fieldName==='kardexNumber')?.normalizedValue).toBe('41245');
    expect(fields.find(field=>field.fieldName==='minuteNumber')?.normalizedValue).toBe('462');
  });
  it('distingue Kardex, minuta, foja, escritura y fecha con etiquetas notariales',()=>{
    const fields=extractScanFields([{pageNumber:2,rawText:'KARDEX N.º 41245 MINUTA N° 462 FOJA 1360 ESCRITURA PÚBLICA N.º 468 FECHA 01 ABR 2026'}]);
    const value=(name:string)=>fields.find(field=>field.fieldName===name)?.normalizedValue;
    expect(value('kardexNumber')).toBe('41245');expect(value('minuteNumber')).toBe('462');expect(value('printedFolio')).toBe('1360');expect(value('destinationInstrumentNumber')).toBe('468');expect(value('documentDate')).toBe('2026-04-01');
  });
  it('acepta la forma aislada K-41245 sin tomar otros números',()=>expect(extractScanFields([{pageNumber:1,rawText:'DNI 08628371 K-41245 teléfono 999999999'}]).find(field=>field.fieldName==='kardexNumber')?.normalizedValue).toBe('41245'));
  it('normaliza K41245 y conserva la escritura aunque antes aparezca el acto',()=>{
    const fields=extractScanFields([{pageNumber:1,rawText:'KARDEX K41245 PODER ESPECIAL QUE OTORGA DON ANA MARIA TORRES CAMPOS, IDENTIFICADA CON DNI. ESCRITURA PÚBLICA N° 468'}]);
    const value=(name:string)=>fields.find(field=>field.fieldName===name)?.normalizedValue;
    expect(value('kardexNumber')).toBe('41245');expect(value('instrumentNumber')).toBe('468');expect(value('instrumentType')).toBe('PODER ESPECIAL');expect(value('primaryContractor')).toBe('ANA MARIA TORRES CAMPOS');
  });
  it('prioriza los marcadores dirigidos del encabezado',()=>{
    const fields=extractScanFields([{pageNumber:1,rawText:'KARDEX 999 MINUTA 777 KARDEX_HEADER 41245 MINUTE_HEADER 462'}]);
    expect(fields.find(field=>field.fieldName==='kardexNumber')?.normalizedValue).toBe('41245');expect(fields.find(field=>field.fieldName==='minuteNumber')?.normalizedValue).toBe('462');
  });
});
