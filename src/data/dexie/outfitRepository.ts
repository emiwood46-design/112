import type { Outfit, OutfitDraft } from "@/domain/types";
import { newId } from "@/lib/id";
import { Emitter } from "../emitter";
import type { OutfitRepository } from "../repositories";
import type { DexieBlobStore } from "./blobStore";
import type { WardrobeDB } from "./db";

export class DexieOutfitRepository implements OutfitRepository {
  readonly events = new Emitter();
  constructor(
    private db: WardrobeDB,
    private blobs: DexieBlobStore,
  ) {}

  list() {
    return this.db.outfits.orderBy("updatedAt").reverse().toArray();
  }

  get(id: string) {
    return this.db.outfits.get(id);
  }

  async create(draft: OutfitDraft, preview?: Blob): Promise<Outfit> {
    const now = Date.now();
    const outfit: Outfit = { ...draft, id: newId(), createdAt: now, updatedAt: now };
    if (preview) outfit.previewId = await this.blobs.put(preview);
    await this.db.outfits.add(outfit);
    this.events.emit();
    return outfit;
  }

  async update(id: string, draft: Partial<OutfitDraft>, preview?: Blob): Promise<Outfit> {
    const cur = await this.db.outfits.get(id);
    if (!cur) throw new Error("Образ не найден");
    const next: Outfit = { ...cur, ...draft, updatedAt: Date.now() };
    if (preview) {
      next.previewId = await this.blobs.put(preview);
      if (cur.previewId) await this.blobs.delete(cur.previewId);
    }
    await this.db.outfits.put(next);
    this.events.emit();
    return next;
  }

  async duplicate(id: string): Promise<Outfit> {
    const cur = await this.db.outfits.get(id);
    if (!cur) throw new Error("Образ не найден");
    const preview = cur.previewId ? await this.blobs.get(cur.previewId) : undefined;
    return this.create(
      {
        name: `${cur.name} (копия)`,
        mannequin: cur.mannequin,
        season: cur.season,
        layers: cur.layers.map((l) => ({ ...l, id: newId() })),
      },
      preview,
    );
  }

  async delete(id: string): Promise<void> {
    const cur = await this.db.outfits.get(id);
    if (!cur) return;
    await this.db.outfits.delete(id);
    if (cur.previewId) await this.blobs.delete(cur.previewId);
    this.events.emit();
  }

  subscribe(listener: () => void) {
    return this.events.subscribe(listener);
  }
}
