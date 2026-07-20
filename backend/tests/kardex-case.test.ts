import {describe,expect,it} from 'vitest';
import {kardexPeriodKey,normalizeKardex} from '../src/services/kardex-case.service';

describe('normalización de KardexCase',()=>{
 it.each([['41245','41245'],['K-41245','41245'],['KARDEX 41245','41245'],['0041245','41245'],['KARDEX 41O45','41045']])('normaliza %s', (input,expected)=>expect(normalizeKardex(input)).toBe(expected));
 it('usa año como periodo',()=>expect(kardexPeriodKey({year:2026,tomeNumber:'80'})).toBe('2026'));
 it('usa bienio como periodo',()=>expect(kardexPeriodKey({bienniumStart:1994,bienniumEnd:1995,tomeNumber:'1'})).toBe('1994-1995'));
});
