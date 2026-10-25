// Private document storage. Files are never public: they are served only through
// links signed with FILE_URL_SECRET that expire after a few minutes.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { sign, verifySignature } from "../services/crypto.js";

export const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const root = () => resolve(import.meta.dirname, "..", "..", config().STORAGE_DIR);
const pathFor = (key: string) => {
  const p = resolve(root(), key);
  if (!p.startsWith(root())) throw new Error("Bad file key");
  return p;
};

/** Checks the file's first bytes so a renamed file can't pass as an image or PDF. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

// "local" keeps files on disk (development, or a host with a persistent disk).
// "database" keeps them in the stored_files table (hosts without a disk, such as Render free).
const inDatabase = () => config().STORAGE_PROVIDER === "database";

export async function saveFile(folder: string, mime: string, data: Buffer): Promise<string> {
  const key = `${folder}/${randomUUID()}.${ALLOWED_MIME[mime]}`;
  if (inDatabase()) {
    await prisma.storedFile.create({ data: { key, mimeType: mime, data: new Uint8Array(data) } });
    return key;
  }
  const p = pathFor(key);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, data, { mode: 0o600 });
  return key;
}

export async function readStoredFile(key: string): Promise<Buffer> {
  if (inDatabase()) {
    const f = await prisma.storedFile.findUnique({ where: { key } });
    if (!f) throw new Error("File not found");
    return Buffer.from(f.data);
  }
  return readFile(pathFor(key));
}

export function signedFileUrl(key: string, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(`${key}:${exp}`);
  return `${config().PUBLIC_BASE_URL}/api/v1/files/${key}?exp=${exp}&sig=${sig}`;
}

export function checkSignedFile(key: string, exp: string, sig: string): boolean {
  const e = Number(exp);
  if (!Number.isInteger(e) || e < Date.now() / 1000) return false;
  return verifySignature(`${key}:${e}`, sig);
}
