import {describe,expect,it} from 'vitest';
import {generateNormalizedFilename,normalizePdfFilename} from '../../src/utils/documentFilename';

describe('nombre propuesto del PDF CZUR',()=>{
  it('propone K-kardex para minuta',()=>expect(generateNormalizedFilename({kardexNumber:'468',documentClass:'MINUTA'})).toBe('K-468.pdf'));
  it('elimina la K usada como etiqueta OCR antes del número',()=>expect(generateNormalizedFilename({contractor:'NIÑO ZÚÑIGA CAMPOS',kardexNumber:'K41245',documentClass:'REGISTRO_NOTARIAL',instrumentNumber:'468'})).toBe('NIÑO ZÚÑIGA CAMPOS - KARDEX 41245 - ESCRITURA 468.pdf'));
  it('mantiene K-kardex aunque también se detecte contratante',()=>expect(generateNormalizedFilename({contractor:'María: Pérez',kardexNumber:'468',documentClass:'MINUTA'})).toBe('K-468.pdf'));
  it('propone escritura sin inventar el número',()=>{
    expect(generateNormalizedFilename({contractor:'María Pérez',kardexNumber:'468',documentClass:'REGISTRO_NOTARIAL'})).toBe('María Pérez - KARDEX 468.pdf');
    expect(generateNormalizedFilename({contractor:'María Pérez',kardexNumber:'468',documentClass:'REGISTRO_NOTARIAL',instrumentNumber:'119'})).toBe('María Pérez - KARDEX 468 - ESCRITURA 119.pdf');
  });
  it('marca para revisión cuando no detecta kardex',()=>expect(generateNormalizedFilename({documentClass:'MINUTA'})).toBe('DOCUMENTO - REVISAR.pdf'));
  it('genera un nombre de Solicitud sin etiquetarla como escritura',()=>expect(generateNormalizedFilename({contractor:'María Pérez',kardexNumber:'468',documentClass:'SOLICITUD'})).toBe('María Pérez - KARDEX 468.pdf'));
  it('limpia nombres editados, conserva PDF y evita reservados',()=>expect(normalizePdfFilename('CON<>:"/\\|?*.txt')).toBe('DOCUMENTO - CON .txt.pdf'));
  it('agrega un correlativo controlado y limita la longitud',()=>{
    const first=generateNormalizedFilename({kardexNumber:'468',documentClass:'MINUTA'});
    expect(generateNormalizedFilename({kardexNumber:'468',documentClass:'MINUTA',existingNames:[first]})).toBe('K-468 (2).pdf');
    expect(normalizePdfFilename('A'.repeat(300))).toHaveLength(180);
  });
});
