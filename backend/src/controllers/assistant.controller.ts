import type {Request,Response} from 'express';
import {prisma} from '../config/prisma.js';
import {recordAudit} from '../services/audit.service.js';
import {sanitizeDisplayText} from '../utils/display-text.js';
import {HttpError} from '../utils/http.js';

const ignored=new Set(['ano','año','archivos','buscar','busca','cuantos','cuantas','dame','documento','documentos','el','en','kardex','la','las','los','me','minuta','minutas','muestra','muestrame','numero','por','que','quiero','tomo','tomos','todos','todas','una','uno']);
const normalize=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-PE').replace(/\s+/g,' ').trim();
const tokens=(question:string)=>[...new Set(normalize(question).split(/[^a-z0-9ñ-]+/).filter(token=>token.length>1&&!ignored.has(token)))].slice(0,12);
function excerpt(text:string,terms:string[]){const normalized=normalize(text);const positions=terms.map(term=>normalized.indexOf(term)).filter(position=>position>=0);const start=Math.max(0,(positions.length?Math.min(...positions):0)-80);const clean=sanitizeDisplayText(text).replace(/\s+/g,' ').trim();return `${start?'…':''}${clean.slice(start,start+260)}${clean.length>start+260?'…':''}`}

export async function queryDocumentAssistant(req:Request,res:Response){
 const question=typeof req.body?.question==='string'?req.body.question.trim():'';
 if(!question)throw new HttpError(400,'Escriba una pregunta documental.');if(question.length>300)throw new HttpError(400,'La pregunta no puede superar 300 caracteres.');
 const terms=tokens(question);if(!terms.length)throw new HttpError(400,'Incluya un dato, nombre o término que pueda buscarse en los documentos.');
 const documents=await prisma.document.findMany({where:{deletedAt:null},select:{id:true,displayName:true,documentType:true,kardex:true,minuta:true,escritura:true,actoJuridico:true,tomo:true,year:true,biennium:true,observations:true,contractors:{select:{name:true},orderBy:{position:'asc'}},processingJob:{select:{ocrPages:{select:{pageNumber:true,text:true},orderBy:{pageNumber:'asc'}},ocrFields:{select:{normalizedValue:true,extractedValue:true,sourceText:true,sourcePage:true}}}}}});
 const matches=documents.map(document=>{const metadata=[document.displayName,document.documentType,document.kardex,document.minuta,document.escritura,document.actoJuridico,document.tomo,document.year,document.biennium,document.observations,...document.contractors.map(item=>item.name)].join(' ');const pages=document.processingJob?.ocrPages??[];const fields=document.processingJob?.ocrFields??[];const searchable=normalize([metadata,...pages.map(page=>page.text),...fields.flatMap(field=>[field.normalizedValue,field.extractedValue,field.sourceText])].join(' '));const found=terms.filter(term=>searchable.includes(term));if(!found.length)return undefined;const page=pages.find(item=>found.some(term=>normalize(item.text).includes(term)));const field=fields.find(item=>found.some(term=>normalize([item.normalizedValue,item.extractedValue,item.sourceText].join(' ')).includes(term)));return {documentId:document.id,score:found.length,snippet:excerpt(page?.text??field?.sourceText??metadata,found),pageNumber:page?.pageNumber??field?.sourcePage??undefined}}).filter((item):item is NonNullable<typeof item>=>Boolean(item)).sort((a,b)=>b.score-a.score).slice(0,30);
 await recordAudit(req,{action:'AI_DOCUMENT_QUERY',module:'Asistente IA',detail:question.slice(0,100),newValues:{terms,matches:matches.length}});
 res.json({answer:matches.length?`Encontré ${matches.length} documento${matches.length===1?'':'s'} cuyo texto OCR o datos registrados contienen los términos consultados.`:'No encontré coincidencias en los metadatos ni en el texto OCR disponible de los PDF.',matches:matches.map(match=>({documentId:match.documentId,snippet:match.snippet,pageNumber:match.pageNumber}))});
}
