import ExcelJS from 'exceljs';
import type {ExcelColumnProfile,ExcelSheetProfile,ExcelTargetField,ExcelWorkbookProfile,InventoryFile,NormalizedExcelCell,NormalizedExcelRow} from '../domain/document-domain';
import {extractPeriod,extractTome,normalizeHeader,normalizeKardex,splitInstrument,suggestHeader} from './importAnalysis';

type CellValue=string|number|boolean|Date|null;
type TargetField=Exclude<ExcelTargetField,'IGNORE'>;

function apparent(value:unknown){if(value==null||value==='')return'EMPTY';if(value instanceof Date)return'DATE';return typeof value==='number'?'NUMBER':typeof value==='boolean'?'BOOLEAN':'TEXT'}
function plainCellValue(value:unknown):unknown{if(value==null||typeof value==='string'||typeof value==='number'||typeof value==='boolean'||value instanceof Date)return value;if(typeof value==='object'){const cell=value as {result?:unknown;text?:string;richText?:Array<{text:string}>;hyperlink?:string};if(cell.result!==undefined)return cell.result;if(cell.text!==undefined)return cell.text;if(cell.richText)return cell.richText.map(part=>part.text).join('');if(cell.hyperlink)return cell.hyperlink}return String(value)}
function registryType(text:string){const normalized=normalizeHeader(text);if(normalized.includes('ESCRITURA PUBLICA'))return'ESCRITURA PÚBLICA';if(normalized.includes('PODER'))return'PODER';if(normalized.includes('TESTAMENTO'))return'TESTAMENTO';if(normalized.includes('ACTA'))return'ACTA';return''}
function derivedValues(sheetName:string,context:string):ExcelSheetProfile['derivedValues']{
  const values:ExcelSheetProfile['derivedValues']={};const tome=extractTome(sheetName);const period=extractPeriod(context);const registry=registryType(context);
  if(tome)values.tomeNumber=tome.value;if(period?.value.includes('-'))values.biennium=period.value;else if(period)values.year=Number(period.value);
  if(registry){values.registryType=registry;values.instrumentType=registry}
  return values;
}

export async function readExcelFile(file:File):Promise<{profile:ExcelWorkbookProfile;rawSheets:Record<string,unknown[][]>}>{
  const bytes=await file.arrayBuffer();const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);const sheets:ExcelSheetProfile[]=[];const rawSheets:Record<string,unknown[][]>={};
  workbook.eachSheet(worksheet=>{
    const matrix:unknown[][]=[];worksheet.eachRow({includeEmpty:true},row=>{const values=row.values as unknown[];matrix.push(Array.from({length:Math.max(0,worksheet.columnCount)},(_,index)=>plainCellValue(values[index+1])))});
    if(!matrix.length)return;const candidates:Array<{index:number;score:number;filled:number}>=matrix.slice(0,25).map((row,index)=>({index,score:row.reduce<number>((sum,value)=>sum+(suggestHeader(String(value??''))==='IGNORE'?0:1),0),filled:row.filter(value=>value!=null&&String(value).trim()).length}));
    const best=candidates.sort((a,b)=>b.score-a.score||b.filled-a.filled||a.index-b.index)[0];if(!best||best.score===0)return;
    const headerIndex=best.index;rawSheets[worksheet.name]=matrix;const headers=(matrix[headerIndex]??[]).map((value,index)=>String(value??`Columna ${index+1}`).trim()||`Columna ${index+1}`);const normalized=headers.map(normalizeHeader);const dataRows=matrix.slice(headerIndex+1);
    const columns:ExcelColumnProfile[]=headers.map((header,index)=>({index,header,normalizedHeader:normalized[index],suggestedTarget:suggestHeader(header),target:suggestHeader(header),emptyCells:dataRows.filter(row=>row[index]==null||row[index]==='').length,duplicateHeader:normalized.filter(value=>value===normalized[index]).length>1,apparentTypes:[...new Set(dataRows.slice(0,100).map(row=>apparent(row[index])))]}));
    const context=matrix.slice(0,headerIndex+1).flat().map(value=>String(value??'')).join(' ');sheets.push({name:worksheet.name,headerRowNumber:headerIndex+1,rowCount:Math.max(0,dataRows.length),headers,columns,sampleRows:dataRows.slice(0,5),derivedValues:derivedValues(worksheet.name,context)});
  });
  const tomeSheets=sheets.filter(sheet=>sheet.derivedValues?.tomeNumber!=null);const usefulSheets=tomeSheets.length?tomeSheets:sheets;const sheetNames=usefulSheets.map(sheet=>sheet.name);return{profile:{fileName:file.name,sheetNames,selectedSheet:sheetNames[0]??'',sheets:usefulSheets},rawSheets};
}

export function applicableExcelSheets(profile:ExcelWorkbookProfile,inventory:InventoryFile[]){
  const tomes=new Set(inventory.map(file=>file.tome?.value).filter(Boolean).map(value=>String(value).replace(/^0+/,'')));
  const periods=new Set(inventory.map(file=>file.period?.value).filter(Boolean).map(String));
  const selected=profile.sheets.filter(sheet=>{const tome=sheet.derivedValues?.tomeNumber;const period=sheet.derivedValues?.biennium??sheet.derivedValues?.year;return(!tomes.size||tome!=null&&tomes.has(String(tome).replace(/^0+/,'')))&&(!periods.size||period!=null&&periods.has(String(period)))});
  return selected.length?selected:[profile.sheets.find(sheet=>sheet.name===profile.selectedSheet)??profile.sheets[0]].filter(Boolean);
}

function normalizeCell(rawValue:unknown,rowNumber:number,columnName:string,target:ExcelTargetField):NormalizedExcelCell{
  const errors:string[]=[];let normalizedValue:CellValue=rawValue as CellValue;if(typeof rawValue==='string')normalizedValue=rawValue.trim().replace(/\s+/g,' ');if(target==='kardexNumber')normalizedValue=normalizeKardex(rawValue);if(target==='year'&&normalizedValue&&!/^(19|20)\d{2}$/.test(String(normalizedValue)))errors.push('Año inválido');if(target==='biennium'&&normalizedValue){const match=String(normalizedValue).replace(/[–—]/g,'-').match(/((?:19|20)\d{2})\s*-\s*((?:19|20)\d{2})/);normalizedValue=match?`${match[1]}-${match[2]}`:String(normalizedValue);if(!match)errors.push('Bienio inválido')}return{rawValue,normalizedValue:normalizedValue instanceof Date?normalizedValue.toISOString():normalizedValue,rowNumber,columnName,validationErrors:errors};
}
function present(cell?:NormalizedExcelCell){return cell?.normalizedValue!=null&&String(cell.normalizedValue).trim()!==''}
function appendCell(previous:NormalizedExcelCell|undefined,next:NormalizedExcelCell,target:TargetField):NormalizedExcelCell{if(!previous||!present(previous))return next;if(!present(next))return previous;const separator=target==='contractor'?'; ':' ';return{...previous,rawValue:`${String(previous.rawValue??'')}${separator}${String(next.rawValue??'')}`,normalizedValue:`${String(previous.normalizedValue??'')}${separator}${String(next.normalizedValue??'')}`,validationErrors:[...previous.validationErrors,...next.validationErrors]}}

export function normalizeExcelRows(jobId:string,sheet:ExcelSheetProfile,matrix:unknown[][]){
  const rows:NormalizedExcelRow[]=[];const headerRow=sheet.headerRowNumber||1;const hasCorrelative=sheet.columns.some(column=>column.target==='correlative');let current:NormalizedExcelRow|undefined;
  for(const [rowIndex,source] of matrix.slice(headerRow).entries()){
    const rowNumber=headerRow+rowIndex+1;const values:NormalizedExcelRow['values']={};
    for(const column of sheet.columns){if(column.target==='IGNORE')continue;const cell=normalizeCell(source[column.index],rowNumber,column.header,column.target);values[column.target]=cell;if(column.target==='instrumentType'){const split=splitInstrument(cell.normalizedValue);if(split.instrumentNumber){values.instrumentType={...cell,normalizedValue:split.instrumentType};values.instrumentNumber={...cell,normalizedValue:split.instrumentNumber}}}}
    const meaningful=Object.values(values).some(present);if(!meaningful)continue;const anchor=hasCorrelative?present(values.correlative):present(values.kardexNumber)||present(values.minuteNumber)||present(values.instrumentNumber);
    if(anchor||!current){for(const [target,derived] of Object.entries(sheet.derivedValues??{}) as Array<[TargetField,string|number]>)if(!present(values[target]))values[target]=normalizeCell(derived,rowNumber,`Derivado de ${sheet.name}`,target);current={id:`${jobId}:${sheet.name}:${rowNumber}`,jobId,sheetName:sheet.name,rowNumber,values};rows.push(current);continue}
    for(const target of ['contractor','legalAct','observations'] as TargetField[]){const next=values[target];if(next&&present(next))current.values[target]=appendCell(current.values[target],next,target)}
    for(const target of ['kardexNumber','tomeNumber','year','biennium','instrumentType','instrumentNumber','minuteNumber','folios','date','registryType'] as TargetField[])if(!present(current.values[target])&&present(values[target]))current.values[target]=values[target];
  }
  return rows;
}
