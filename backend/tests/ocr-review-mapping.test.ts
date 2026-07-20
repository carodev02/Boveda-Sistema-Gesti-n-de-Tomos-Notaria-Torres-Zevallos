import {describe,expect,it} from 'vitest';
import {mapOcrFieldsToReview,mergeOcrFieldsIntoReview,normalizeExtractedFieldName} from '../../src/services/ocrProcessingService';

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
  it('acepta aliases sin distinguir formato y convierte fechas para el formulario',()=>{
    expect(mapOcrFieldsToReview([
      {fieldName:'DESTINATIONREGISTRYTYPE',extractedValue:'Poderes',requiresReview:true},
      {fieldName:'destination_instrument_number',extractedValue:'119'},
      {fieldName:'MINUTA',extractedValue:'462'},
      {fieldName:'FOJA',extractedValue:'1360'},
      {fieldName:'fecha',extractedValue:'07/04/2026'},
      {fieldName:'LEGALACT',extractedValue:'Poder especial'},
      {fieldName:'PRIMARYCONTRACTOR',extractedValue:'DON NARCISO ZUÑIGA CHAVEZ'},
    ])).toMatchObject({destinationRegistryTypeId:'poderes',destinationInstrumentNumber:'119',minuteNumber:'462',printedFolio:'1360',documentDate:'2026-04-07',legalActId:'poder-especial',primaryContractor:'DON NARCISO ZUÑIGA CHAVEZ'});
  });
  it('normaliza claves canónicas sin distinguir formato',()=>expect(['KARDEXNUMBER','kardex_number','Kardex Number'].map(normalizeExtractedFieldName)).toEqual(['kardexnumber','kardexnumber','kardexnumber']));
  it('sincroniza resultados tardíos sin borrar correcciones manuales',()=>{const current={kardexNumber:'41246',minuteNumber:'',printedFolio:'',instrumentType:'',instrumentNumber:'',destinationRegistryTypeId:'',destinationInstrumentNumber:'',documentDate:'',legalActId:'',primaryContractor:'',qrUrl:''};const merged=mergeOcrFieldsIntoReview(current,[{fieldName:'kardexNumber',normalizedValue:'41245'},{fieldName:'minuteNumber',normalizedValue:'462'}],new Set(['kardexNumber']));expect(merged.kardexNumber).toBe('41246');expect(merged.minuteNumber).toBe('462')});
});
