import {describe,expect,it} from 'vitest';
import {catalogChanges} from '../src/controllers/settings.controller';

describe('cambios del catálogo documental',()=>{
  it('identifica una corrección de nombre sin alterar las otras entradas',()=>{
    expect(catalogChanges('Compraventa, Poder','Compraventa corregida, Poder')).toEqual([{from:'Compraventa',to:'Compraventa corregida'}]);
  });
  it('no interpreta una adición o un cambio de orden como renombres',()=>{
    expect(catalogChanges('Compraventa, Poder','Compraventa, Poder, Donación')).toEqual([]);
    expect(catalogChanges('Compraventa, Poder','Poder, Compraventa')).toEqual([]);
  });
  it('rechaza nombres duplicados y mezclas ambiguas de cambio y orden',()=>{
    expect(()=>catalogChanges('A, B','A, a')).toThrow();
    expect(()=>catalogChanges('A, B, C','B, Nuevo, C')).toThrow();
  });
});
