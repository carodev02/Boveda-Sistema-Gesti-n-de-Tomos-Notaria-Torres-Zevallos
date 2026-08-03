import {describe,expect,it} from 'vitest';
import {normalizedTomeNumber} from '../../src/utils/tomeNumber';
import {requiredTomeNumber} from '../src/utils/tome-number';

describe('número de tomo obligatorio',()=>{
  it.each(['','   '])('rechaza tomo vacío %#',value=>{expect(normalizedTomeNumber(value)).toBeUndefined();expect(()=>requiredTomeNumber(value)).toThrow('El número de tomo es obligatorio.')});
  it.each(['Tomo 80','abc','-1','0','8.5','@80'])('rechaza el valor inválido %s',value=>{expect(normalizedTomeNumber(value)).toBeUndefined();expect(()=>requiredTomeNumber(value)).toThrow('Ingrese un número de tomo válido.')});
  it.each([['1','1'],['15','15'],['80','80'],['125','125'],['080','80']])('normaliza %s como %s',(value,expected)=>{expect(normalizedTomeNumber(value)).toBe(expected);expect(requiredTomeNumber(value)).toBe(expected)});
});
