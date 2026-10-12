import type { Item, Outfit } from "@/domain/types";
import type { BackupPort } from "../repositories";
import type { WardrobeDB } from "./db";

export class DexieBackupPort implements BackupPort {
  constructor(
    private db: WardrobeDB,
    private onChange: () => void,
  ) {}

  async dump() {
    const [items, outfits, blobIds] = await Promise.all([
      this.db.items.toArray(),
      this.db.outfits.toArray(),
      this.db.blobs.toCollection().primaryKeys(),
    ]);
    return { items, outfits, blobIds: blobIds as string[] };
  }

  async restore(data: { items: Item[]; outfits: Outfit[] }, mode: "merge" | "replace") {
    await this.db.transaction("rw", this.db.items, this.db.outfits, async () => {
      if (mode === "replace") {
        await this.db.items.clear();
        await this.db.outfits.clear();
      }
      await this.db.items.bulkPut(data.items);
      await this.db.outfits.bulkPut(data.outfits);
    });
    if (mode === "replace") await this.collectGarbage();
    this.onChange();
  }

  /** Удаляет картинки, на которые больше никто не ссылается */
  private async collectGarbage() {
    const [items, outfits, ids] = await Promise.all([
      this.db.items.toArray(),
      this.db.outfits.toArray(),
      this.db.blobs.toCollection().primaryKeys(),
    ]);
    const used = new Set<string>();
    items.forEach((i) => used.add(i.imageId).add(i.thumbId));
    outfits.forEach((o) => o.previewId && used.add(o.previewId));
    const orphan = (ids as string[]).filter((id) => !used.has(id));
    if (orphan.length) await this.db.blobs.bulkDelete(orphan);
  }
}
