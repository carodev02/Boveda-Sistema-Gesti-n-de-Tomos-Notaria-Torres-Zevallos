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
});
