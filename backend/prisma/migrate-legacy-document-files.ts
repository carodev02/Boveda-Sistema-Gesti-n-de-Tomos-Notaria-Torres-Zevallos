import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {PrismaClient} from '@prisma/client';
import {env} from '../src/config/env.js';
import {equivalentRelativePaths,isLegacyAbsolutePath,listStorageFiles,normalizeStoragePath,relativeStoragePath,resolveDocumentFile,sha256File} from '../src/services/document-file-storage.service.js';

type DocumentFileRow = {
  id: string;
  displayName: string;
  originalFileName: string;
  storageName: string;
  filePath: string;
  fileHash: string;
  fileSize: number;
};

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const sourceRoots = args.flatMap((value,index)=>{const source=args[index+1];return value === '--source' && source ? [path.resolve(source)] : []});
const centralRoot = path.resolve(env.STORAGE_ROOT);

async function readable(candidate: string) {
  try { const handle=await fs.open(candidate,'r'); await handle.close(); return (await fs.stat(candidate)).isFile(); } catch { return false; }
}

async function matches(row: DocumentFileRow, candidate: string) {
  if (!await readable(candidate)) return false;
  if ((await fs.stat(candidate)).size !== row.fileSize) return false;
  return await sha256File(candidate) === row.fileHash.toLowerCase();
}

async function findLegacySource(row: DocumentFileRow, inventories: Map<string,string[]>) {
  if (isLegacyAbsolutePath(row.filePath) && await matches(row,row.filePath)) return row.filePath;
  for (const root of sourceRoots) {
    for (const relative of equivalentRelativePaths(row.filePath)) {
      const candidate=path.resolve(root,...normalizeStoragePath(relative).split('/'));
      if (await matches(row,candidate)) return candidate;
    }
  }
  const names=new Set([row.storageName,path.posix.basename(normalizeStoragePath(row.filePath)),row.originalFileName].map(value=>value.toLocaleLowerCase()));
  for (const files of inventories.values()) {
    for (const candidate of files) if (names.has(path.basename(candidate).toLocaleLowerCase()) && await matches(row,candidate)) return candidate;
  }
  for (const files of inventories.values()) {
    for (const candidate of files) {
      if ((await fs.stat(candidate)).size === row.fileSize && await sha256File(candidate) === row.fileHash.toLowerCase()) return candidate;
    }
  }
  return undefined;
}

async function migrate() {
  await fs.mkdir(centralRoot,{recursive:true});
  const inventories=new Map<string,string[]>();
  for (const source of sourceRoots) inventories.set(source,await listStorageFiles(source));
  const documents=await prisma.document.findMany({select:{id:true,displayName:true,originalFileName:true,storageName:true,filePath:true,fileHash:true,fileSize:true},orderBy:{createdAt:'asc'}});
  const report={mode:apply?'APPLY':'DRY_RUN',storageRoot:centralRoot,sourceRoots,inspected:documents.length,alreadyCentral:0,recovered:0,copied:0,normalized:0,missing:0,errors:0};
  for (const row of documents) {
    try {
      const central=await resolveDocumentFile(centralRoot,row);
      if (central && await matches(row,central.absolutePath)) {
        const normalized=row.filePath !== central.relativePath;
        if (normalized && apply) await prisma.document.update({where:{id:row.id},data:{filePath:central.relativePath}});
        if (normalized) { report.normalized+=1; report.recovered+=1; } else report.alreadyCentral+=1;
        continue;
      }
      const source=await findLegacySource(row,inventories);
      if (!source) { report.missing+=1; console.warn(`[MISSING] ${row.id} ${row.displayName}`); continue; }
      const extension=path.extname(row.storageName)||'.pdf';
      const relative=`documents/legacy/${row.fileHash.slice(0,2)}/${row.id}${extension}`;
      const destination=path.resolve(centralRoot,...relative.split('/'));
      if (apply) {
        await fs.mkdir(path.dirname(destination),{recursive:true});
        if (!await readable(destination)) {
          const temporary=`${destination}.migrating-${crypto.randomUUID()}`;
          await fs.copyFile(source,temporary,fs.constants.COPYFILE_EXCL);
          if (!await matches(row,temporary)) { await fs.rm(temporary,{force:true}); throw new Error('La copia no coincide con el SHA-256 registrado.'); }
          await fs.rename(temporary,destination);
          report.copied+=1;
        } else if (!await matches(row,destination)) throw new Error(`El destino ya existe con contenido diferente: ${destination}`);
        await prisma.document.update({where:{id:row.id},data:{filePath:relativeStoragePath(centralRoot,destination)}});
      }
      report.recovered+=1;
      console.log(`[RECOVERED] ${row.id} <- ${source}`);
    } catch (error) {
      report.errors+=1;
      console.error(`[ERROR] ${row.id} ${error instanceof Error?error.message:String(error)}`);
    }
  }
  console.log(JSON.stringify(report,null,2));
  if (!apply) console.log('Simulación: no se copiaron archivos ni se actualizó PostgreSQL. Use --apply después de revisar este informe.');
}

migrate().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>prisma.$disconnect());
