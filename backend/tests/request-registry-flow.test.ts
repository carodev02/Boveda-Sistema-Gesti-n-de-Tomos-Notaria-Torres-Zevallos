import {describe,expect,it} from 'vitest';
import {kardexStatusAfterDeletion} from '../src/services/kardex-case.service';

describe('flujos válidos de relación notarial',()=>{
 it.each([
  [['Minuta','Registro Notarial'],'Relación completa'],
  [['Solicitud','Registro Notarial'],'Relación completa'],
  [['Solicitud'],'Falta Registro Notarial'],
  [['Minuta'],'Falta Registro Notarial'],
  [['Registro Notarial'],'Falta Minuta o Solicitud']
 ])('%j produce %s',(types,status)=>expect(kardexStatusAfterDeletion(types)).toBe(status));
});
