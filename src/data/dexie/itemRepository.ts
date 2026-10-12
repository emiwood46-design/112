import { filterItems } from "@/domain/filter";
import type { Item, ItemDraft, ItemFilter } from "@/domain/types";
import { newId } from "@/lib/id";
import { Emitter } from "../emitter";
import type { ItemImage, ItemRepository } from "../repositories";
import type { DexieBlobStore } from "./blobStore";
import type { WardrobeDB } from "./db";

export class DexieItemRepository implements ItemRepository {
  readonly events = new Emitter();
  constructor(
    private db: WardrobeDB,
    private blobs: DexieBlobStore,
  ) {}

  async list(filter?: ItemFilter): Promise<Item[]> {
    const all = await this.db.items.orderBy("updatedAt").reverse().toArray();
    return filterItems(all, filter);
  }

  get(id: string) {
    return this.db.items.get(id);
  }

  async getMany(ids: string[]): Promise<Item[]> {
    const res = await this.db.items.bulkGet(ids);
    return res.filter((i): i is Item => !!i);
  }

  async create(draft: ItemDraft, img: ItemImage): Promise<Item> {
    const now = Date.now();
    const item: Item = {
      ...draft,
      id: newId(),
      imageId: newId(),
      thumbId: newId(),
      width: img.width,
      height: img.height,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.transaction("rw", this.db.items, this.db.blobs, async () => {
      await this.db.blobs.bulkPut([
        { id: item.imageId, blob: img.image },
        { id: item.thumbId, blob: img.thumb },
      ]);
      await this.db.items.add(item);
    });
    this.events.emit();
    return item;
  }

  async update(id: string, patch: Partial<ItemDraft>): Promise<Item> {
    const cur = await this.db.items.get(id);
    if (!cur) throw new Error("Вещь не найдена");
    const next: Item = { ...cur, ...patch, updatedAt: Date.now() };
    await this.db.items.put(next);
    this.events.emit();
    return next;
  }

  async replaceImage(id: string, img: ItemImage): Promise<Item> {
    const cur = await this.db.items.get(id);
    if (!cur) throw new Error("Вещь не найдена");
    const next: Item = {
      ...cur,
      imageId: newId(),
      thumbId: newId(),
      width: img.width,
      height: img.height,
      updatedAt: Date.now(),
    };
    await this.db.transaction("rw", this.db.items, this.db.blobs, async () => {
      await this.db.blobs.bulkPut([
        { id: next.imageId, blob: img.image },
        { id: next.thumbId, blob: img.thumb },
      ]);
      await this.db.blobs.bulkDelete([cur.imageId, cur.thumbId]);
      await this.db.items.put(next);
    });
    this.blobs.revoke(cur.imageId);
    this.blobs.revoke(cur.thumbId);
    this.events.emit();
    return next;
  }

  async delete(id: string): Promise<void> {
    const cur = await this.db.items.get(id);
    if (!cur) return;
    await this.db.transaction("rw", this.db.items, this.db.blobs, async () => {
      await this.db.items.delete(id);
      await this.db.blobs.bulkDelete([cur.imageId, cur.thumbId]);
    });
    this.blobs.revoke(cur.imageId);
    this.blobs.revoke(cur.thumbId);
    this.events.emit();
  }

  subscribe(listener: () => void) {
    return this.events.subscribe(listener);
  }
}
