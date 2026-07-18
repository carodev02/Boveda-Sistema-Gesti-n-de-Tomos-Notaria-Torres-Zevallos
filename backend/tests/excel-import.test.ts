import ExcelJS from 'exceljs';
import {describe,expect,it} from 'vitest';
import {applicableExcelSheets,normalizeExcelRows,readExcelFile} from '../../src/services/excelImport';
import {analyzeInventoryPath} from '../../src/services/importAnalysis';

describe('lectura real de Excel',()=>{
  it('lee hojas, encabezados, filas y conserva valores originales',async()=>{
    const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Índice');
    sheet.addRow(['N° KARDEX','INSTRUMENTO','CONTRATANTE','FECHA']);
    sheet.addRow([333,'ESCRITURA: 345','María Pérez',new Date('2026-07-16')]);
    const buffer=await workbook.xlsx.writeBuffer();
    const file=new File([buffer as ArrayBuffer], 'indice.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const parsed=await readExcelFile(file);
    expect(parsed.profile.sheetNames).toEqual(['Índice']);
    expect(parsed.profile.sheets[0].rowCount).toBe(1);
    expect(parsed.profile.sheets[0].columns[0].suggestedTarget).toBe('kardexNumber');
    const rows=normalizeExcelRows('job',parsed.profile.sheets[0],parsed.rawSheets['Índice']);
    expect(rows[0].values.kardexNumber?.rawValue).toBe(333);
    expect(rows[0].values.instrumentType?.normalizedValue).toBe('ESCRITURA');
    expect(rows[0].values.instrumentNumber?.normalizedValue).toBe('345');
  });
  it('encuentra los encabezados aunque el Excel tenga un título previo',async()=>{
    const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Índice histórico');
    sheet.addRow(['ÍNDICE GENERAL DEL BIENIO 1994-1995']);sheet.addRow([]);sheet.addRow(['KARDEX','TOMO','FOJAS','CONTRATANTE']);sheet.addRow([111,1,'1-20','ACAT VELARDE CARLOS']);
    const buffer=await workbook.xlsx.writeBuffer();const file=new File([buffer as ArrayBuffer],'indice.xlsx');const parsed=await readExcelFile(file);const profile=parsed.profile.sheets[0];
    expect(profile.headerRowNumber).toBe(3);expect(profile.rowCount).toBe(1);expect(profile.columns[0].suggestedTarget).toBe('kardexNumber');
    const rows=normalizeExcelRows('job',profile,parsed.rawSheets['Índice histórico']);expect(rows[0].rowNumber).toBe(4);expect(rows[0].values.kardexNumber?.normalizedValue).toBe('111');
  });
  it('reconstruye registros de tomos antiguos y une filas continuadas',async()=>{
    const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('TOMO1');sheet.addRow(['ÍNDICE ESCRITURA PUBLICA']);sheet.addRow(['N°','KARDEX','N° ESCRITURA PUBLICA','N° DE TOMO','AÑO 1994-1995','MINUTA','CONTRATO','CONTRATANTES','OBSERVACIONES']);sheet.addRow([1,111,1,1,'1994-1995',1,'COMPRA-VENTA','ACAT VELARDE CARLOS','']);sheet.addRow([null,null,null,null,null,null,null,'SEGUNDO CONTRATANTE','CONTINÚA']);
    const buffer=await workbook.xlsx.writeBuffer();const file=new File([buffer as ArrayBuffer],'tomos.xlsx');const parsed=await readExcelFile(file);const profile=parsed.profile.sheets[0];
    expect(profile.columns.map(column=>column.target)).toEqual(['correlative','kardexNumber','instrumentNumber','tomeNumber','biennium','minuteNumber','legalAct','contractor','observations']);expect(profile.derivedValues).toMatchObject({tomeNumber:'1',biennium:'1994-1995',registryType:'ESCRITURA PÚBLICA'});
    const rows=normalizeExcelRows('job',profile,parsed.rawSheets.TOMO1);expect(rows).toHaveLength(1);expect(rows[0].values.contractor?.normalizedValue).toBe('ACAT VELARDE CARLOS; SEGUNDO CONTRATANTE');expect(rows[0].values.observations?.normalizedValue).toBe('CONTINÚA');
  });
  it('selecciona solo las hojas cuyo tomo y bienio existen en la carpeta',async()=>{
    const workbook=new ExcelJS.Workbook();for(const [name,period] of [['TOMO1','1994-1995'],['TOMO2','1994-1995'],['TOMO15','1996-1997']]){const sheet=workbook.addWorksheet(name);sheet.addRow(['ÍNDICE ESCRITURA PUBLICA']);sheet.addRow(['N°','KARDEX','N° DE TOMO',`AÑO ${period}`]);sheet.addRow([1,111,Number(name.replace(/\D/g,'')),period])}const buffer=await workbook.xlsx.writeBuffer();const parsed=await readExcelFile(new File([buffer as ArrayBuffer],'tomos.xlsx'));const inventory=[analyzeInventoryPath({jobId:'j',relativePath:'BIENIO 1994-1995/TOMO 1/KARDEX 111.pdf',name:'KARDEX 111.pdf',size:1}),analyzeInventoryPath({jobId:'j',relativePath:'BIENIO 1994-1995/TOMO 2/KARDEX 112.pdf',name:'KARDEX 112.pdf',size:1})];
    expect(applicableExcelSheets(parsed.profile,inventory).map(sheet=>sheet.name)).toEqual(['TOMO1','TOMO2']);
  });
});
