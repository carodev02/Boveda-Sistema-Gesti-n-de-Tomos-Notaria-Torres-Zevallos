import {describe,expect,it} from 'vitest';
import {classifyLegalAct,extractNotarialFields,normalizeOcrText,proposedFilename} from '../../src/services/ocrExtraction';
describe('OCR documental',()=>{
 it('normaliza espacios sin perder bloques',()=>expect(normalizeOcrText('KARDEX: 333\n\n  MINUTA N° 116 ')).toBe('KARDEX: 333\nMINUTA N° 116'));
 it('extrae etiquetas notariales',()=>{const fields=extractNotarialFields('KARDEX: 333 MINUTA N° 116 FOJA: 465 ESCRITURA N° 119');expect(fields.map(f=>f.normalizedValue)).toEqual(['333','116','465','119']);});
 it('clasifica acto sin inventar',()=>{expect(classifyLegalAct('otorgan contrato de compraventa').suggested).toBe('compraventa');expect(classifyLegalAct('texto ilegible').requiresReview).toBe(true);});
 it('genera nombre seguro',()=>expect(proposedFilename('María Pérez','333','MINUTA')).toBe('Maria Perez - KARDEX 333 - MINUTA.pdf'));
});
