import {describe,expect,it} from 'vitest';
import {extractScanFields} from '../src/services/ocr-worker.service';

describe('campos OCR del flujo CZUR',()=>{
  it('extrae kardex e instrumento sin inventar campos ausentes',()=>{
    const fields=extractScanFields([{pageNumber:1,rawText:'OTORGANTE: ANA TORRES. KARDEX: 468 ESCRITURA N° 119'}]);
    const value=(name:string)=>fields.find(field=>field.fieldName===name)?.normalizedValue;
    expect(value('kardexNumber')).toBe('468');
    expect(value('instrumentNumber')).toBe('119');
    expect(value('destinationInstrumentNumber')).toBe('119');
    expect(value('destinationRegistryType')).toBe('escrituras-publicas');
    expect(value('minuteNumber')).toBe('');
  });
  it('recorta y limpia el contratante y clasifica el acto aunque no exista número',()=>{
    const fields=extractScanFields([{pageNumber:1,averageConfidence:83,rawText:'PODER ESPECIAL, QUE OTORGA DON NINO ZU�IGA CAMPOS. A FAVOR DE DON NARCISO ZU�IGA CHAVEZ, DE NACIONALIDAD PERUANA, IDENTIFICADO CON DNI 08628371'}]);
    const field=(name:string)=>fields.find(item=>item.fieldName===name);
    expect(field('primaryContractor')?.normalizedValue).toBe('NINO ZUÑIGA CAMPOS');
    expect(field('legalAct')?.normalizedValue).toBe('poder-especial');
    expect(field('destinationRegistryType')?.normalizedValue).toBe('poderes');
    expect(field('destinationInstrumentNumber')?.requiresReview).toBe(true);
    expect(field('primaryContractor')?.sourcePage).toBe(1);
  });
  it('reconoce el Kardex recuperado por la pasada dirigida al encabezado',()=>{
    const fields=extractScanFields([{pageNumber:1,rawText:'PODER ESPECIAL\nKARDEX_HEADER 41245\nMINUTE_HEADER 462'}]);
    expect(fields.find(field=>field.fieldName==='kardexNumber')?.normalizedValue).toBe('41245');
    expect(fields.find(field=>field.fieldName==='minuteNumber')?.normalizedValue).toBe('462');
  });
  it('distingue Kardex, minuta, foja, escritura y fecha con etiquetas notariales',()=>{
    const fields=extractScanFields([{pageNumber:2,rawText:'KARDEX N.º 41245 MINUTA N° 462 FOJA 1360 ESCRITURA PÚBLICA N.º 468 FECHA 01 ABR 2026'}]);
    const value=(name:string)=>fields.find(field=>field.fieldName===name)?.normalizedValue;
    expect(value('kardexNumber')).toBe('41245');expect(value('minuteNumber')).toBe('462');expect(value('printedFolio')).toBe('1360');expect(value('destinationInstrumentNumber')).toBe('468');expect(value('documentDate')).toBe('2026-04-01');
  });
  it('acepta la forma aislada K-41245 sin tomar otros números',()=>expect(extractScanFields([{pageNumber:1,rawText:'DNI 08628371 K-41245 teléfono 999999999'}]).find(field=>field.fieldName==='kardexNumber')?.normalizedValue).toBe('41245'));
  it('normaliza K41245 y conserva la escritura aunque antes aparezca el acto',()=>{
    const fields=extractScanFields([{pageNumber:1,rawText:'KARDEX K41245 PODER ESPECIAL QUE OTORGA DON ANA MARIA TORRES CAMPOS, IDENTIFICADA CON DNI. ESCRITURA PÚBLICA N° 468'}]);
    const value=(name:string)=>fields.find(field=>field.fieldName===name)?.normalizedValue;
    expect(value('kardexNumber')).toBe('41245');expect(value('instrumentNumber')).toBe('468');expect(value('instrumentType')).toBe('PODER ESPECIAL');expect(value('primaryContractor')).toBe('ANA MARIA TORRES CAMPOS');
  });
  it('prioriza los marcadores dirigidos del encabezado',()=>{
    const fields=extractScanFields([{pageNumber:1,rawText:'KARDEX 999 MINUTA 777 KARDEX_HEADER 41245 MINUTE_HEADER 462'}]);
    expect(fields.find(field=>field.fieldName==='kardexNumber')?.normalizedValue).toBe('41245');expect(fields.find(field=>field.fieldName==='minuteNumber')?.normalizedValue).toBe('462');
  });
  it('detecta el instrumento 629 desde la etiqueta real INSTRUMENTO NUMERO',()=>{
    const fields=extractScanFields([{pageNumber:1,rawText:'INSTRUMENTO NUMERO:629 KARDEX: V10131 FOJAS: 636 ACTA DE TRANSFERENCIA'}]);
    const value=(name:string)=>fields.find(field=>field.fieldName===name)?.normalizedValue;
    expect(value('destinationInstrumentNumber')).toBe('629');
    expect(value('instrumentNumber')).toBe('629');
    expect(value('kardexNumber')).toBe('10131');
    expect(value('printedFolio')).toBe('636');
  });
  it('extrae el otorgante real del acta y no consume A FAVOR DE',()=>{
    const text='INSTRUMENTO NUMERO:629 KARDEX: V10131 FOJAS: 636 ACTA DE TRASNFERENCIA DE VEHICULO AUTOMOTOR QUE OTORGA: DON JOHN JOSE VARGAS HERNANDEZ $ A FAVOR DE: DON ELIEZER AGUSTIN RONDON LOPEZ';
    const fields=extractScanFields([{pageNumber:1,rawText:text}]);
    const contractor=fields.find(field=>field.fieldName==='primaryContractor');
    expect(contractor?.normalizedValue).toBe('JOHN JOSE VARGAS HERNANDEZ');
    expect(contractor?.requiresReview).toBe(false);
  });
  it('tolera DOÑA dañado por OCR y conserva el otorgante antes de A FAVOR DE',()=>{
    const text='ACTA DE TRANSFERENCIA QUE OTORGA: DO�A TAWADA ISHIMINE VALVERDE JULCA A FAVOR DE: DO�A INES LILIBETH QUINTERO VILLAFANE';
    const contractor=extractScanFields([{pageNumber:1,rawText:text}]).find(field=>field.fieldName==='primaryContractor');
    expect(contractor?.normalizedValue).toBe('TAWADA ISHIMINE VALVERDE JULCA');
    expect(contractor?.requiresReview).toBe(false);
  });
  it('separa los nombres cuando existen dos otorgantes unidos por Y DOÑA',()=>{
    const text='QUE OTORGA: DO�A ASTRID VALERIA CABALLERO PAGAN Y DO�A MAYRA ALEXANDRA CABALLERO PAGAN A FAVOR DE: EMILYNA E.I.R.L.';
    const contractor=extractScanFields([{pageNumber:1,rawText:text}]).find(field=>field.fieldName==='primaryContractor');
    expect(contractor?.normalizedValue).toBe('ASTRID VALERIA CABALLERO PAGAN; MAYRA ALEXANDRA CABALLERO PAGAN');
    expect(contractor?.requiresReview).toBe(false);
  });
  it('usa el nombre estructurado del vendedor cuando el encabezado notarial no es legible',()=>{
    const text='TRANSFERENCIA VEHICULAR 1. DATOS DEL VENDEDOR Persona Natural Nombre y apellidos: CHAVEZ MEDINA HELVER JESUS Domicilio: AVENIDA HONORIO DELGADO 141 Profesión u ocupación: INDEPENDIENTE 2. DATOS DEL COMPRADOR Nombre y apellidos: RAFAEL MAITA ELVER WINER';
    const contractor=extractScanFields([{pageNumber:1,rawText:text}]).find(field=>field.fieldName==='primaryContractor');
    expect(contractor?.normalizedValue).toBe('CHAVEZ MEDINA HELVER JESUS');
    expect(contractor?.requiresReview).toBe(false);
  });
  it('rechaza la frase jurídica y conserva el nombre compareciente como candidato revisable',()=>{
    const text='EN LA QUE COMPARECEN: DON JOHN JOSE VARGAS HERNANDEZ, DE NACIONALIDAD VENEZOLANA, IDENTIFICADO CON CARNET EXTRANJERIA. QUIEN COMPARECE POR SU PROPIO DERECHO COMO VENDEDOR. Y DON ELIEZER AGUSTIN RONDON LOPEZ, DE NACIONALIDAD VENEZOLANO';
    const fields=extractScanFields([{pageNumber:1,rawText:text}]);
    const contractor=fields.find(field=>field.fieldName==='primaryContractor');
    expect(contractor?.normalizedValue).toBe('JOHN JOSE VARGAS HERNANDEZ');
    expect(contractor?.normalizedValue).not.toContain('POR SU PROPIO DERECHO');
    expect(contractor?.requiresReview).toBe(true);
  });
});
