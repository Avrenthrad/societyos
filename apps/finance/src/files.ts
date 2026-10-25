import { createEntity, type FileRef, type Transaction } from "@societyos/core";
import { link } from "@societyos/sync";
import { OWNER, store } from "./store";

/**
 * Receipts. The FileRef row syncs like everything else; the photo itself
 * sits in the browser's IndexedDB under `storageKey` ("local:<id>") until
 * Supabase Storage is set up, when it uploads and the key changes.
 * Web only for now: phones use the installed web app.
 */

const DB = "societyos-files";
const BLOBS = "blobs";

const hasIdb = () => typeof indexedDB !== "undefined";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(BLOBS);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(BLOBS, mode).objectStore(BLOBS));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const canAttach = () => typeof document !== "undefined" && hasIdb();

/** Ask the browser for a file. `capture` opens the camera on phones. */
export function pickFile(accept: string, capture = false): Promise<File | undefined> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(undefined);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    if (capture) input.setAttribute("capture", "environment");
    input.onchange = () => resolve(input.files?.[0] ?? undefined);
    input.addEventListener("cancel", () => resolve(undefined));
    input.click();
  });
}

/** Shrink a photo to at most 1600px so years of receipts fit on the device. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap === "undefined") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 600_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}

export async function attachReceipt(t: Transaction, file: File): Promise<FileRef> {
  const blob = await shrink(file);
  const ref = createEntity("file", {
    ...OWNER,
    name: file.name || "Receipt",
    mimeType: blob.type || file.type || "application/octet-stream",
    sizeBytes: blob.size,
    storageKey: "",
  });
  ref.storageKey = `local:${ref.id}`;
  await tx("readwrite", (s) => s.put(blob, ref.storageKey));
  await store.put(ref);
  await link(store, t, ref, "attached", OWNER);
  return ref;
}

const urls = new Map<string, string>();

/** A URL to show the receipt, or undefined if its photo is on another device. */
export async function receiptUrl(f: FileRef): Promise<string | undefined> {
  if (!hasIdb() || !f.storageKey.startsWith("local:")) return undefined;
  const hit = urls.get(f.storageKey);
  if (hit) return hit;
  const blob = await tx<Blob | undefined>("readonly", (s) => s.get(f.storageKey) as IDBRequest<Blob | undefined>);
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  urls.set(f.storageKey, url);
  return url;
}

export async function removeReceipt(f: FileRef) {
  await store.remove("file", f.id);
  if (hasIdb()) await tx("readwrite", (s) => s.delete(f.storageKey));
}

export async function readText(file: File): Promise<string> {
  return file.text();
}
