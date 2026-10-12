import { newId } from "@/lib/id";
import type { BlobStore } from "../repositories";
import type { WardrobeDB } from "./db";

export class DexieBlobStore implements BlobStore {
  private urls = new Map<string, string>();
  constructor(private db: WardrobeDB) {}

  async put(blob: Blob, id = newId()): Promise<string> {
    await this.db.blobs.put({ id, blob });
    this.revoke(id);
    return id;
  }

  async get(id: string): Promise<Blob | undefined> {
    return (await this.db.blobs.get(id))?.blob;
  }

  async getUrl(id: string): Promise<string | undefined> {
    const cached = this.urls.get(id);
    if (cached) return cached;
    const blob = await this.get(id);
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    this.urls.set(id, url);
    return url;
  }

  async delete(id: string): Promise<void> {
    await this.db.blobs.delete(id);
    this.revoke(id);
  }

  revoke(id: string) {
    const url = this.urls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      this.urls.delete(id);
    }
  }
}
