import type {Request,Response} from 'express';
import {prisma} from '../config/prisma.js';
import {recordAudit} from '../services/audit.service.js';
import {HttpError} from '../utils/http.js';
const key='global';
const defaults={documentTypes:'Compraventa, Poder Notarial, Testamento, Escritura Pública, Sucesión Intestada',legalActs:'Compraventa, Poder especial, Donación, Constitución de empresa, Hipoteca, Testamento, Otros',ocrThreshold:80,ocrLanguage:'Español',retries:2,automaticClassification:true,aiEnabled:true,institutionName:'Notaría Torres Zevallos',email:'',address:'',passwordLength:8,failedAttempts:5};
const clean=(input:Record<string,unknown>)=>({documentTypes:String(input.documentTypes??defaults.documentTypes).slice(0,4000),legalActs:String(input.legalActs??defaults.legalActs).slice(0,4000),ocrThreshold:Math.min(100,Math.max(1,Number(input.ocrThreshold)||defaults.ocrThreshold)),ocrLanguage:'Español',retries:Math.min(5,Math.max(0,Number(input.retries)||0)),automaticClassification:Boolean(input.automaticClassification),aiEnabled:Boolean(input.aiEnabled),institutionName:String(input.institutionName??'').trim().slice(0,200),email:String(input.email??'').trim().slice(0,200),address:String(input.address??'').trim().slice(0,500),passwordLength:Math.min(128,Math.max(8,Number(input.passwordLength)||8)),failedAttempts:Math.min(20,Math.max(1,Number(input.failedAttempts)||5))});
export async function getSettings(_req:Request,res:Response){const row=await prisma.systemSetting.findUnique({where:{key}});res.json({...defaults,...(row?.value as object|undefined)});}
const catalog=(value:string)=>value.split(',').map(item=>item.trim()).filter(Boolean);
const catalogKey=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-PE');
export function catalogChanges(before:string,after:string){const previous=catalog(before),next=catalog(after);if(new Set(next.map(catalogKey)).size!==next.length)throw new HttpError(400,'El catálogo contiene nombres repetidos.');if(next.length===0)throw new HttpError(400,'El catálogo no puede quedar vacío.');if(previous.length!==next.length)return [];const oldKeys=previous.map(catalogKey),newKeys=next.map(catalogKey);if(oldKeys.every(key=>newKeys.includes(key)))return [];if(oldKeys.some((key,index)=>newKeys.includes(key)&&key!==newKeys[index]))throw new HttpError(400,'Para cambiar nombres, conserve el orden del catálogo. Guarde los cambios de orden por separado.');return previous.flatMap((name,index)=>name!==next[index]?[{from:name,to:next[index]}]:[])}
export async function updateSettings(req:Request,res:Response){
 const value=clean(req.body as Record<string,unknown>);if(!value.institutionName)throw new HttpError(400,'El nombre de la notaría es obligatorio.');
 const previous=await prisma.systemSetting.findUnique({where:{key}});const old={...defaults,...(previous?.value as object|undefined)};
 const types=catalogChanges(old.documentTypes,value.documentTypes);const acts=catalogChanges(old.legalActs,value.legalActs);
 await prisma.$transaction(async tx=>{
  for(const change of types){await tx.document.updateMany({where:{documentType:{equals:change.from,mode:'insensitive'}},data:{documentType:change.to}})}
  for(const change of acts){await tx.document.updateMany({where:{actoJuridico:{equals:change.from,mode:'insensitive'}},data:{actoJuridico:change.to}});await tx.kardexCase.updateMany({where:{legalAct:{equals:change.from,mode:'insensitive'}},data:{legalAct:change.to}})}
  await tx.systemSetting.upsert({where:{key},create:{key,value,updatedBy:req.auth!.userId},update:{value,updatedBy:req.auth!.userId}});
 });
 await recordAudit(req,{action:'CONFIGURATION_UPDATED',module:'Configuración',targetType:'SystemSetting',targetId:key,detail:'Configuración administrativa central',newValues:{documentTypes:types,legalActs:acts}});res.json(value);
}
