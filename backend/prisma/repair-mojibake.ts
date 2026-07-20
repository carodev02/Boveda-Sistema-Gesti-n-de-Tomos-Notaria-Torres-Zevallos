import {PrismaClient} from '@prisma/client';
import {sanitizeDisplayText} from '../src/utils/display-text.js';

const prisma=new PrismaClient();
let corrected=0;
const clean=(value:string|null)=>{if(value===null)return null;const next=sanitizeDisplayText(value);return next===value?value:next};

try{
  const serverEncoding=await prisma.$queryRawUnsafe<Array<{server_encoding:string}>>('SHOW server_encoding');
  const clientEncoding=await prisma.$queryRawUnsafe<Array<{client_encoding:string}>>('SHOW client_encoding');
  const documents=await prisma.document.findMany();
  for(const row of documents){
    const data={displayName:clean(row.displayName)!,originalFileName:clean(row.originalFileName)!,documentType:clean(row.documentType)!,biennium:clean(row.biennium),tomo:clean(row.tomo)!,escritura:clean(row.escritura),kardex:clean(row.kardex),minuta:clean(row.minuta),actoJuridico:clean(row.actoJuridico),documentDate:clean(row.documentDate),observations:clean(row.observations),documentStatus:clean(row.documentStatus)!,ocrStatus:clean(row.ocrStatus)!};
    if(Object.entries(data).some(([key,value])=>value!==row[key as keyof typeof row])){await prisma.document.update({where:{id:row.id},data});corrected++}
  }
  const contractors=await prisma.documentContractor.findMany();
  for(const row of contractors){const name=clean(row.name)!;if(name!==row.name){await prisma.documentContractor.update({where:{id:row.id},data:{name}});corrected++}}
  const fields=await prisma.ocrField.findMany({select:{id:true,normalizedValue:true,requiresReview:true}});
  for(const row of fields){const normalizedValue=clean(row.normalizedValue);if(normalizedValue!==row.normalizedValue){await prisma.ocrField.update({where:{id:row.id},data:{normalizedValue,requiresReview:true}});corrected++}}
  await prisma.auditEvent.create({data:{action:'DATA_MOJIBAKE_REPAIRED',module:'Mantenimiento',detail:`${corrected} valores corregidos`,newValues:{corrected}}});
  console.log(`PostgreSQL server_encoding: ${serverEncoding[0]?.server_encoding??'desconocido'}`);
  console.log(`PostgreSQL client_encoding: ${clientEncoding[0]?.client_encoding??'desconocido'}`);
  console.log(`Valores corregidos: ${corrected}`);
}finally{await prisma.$disconnect()}
