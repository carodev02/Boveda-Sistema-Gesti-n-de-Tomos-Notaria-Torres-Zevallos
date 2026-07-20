import {describe,expect,it} from 'vitest';
import {extractScanFields} from '../src/services/ocr-worker.service';

describe('campos OCR del flujo CZUR',()=>{
  it('extrae kardex e instrumento sin inventar campos ausentes',()=>{
    const fields=extractScanFields([{pageNumber:1,rawText:'OTORGANTE: ANA TORRES. KARDEX: 468 ESCRITURA N° 119'}]);
    const value=(name:string)=>fields.find(field=>field.fieldName===name)?.normalizedValue;
    expect(value('kardexNumber')).toBe('468');
    expect(value('instrumentNumber')).toBe('119');
    expect(value('minuteNumber')).toBe('');
  });
});
