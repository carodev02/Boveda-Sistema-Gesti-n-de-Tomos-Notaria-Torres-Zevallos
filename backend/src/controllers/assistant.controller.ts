import type {Request,Response} from 'express';
import {prisma} from '../config/prisma.js';
import {recordAudit} from '../services/audit.service.js';
import {assistantConversationAnswer,assistantSearchTerms,containsEveryAssistantTerm,normalizeAssistantText} from '../services/document-assistant-query.service.js';
import {sanitizeDisplayText} from '../utils/display-text.js';
import {HttpError} from '../utils/http.js';

function excerpt(text:string,terms:string[]){
 const normalized=normalizeAssistantText(text);
 const positions=terms.map(term=>normalized.indexOf(term)).filter(position=>position>=0);
 const start=Math.max(0,(positions.length?Math.min(...positions):0)-80);
 const clean=sanitizeDisplayText(text).replace(/\s+/g,' ').trim();
 return `${start?'…':''}${clean.slice(start,start+260)}${clean.length>start+260?'…':''}`;
}

export async function queryDocumentAssistant(req:Request,res:Response){
 const question=typeof req.body?.question==='string'?req.body.question.trim():'';
 if(!question)throw new HttpError(400,'Escriba una pregunta documental.');
 if(question.length>300)throw new HttpError(400,'La pregunta no puede superar 300 caracteres.');

 const conversation=assistantConversationAnswer(question);
 if(conversation){
  await recordAudit(req,{action:'AI_DOCUMENT_QUERY',module:'Asistente IA',detail:question.slice(0,100),newValues:{intent:'conversation',matches:0}});
  res.json({answer:conversation,matches:[]});
  return;
 }

 const terms=assistantSearchTerms(question);
 if(!terms.length){
  res.json({answer:'No identifiqué un nombre, número o término documental para buscar. Pídeme un archivo por su nombre, kardex, escritura, tomo, persona o contenido del PDF.',matches:[]});
  return;
 }

 const documents=await prisma.document.findMany({
  where:{deletedAt:null},
  select:{
   id:true,displayName:true,documentType:true,kardex:true,minuta:true,escritura:true,actoJuridico:true,tomo:true,year:true,biennium:true,observations:true,
   contractors:{select:{name:true},orderBy:{position:'asc'}},
   processingJob:{select:{
    ocrPages:{select:{pageNumber:true,text:true},orderBy:{pageNumber:'asc'}},
    ocrFields:{select:{normalizedValue:true,extractedValue:true,sourceText:true,sourcePage:true}}
   }}
  }
 });

 const matches=documents.map(document=>{
  const metadata=[document.displayName,document.documentType,document.kardex,document.minuta,document.escritura,document.actoJuridico,document.tomo,document.year,document.biennium,document.observations,...document.contractors.map(item=>item.name)].join(' ');
  const pages=document.processingJob?.ocrPages??[];
  const fields=document.processingJob?.ocrFields??[];
  const searchable=[metadata,...pages.map(page=>page.text),...fields.flatMap(field=>[field.normalizedValue,field.extractedValue,field.sourceText])].join(' ');
  if(!containsEveryAssistantTerm(searchable,terms))return undefined;

  const normalizedMetadata=normalizeAssistantText(metadata);
  const page=pages.map(item=>({item,hits:terms.filter(term=>normalizeAssistantText(item.text).includes(term)).length})).sort((a,b)=>b.hits-a.hits)[0];
  const field=fields.map(item=>({item,hits:terms.filter(term=>normalizeAssistantText([item.normalizedValue,item.extractedValue,item.sourceText].join(' ')).includes(term)).length})).sort((a,b)=>b.hits-a.hits)[0];
  const metadataHits=terms.filter(term=>normalizedMetadata.includes(term)).length;
  const pageWins=Boolean(page&&page.hits>0&&page.hits>=Number(field?.hits??0));
  const bestText=pageWins&&page?page.item.text:field?.item.sourceText??metadata;
  return {
   documentId:document.id,
   displayName:document.displayName,
   score:metadataHits*4+Number(page?.hits??0)*2+Number(field?.hits??0),
   snippet:excerpt(bestText,terms),
   pageNumber:pageWins&&page?page.item.pageNumber:field?.item.sourcePage??undefined
  };
 }).filter((item):item is NonNullable<typeof item>=>Boolean(item)).sort((a,b)=>b.score-a.score||a.displayName.localeCompare(b.displayName,'es')).slice(0,12);

 await recordAudit(req,{action:'AI_DOCUMENT_QUERY',module:'Asistente IA',detail:question.slice(0,100),newValues:{terms,matches:matches.length}});
 res.json({
  answer:matches.length===1
   ?`Encontré el archivo “${matches[0]!.displayName}”. La coincidencia proviene de sus datos registrados o del texto OCR.`
   :matches.length
    ?`Encontré ${matches.length} documentos que contienen todos los términos consultados.`
    :'No encontré ese archivo ni información coincidente en los datos registrados o en el texto OCR disponible.',
  matches:matches.map(match=>({documentId:match.documentId,displayName:match.displayName,snippet:match.snippet,pageNumber:match.pageNumber}))
 });
}
