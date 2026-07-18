import {describe,expect,it} from 'vitest';
import {generateNormalizedFilename} from '../../src/utils/documentFilename';

describe('generateNormalizedFilename',()=>{
  it('genera el nombre de una minuta y limpia caracteres inválidos',()=>{
    expect(generateNormalizedFilename({contractor:'María: Pérez',kardexNumber:'333',documentLabel:'MINUTA'})).toBe('María Pérez - KARDEX 333 - MINUTA.pdf');
  });

  it('agrega un sufijo cuando el nombre ya existe',()=>{
    const existing=['MARÍA PÉREZ - KARDEX 333 - ESCRITURA 452.pdf'];
    expect(generateNormalizedFilename({contractor:'María Pérez',kardexNumber:'333',documentLabel:'ESCRITURA',documentNumber:'452',existingNames:existing})).toBe('María Pérez - KARDEX 333 - ESCRITURA 452 (2).pdf');
  });

  it('evita segmentos vacíos',()=>{
    expect(generateNormalizedFilename({contractor:'',kardexNumber:'',documentLabel:''})).toBe('CONTRATANTE SIN NOMBRE - KARDEX SIN KARDEX - DOCUMENTO.pdf');
  });
});
