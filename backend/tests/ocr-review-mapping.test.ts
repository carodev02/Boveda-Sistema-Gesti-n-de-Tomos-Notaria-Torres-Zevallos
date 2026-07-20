import {describe,expect,it} from 'vitest';
import {mapOcrFieldsToReview} from '../../src/services/ocrProcessingService';

describe('mapeo OCR a Revisión mínima',()=>{
  it('normaliza nombres canónicos y aliases sin ocultar campos en revisión',()=>{
    expect(mapOcrFieldsToReview([
      {fieldName:'kardex_number',normalizedValue:'468'},
      {fieldName:'foja',normalizedValue:'22',requiresReview:true},
      {fieldName:'contractor',normalizedValue:'DON NARCISO ZUÑIGA CHAVEZ'},
      {fieldName:'destinationRegistryType',normalizedValue:'poderes'},
      {fieldName:'legalAct',normalizedValue:'poder-especial'},
    ])).toMatchObject({kardexNumber:'468',printedFolio:'22',primaryContractor:'DON NARCISO ZUÑIGA CHAVEZ',destinationRegistryTypeId:'poderes',legalActId:'poder-especial'});
  });
});
