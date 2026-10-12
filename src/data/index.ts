/**
 * Точка выбора реализации хранилища.
 * Сейчас всегда используется локальная IndexedDB. Для бэкенда добавьте, например,
 * src/data/supabase/* с реализацией интерфейсов из ./repositories и выбирайте её
 * по переменной окружения NEXT_PUBLIC_STORAGE=supabase.
 */
import { DexieBackupPort } from "./dexie/backupPort";
import { DexieBlobStore } from "./dexie/blobStore";
import { getDb } from "./dexie/db";
import { DexieItemRepository } from "./dexie/itemRepository";
import { DexieOutfitRepository } from "./dexie/outfitRepository";
import type { Repositories } from "./repositories";

let repos: Repositories | null = null;

export function getRepositories(): Repositories {
  if (typeof window === "undefined") {
    throw new Error("Хранилище доступно только в браузере");
  }
  if (!repos) {
    const db = getDb();
    const blobs = new DexieBlobStore(db);
    const items = new DexieItemRepository(db, blobs);
    const outfits = new DexieOutfitRepository(db, blobs);
    const backup = new DexieBackupPort(db, () => {
      items.events.emit();
      outfits.events.emit();
    });
    repos = { items, outfits, blobs, backup };
  }
  return repos;
}

export type * from "./repositories";
