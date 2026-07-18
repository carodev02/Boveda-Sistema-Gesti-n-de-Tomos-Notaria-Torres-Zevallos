import {describe,expect,it} from 'vitest';
import {analyzeInventoryPath,compareInventoryWithExcel,extractFolios,extractKardex,extractPeriod,extractTome,normalizeHeader,processMetadataBatches,splitInstrument,suggestHeader} from '../../src/services/importAnalysis';
import type {NormalizedExcelRow} from '../../src/domain/document-domain';

const row=(id:string,kardex:string,contractor='MARÍA PÉREZ'):NormalizedExcelRow=>({id,jobId:'job',sheetName:'Índice',rowNumber:Number(id),values:{kardexNumber:{rawValue:kardex,normalizedValue:kardex,rowNumber:2,columnName:'KARDEX',validationErrors:[]},contractor:{rawValue:contractor,normalizedValue:contractor,rowNumber:2,columnName:'CONTRATANTE',validationErrors:[]}}});

describe('extractores de inventario',()=>{
  it('extrae kardex desde variantes de nombre',()=>{expect(extractKardex('KARDEX N° 333.pdf')?.value).toBe('333');expect(extractKardex('K 334.pdf')?.value).toBe('334');expect(extractKardex('335.pdf')?.value).toBe('335')});
  it('no asume kardex en un nombre con número aislado ambiguo',()=>expect(extractKardex('TOMO 333.pdf')).toBeUndefined());
  it('detecta año y bienio',()=>{expect(extractPeriod('1995')?.value).toBe('1995');expect(extractPeriod('BIENIO 1994 – 1995')?.value).toBe('1994-1995')});
  it('detecta tomo arábigo y romano',()=>{expect(extractTome('N° TOMO 03')?.value).toBe('3');expect(extractTome('TOMO IV')?.value).toBe('IV')});
  it('detecta foja y rango',()=>{expect(extractFolios('FOJA 465')?.value).toBe('465');expect(extractFolios('100 A 120')?.value).toBe('100-120')});
  it('analiza carpetas profundas sin exponer ruta absoluta',()=>{const value=analyzeInventoryPath({jobId:'j',relativePath:'Escrituras/1994-1995/TOMO 2/FOJAS 100-120/María Pérez/KARDEX 333.pdf',name:'KARDEX 333.pdf',size:10});expect(value.depth).toBe(5);expect(value.relativePath.startsWith('Escrituras')).toBe(true);expect(value.kardex?.value).toBe('333')});
});

describe('Excel y vinculación',()=>{
  it('normaliza y sugiere encabezados equivalentes',()=>{expect(normalizeHeader(' N° Kardex ')).toBe('N KARDEX');expect(suggestHeader('NRO KARDEX')).toBe('kardexNumber')});
  it('separa tipo y número de instrumento',()=>expect(splitInstrument('ESCRITURA: 345')).toEqual({instrumentType:'ESCRITURA',instrumentNumber:'345'}));
  it('coincide exactamente por kardex',()=>{const file=analyzeInventoryPath({jobId:'j',relativePath:'KARDEX 333.pdf',name:'KARDEX 333.pdf',size:1});expect(compareInventoryWithExcel(file,[row('2','333')]).status).toBe('MATCHED')});
  it('detecta kardex duplicado en Excel',()=>{const file=analyzeInventoryPath({jobId:'j',relativePath:'KARDEX 333.pdf',name:'KARDEX 333.pdf',size:1});expect(compareInventoryWithExcel(file,[row('2','333'),row('3','333')]).status).toBe('DUPLICATE_IN_EXCEL')});
  it('detecta múltiples contratantes',()=>{const file=analyzeInventoryPath({jobId:'j',relativePath:'KARDEX 333.pdf',name:'KARDEX 333.pdf',size:1});expect(compareInventoryWithExcel(file,[row('2','333'),row('3','333','JUAN PÉREZ')]).contractors).toHaveLength(2)});
  it('marca archivo sin kardex',()=>{const file=analyzeInventoryPath({jobId:'j',relativePath:'documento.pdf',name:'documento.pdf',size:1});expect(compareInventoryWithExcel(file,[row('2','333')]).status).toBe('KARDEX_NOT_DETECTED')});
});

describe('procesamiento por lotes',()=>{
  it('reanuda desde el cursor guardado',async()=>{const seen:number[]=[];const result=await processMetadataBatches([0,1,2,3,4],{start:2,batchSize:2,cancelled:()=>false,paused:()=>false,onBatch:batch=>{seen.push(...batch)}});expect(seen).toEqual([2,3,4]);expect(result.completed).toBe(true)});
  it('cancela sin procesar elementos posteriores',async()=>{let cancel=false;const result=await processMetadataBatches([1,2,3,4],{batchSize:2,cancelled:()=>cancel,paused:()=>false,onBatch:()=>{cancel=true}});expect(result.cancelled).toBe(true);expect(result.cursor).toBe(2)});
  it('procesa miles de registros cediendo control por lote',async()=>{let yields=0;const result=await processMetadataBatches(Array.from({length:5000},(_,index)=>index),{batchSize:200,cancelled:()=>false,paused:()=>false,onBatch:()=>undefined,yieldControl:async()=>{yields++}});expect(result.completed).toBe(true);expect(yields).toBe(25)});
});
