import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {resolveDocumentFile} from '../src/services/document-file-storage.service.js';

const roots:string[]=[];
async function fixture(relative:string,body:string){const root=await fs.mkdtemp(path.join(os.tmpdir(),'sigadn-storage-'));roots.push(root);const absolute=path.join(root,...relative.split('/'));await fs.mkdir(path.dirname(absolute),{recursive:true});await fs.writeFile(absolute,body);return {root,absolute,hash:crypto.createHash('sha256').update(body).digest('hex'),size:Buffer.byteLength(body)}}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>fs.rm(root,{recursive:true,force:true})))})

describe('almacenamiento central de documentos',()=>{
  it('abre una ruta relativa nueva con separadores de Windows',async()=>{const file=await fixture('documents/Minuta/2026/doc.pdf','%PDF-new');const resolved=await resolveDocumentFile(file.root,{filePath:'documents\\Minuta\\2026\\doc.pdf',storageName:'doc.pdf',fileHash:file.hash,fileSize:file.size});expect(resolved?.absolutePath).toBe(file.absolute);expect(resolved?.relativePath).toBe('documents/Minuta/2026/doc.pdf')});
  it('recupera una ruta absoluta antigua por su equivalente dentro de STORAGE_ROOT',async()=>{const file=await fixture('documents/Actas/2025/old.pdf','%PDF-old');const resolved=await resolveDocumentFile(file.root,{filePath:'C:\\Users\\Anterior\\Desktop\\Boveda\\storage\\documents\\Actas\\2025\\old.pdf',storageName:'old.pdf',fileHash:file.hash,fileSize:file.size});expect(resolved?.absolutePath).toBe(file.absolute);expect(resolved?.foundBy).toBe('equivalent-path')});
  it('localiza por storageName y confirma SHA-256',async()=>{const file=await fixture('documents/legacy/ab/stored.pdf','%PDF-name');const resolved=await resolveDocumentFile(file.root,{filePath:'C:\\ruta\\que\\ya-no-existe\\stored.pdf',storageName:'stored.pdf',fileHash:file.hash,fileSize:file.size});expect(resolved?.absolutePath).toBe(file.absolute);expect(resolved?.foundBy).toBe('stored-name')});
  it('localiza por SHA-256 aunque el nombre haya cambiado',async()=>{const file=await fixture('documents/legacy/ab/renamed.pdf','%PDF-hash');const resolved=await resolveDocumentFile(file.root,{filePath:'C:\\viejo\\original.pdf',storageName:'original.pdf',fileHash:file.hash,fileSize:file.size});expect(resolved?.absolutePath).toBe(file.absolute);expect(resolved?.foundBy).toBe('sha256')});
  it('no devuelve rutas fuera del almacenamiento central ni archivos con hash incorrecto',async()=>{const file=await fixture('documents/wrong.pdf','%PDF-wrong');const resolved=await resolveDocumentFile(file.root,{filePath:'..\\outside.pdf',storageName:'wrong.pdf',fileHash:'0'.repeat(64),fileSize:file.size});expect(resolved).toBeUndefined()});
});
