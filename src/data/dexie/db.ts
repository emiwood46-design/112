import Dexie, { type EntityTable } from "dexie";
import type { Item, Outfit } from "@/domain/types";

export interface BlobRecord {
  id: string;
  blob: Blob;
}

export class WardrobeDB extends Dexie {
  items!: EntityTable<Item, "id">;
  outfits!: EntityTable<Outfit, "id">;
  blobs!: EntityTable<BlobRecord, "id">;

  constructor() {
    super("virtual-wardrobe");
    this.version(1).stores({
      items: "id, category, updatedAt, *tags, *seasons",
      outfits: "id, updatedAt",
      blobs: "id",
    });
  }
}

let db: WardrobeDB | null = null;
export function getDb(): WardrobeDB {
  if (!db) db = new WardrobeDB();
  return db;
}
