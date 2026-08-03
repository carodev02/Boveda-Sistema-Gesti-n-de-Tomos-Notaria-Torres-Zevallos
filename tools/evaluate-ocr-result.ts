import fs from 'node:fs';
import {extractScanFields} from '../backend/src/services/ocr-worker.service.ts';

const [resultPath,expectedPath]=process.argv.slice(2);
if(!resultPath||!expectedPath)throw new Error('Uso: evaluate-ocr-result <resultado.json> <esperado.json>');
const result=JSON.parse(fs.readFileSync(resultPath,'utf8')) as {pages:Array<{pageNumber:number;rawText:string;averageConfidence:number;engine:string}>;qrCodes?:unknown[]};
const expected=JSON.parse(fs.readFileSync(expectedPath,'utf8')) as Record<string,string>;
const fields=extractScanFields(result.pages);
const normalize=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const details=Object.entries(expected).map(([fieldName,value])=>{
  const detected=fields.find(field=>field.fieldName===fieldName);
  const actual=detected?.normalizedValue||detected?.extractedValue||'';
  const correct=Boolean(actual)&&normalize(actual)===normalize(value);
  return {fieldName,expected:value,actual,classification:correct?'correct':actual?'incorrect':'missing'};
});
console.log(JSON.stringify({correct:details.filter(item=>item.classification==='correct').length,incorrect:details.filter(item=>item.classification==='incorrect').length,missing:details.filter(item=>item.classification==='missing').length,details,qrDetected:(result.qrCodes??[]).length>0,qrCount:(result.qrCodes??[]).length}));
