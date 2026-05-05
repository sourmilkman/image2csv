// File System Access API helpers. Persists a directory handle in IndexedDB so
// the user only picks the site root once.

import { Row } from './types';

const DB_NAME = 'image2csv';
const STORE = 'handles';
const KEY = 'siteRoot';
const CSV_REL = ['public', 'data', 'artworks.csv'];
const ART_REL = ['public', 'images', 'artwork'];

const HEADERS: (keyof Row)[] = [
  'title','image','category','medium','size','year','status','price','featured','visible'
];

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idbSet(key: string, val: any): Promise<void> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export function isFsaSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function';
}

export async function pickRoot(): Promise<FileSystemDirectoryHandle> {
  const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  await idbSet(KEY, handle);
  return handle;
}

export async function getStoredRoot(): Promise<FileSystemDirectoryHandle | null> {
  const h = await idbGet<FileSystemDirectoryHandle>(KEY);
  return h ?? null;
}

export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  // @ts-ignore — types lag the spec
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  // @ts-ignore
  return (await handle.requestPermission?.(opts)) === 'granted';
}

async function getDir(root: FileSystemDirectoryHandle, parts: string[], create = false) {
  let h: FileSystemDirectoryHandle = root;
  for (const part of parts) {
    h = await h.getDirectoryHandle(part, { create });
  }
  return h;
}

async function getCsvFile(root: FileSystemDirectoryHandle, create = false) {
  const dir = await getDir(root, CSV_REL.slice(0, -1), create);
  return dir.getFileHandle(CSV_REL[CSV_REL.length - 1], { create });
}

async function getArtDir(root: FileSystemDirectoryHandle, create = false) {
  return getDir(root, ART_REL, create);
}

// ---- CSV ----

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"' && cur === '') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function escCsv(v: string): string {
  v = (v ?? '').toString();
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter(l => l.length);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row = {} as Row;
    HEADERS.forEach((h, idx) => { (row as any)[h] = cols[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

function serializeCsv(rows: Row[]): string {
  const lines = [HEADERS.join(',')];
  for (const r of rows) lines.push(HEADERS.map(h => escCsv(r[h])).join(','));
  return lines.join('\n') + '\n';
}

export async function readCsv(root: FileSystemDirectoryHandle): Promise<Row[]> {
  try {
    const fh = await getCsvFile(root, false);
    const file = await fh.getFile();
    return parseCsv(await file.text());
  } catch (e: any) {
    if (e.name === 'NotFoundError') return [];
    throw e;
  }
}

export async function writeCsv(root: FileSystemDirectoryHandle, rows: Row[]): Promise<void> {
  const fh = await getCsvFile(root, true);
  const w = await fh.createWritable();
  await w.write(serializeCsv(rows));
  await w.close();
}

// ---- Images ----

export async function writeImage(root: FileSystemDirectoryHandle, filename: string, blob: Blob): Promise<void> {
  if (!/^[a-z0-9-]+\.webp$/i.test(filename)) throw new Error('Invalid filename');
  const dir = await getArtDir(root, true);
  const fh = await dir.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

export async function deleteImage(root: FileSystemDirectoryHandle, filename: string): Promise<void> {
  if (!/^[a-z0-9-]+\.webp$/i.test(filename)) return;
  try {
    const dir = await getArtDir(root, false);
    await dir.removeEntry(filename);
  } catch { /* fine if missing */ }
}

export async function readImageUrl(root: FileSystemDirectoryHandle, filename: string): Promise<string> {
  try {
    const dir = await getArtDir(root, false);
    const fh = await dir.getFileHandle(filename, { create: false });
    const file = await fh.getFile();
    return URL.createObjectURL(file);
  } catch {
    return '';
  }
}

export async function readImageBlob(root: FileSystemDirectoryHandle, filename: string): Promise<Blob | null> {
  try {
    const dir = await getArtDir(root, false);
    const fh = await dir.getFileHandle(filename, { create: false });
    return await fh.getFile();
  } catch { return null; }
}
