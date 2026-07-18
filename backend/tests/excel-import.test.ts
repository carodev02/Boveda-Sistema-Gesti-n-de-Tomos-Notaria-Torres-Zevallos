import ExcelJS from 'exceljs';
import {describe,expect,it} from 'vitest';
import {normalizeExcelRows,readExcelFile} from '../../src/services/excelImport';

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
});
