/**
 * Резервная копия всего гардероба в один .zip:
 *   manifest.json — формат и версия
 *   items.json, outfits.json — данные
 *   blobs.json + blobs/<id> — изображения (PNG вещей, миниатюры, превью образов)
 * Работает только через интерфейсы репозиториев, поэтому не зависит от IndexedDB.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { Repositories } from "@/data/repositories";
import type { Item, Outfit } from "@/domain/types";

const FORMAT = "virtual-wardrobe-backup";
const VERSION = 1;

interface BackupManifest {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  items: number;
  outfits: number;
}

export async function exportBackup(repos: Repositories): Promise<Blob> {
  const { items, outfits } = await repos.backup.dump();
  const ids = new Set<string>();
  items.forEach((i) => ids.add(i.imageId).add(i.thumbId));
  outfits.forEach((o) => o.previewId && ids.add(o.previewId));

  const files: Zippable = {};
  const blobMeta: { id: string; type: string }[] = [];
  for (const id of ids) {
    const blob = await repos.blobs.get(id);
    if (!blob) continue;
    blobMeta.push({ id, type: blob.type });
    // Изображения уже сжаты — храним без компрессии, так быстрее
    files[`blobs/${id}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  const manifest: BackupManifest = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    items: items.length,
    outfits: outfits.length,
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["items.json"] = strToU8(JSON.stringify(items));
  files["outfits.json"] = strToU8(JSON.stringify(outfits));
  files["blobs.json"] = strToU8(JSON.stringify(blobMeta));

  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

export async function importBackup(
  repos: Repositories,
  file: Blob,
  mode: "merge" | "replace",
): Promise<{ items: number; outfits: number }> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("Файл повреждён или это не архив резервной копии");
  }
  const json = <T,>(name: string): T => {
    const data = entries[name];
    if (!data) throw new Error(`В архиве нет ${name}`);
    return JSON.parse(strFromU8(data)) as T;
  };
  const manifest = json<BackupManifest>("manifest.json");
  if (manifest.format !== FORMAT) throw new Error("Это не резервная копия гардероба");
  if (manifest.version > VERSION) throw new Error("Копия сделана более новой версией приложения");

  const items = json<Item[]>("items.json");
  const outfits = json<Outfit[]>("outfits.json");
  const blobMeta = json<{ id: string; type: string }[]>("blobs.json");
  if (!Array.isArray(items) || !Array.isArray(outfits) || items.some((i) => !i.id || !i.imageId)) {
    throw new Error("Неверный формат данных в архиве");
  }

  // Сначала картинки, потом записи — чтобы ни одна вещь не осталась без изображения
  for (const { id, type } of blobMeta) {
    const data = entries[`blobs/${id}`];
    if (data) await repos.blobs.put(new Blob([data as Uint8Array<ArrayBuffer>], { type }), id);
  }
  await repos.backup.restore({ items, outfits }, mode);
  return { items: items.length, outfits: outfits.length };
}
