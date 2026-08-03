import type {Request,Response} from 'express';
import type {Prisma} from '@prisma/client';
import {prisma} from '../config/prisma.js';

const text=(value:unknown)=>typeof value==='string'?value.trim():'';
export async function documentReport(req:Request,res:Response){
 const period=text(req.query.period);const tome=text(req.query.tome);const documentType=text(req.query.type);const status=text(req.query.status)||'CONFIRMED';
 const periodNumber=/^\d{4}$/.test(period)?Number(period):undefined;
 const where:Prisma.DocumentWhereInput={deletedAt:null,documentStatus:status,ocrStatus:{notIn:['FAILED','ERROR','FALLIDO']},...(period?{OR:[...(periodNumber?[{year:periodNumber}]:[]),{biennium:period},...(/^\d{4}-\d{4}$/.test(period)?[{bienniumStart:Number(period.slice(0,4)),bienniumEnd:Number(period.slice(5))}]:[])]}:{}),...(tome?{tomo:tome}:{}),...(documentType?{documentType}: {})};
 const documents=await prisma.document.findMany({where,select:{id:true,displayName:true,documentMode:true,documentType:true,year:true,biennium:true,bienniumStart:true,bienniumEnd:true,tomo:true,printedFolio:true,fojaInitial:true,minuta:true,actoJuridico:true,kardex:true,escritura:true,observations:true,documentStatus:true,ocrStatus:true,fileSize:true,createdAt:true,contractors:{select:{name:true},orderBy:{position:'asc'}}},orderBy:{createdAt:'desc'}});
 const periods=await prisma.document.findMany({where:{deletedAt:null,documentStatus:'CONFIRMED',ocrStatus:{notIn:['FAILED','ERROR','FALLIDO']}},select:{year:true,biennium:true,bienniumStart:true,bienniumEnd:true,tomo:true,documentType:true}});
 const options={periods:[...new Set(periods.map(row=>row.year?String(row.year):row.biennium??(row.bienniumStart&&row.bienniumEnd?`${row.bienniumStart}-${row.bienniumEnd}`:'')).filter(Boolean))].sort().reverse(),tomes:[...new Set(periods.map(row=>row.tomo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true})),types:[...new Set(periods.map(row=>row.documentType).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))};
 res.json({documents,options,total:documents.length,totalBytes:documents.reduce((sum,row)=>sum+row.fileSize,0)});
}
