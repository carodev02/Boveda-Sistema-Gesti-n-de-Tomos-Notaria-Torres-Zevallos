import {describe,expect,it} from 'vitest';
import {sanitizeDisplayText as sanitizeBackend,hasDamagedText} from '../src/utils/display-text';
import {sanitizeDisplayText} from '../../src/utils/displayText';

describe('texto Unicode visible',()=>{
  it.each([
    ['',''],['Observación con áéíóú y ñ','Observación con áéíóú y ñ'],['ZUÑIGA ÜRSULA','ZUÑIGA ÜRSULA'],
    ['—','—'],['â€”','—'],['â€“','–'],['Ã± Ã¡ Ã© Ã­ Ã³ Ãº','ñ á é í ó ú'],['Â° Âº Â·','° º ·'],
  ])('sanea %j sin dañar Unicode válido',(input,expected)=>expect(sanitizeDisplayText(input)).toBe(expected));
  it('elimina controles y caracteres de sustitución sin inventar letras',()=>expect(sanitizeDisplayText('ZU�IGA\u0000')).toBe('ZUIGA'));
  it('usa la misma normalización en backend y marca OCR dañado',()=>{expect(sanitizeBackend('Poder â€” especial')).toBe('Poder — especial');expect(hasDamagedText('Poder â€” especial')).toBe(true);expect(hasDamagedText('Poder — especial')).toBe(false)});
});
