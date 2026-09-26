import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type StoredDocumentFile = {
  filePath: string;
  storageName: string;
  originalFileName?: string | null;
  fileHash?: string | null;
  fileSize?: number | null;
};

export type ResolvedDocumentFile = {
  absolutePath: string;
  relativePath: string;
  foundBy: 'stored-path' | 'equivalent-path' | 'stored-name' | 'sha256';
};

const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/]/;

export function normalizeStoragePath(value: string) {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function isLegacyAbsolutePath(value: string) {
  return path.isAbsolute(value) || WINDOWS_ABSOLUTE.test(value);
}

export function relativeStoragePath(root: string, absolutePath: string) {
  return path.relative(path.resolve(root), absolutePath).split(path.sep).join('/');
}

function safeCentralPath(root: string, relative: string) {
  const normalized = normalizeStoragePath(relative);
  if (!normalized || normalized === '.' || normalized.split('/').includes('..') || WINDOWS_ABSOLUTE.test(normalized)) return undefined;
  const storageRoot = path.resolve(root);
  const candidate = path.resolve(storageRoot, ...normalized.split('/'));
  const relativeCandidate = path.relative(storageRoot, candidate);
  if (relativeCandidate.startsWith('..') || path.isAbsolute(relativeCandidate)) return undefined;
  return candidate;
}

export function equivalentRelativePaths(storedPath: string) {
  const normalized = normalizeStoragePath(storedPath);
  const parts = normalized.split('/').filter(Boolean);
  const candidates = new Set<string>();
  if (!isLegacyAbsolutePath(storedPath)) candidates.add(normalized);
  for (const marker of ['storage', 'documents', 'temporary']) {
    const index = parts.findIndex(part => part.toLocaleLowerCase() === marker);
    if (index >= 0) candidates.add(parts.slice(marker === 'storage' ? index + 1 : index).join('/'));
  }
  return [...candidates].filter(Boolean);
}

async function readableFile(candidate: string) {
  try {
    const stat = await fs.stat(candidate);
    if (!stat.isFile()) return false;
    const handle = await fs.open(candidate, 'r');
    await handle.close();
    return true;
  } catch {
    return false;
  }
}

export async function sha256File(filePath: string) {
  const handle = await fs.open(filePath, 'r');
  try {
    const hash = crypto.createHash('sha256');
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

export async function listStorageFiles(root: string) {
  const result: string[] = [];
  const pending = [path.resolve(root)];
  while (pending.length) {
    const current = pending.pop()!;
    try {
      const entries = await fs.readdir(current, {withFileTypes: true});
      for (const entry of entries) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(absolute);
        else if (entry.isFile()) result.push(absolute);
      }
    } catch {
      continue;
    }
  }
  return result;
}

async function acceptCandidate(root: string, candidate: string, row: StoredDocumentFile, foundBy: ResolvedDocumentFile['foundBy'], verifyHash: boolean) {
  if (!await readableFile(candidate)) return undefined;
  if (row.fileSize && (await fs.stat(candidate)).size !== row.fileSize) return undefined;
  if (verifyHash && row.fileHash && await sha256File(candidate) !== row.fileHash.toLowerCase()) return undefined;
  return {absolutePath: candidate, relativePath: relativeStoragePath(root, candidate), foundBy} satisfies ResolvedDocumentFile;
}

/** Resolves only files physically contained by the current central STORAGE_ROOT. */
export async function resolveDocumentFile(root: string, row: StoredDocumentFile): Promise<ResolvedDocumentFile | undefined> {
  const storageRoot = path.resolve(root);
  const equivalents = equivalentRelativePaths(row.filePath);
  for (let index = 0; index < equivalents.length; index += 1) {
    const equivalent = equivalents[index];
    if (!equivalent) continue;
    const candidate = safeCentralPath(storageRoot, equivalent);
    if (!candidate) continue;
    const resolved = await acceptCandidate(storageRoot, candidate, row, index === 0 && !isLegacyAbsolutePath(row.filePath) ? 'stored-path' : 'equivalent-path', isLegacyAbsolutePath(row.filePath));
    if (resolved) return resolved;
  }

  const files = await listStorageFiles(storageRoot);
  const expectedNames = new Set([
    row.storageName,
    path.posix.basename(normalizeStoragePath(row.filePath)),
    row.originalFileName ?? '',
  ].filter(Boolean).map(name => name.toLocaleLowerCase()));
  for (const candidate of files) {
    if (!expectedNames.has(path.basename(candidate).toLocaleLowerCase())) continue;
    const resolved = await acceptCandidate(storageRoot, candidate, row, 'stored-name', Boolean(row.fileHash));
    if (resolved) return resolved;
  }
  if (row.fileHash) {
    for (const candidate of files) {
      if (row.fileSize && (await fs.stat(candidate)).size !== row.fileSize) continue;
      if (!await readableFile(candidate)) continue;
      if (await sha256File(candidate) === row.fileHash.toLowerCase()) {
        return {absolutePath: candidate, relativePath: relativeStoragePath(storageRoot, candidate), foundBy: 'sha256'};
      }
    }
  }
  return undefined;
}
