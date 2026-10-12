/**
 * Контракты слоя данных. UI и хуки работают ТОЛЬКО через эти интерфейсы.
 * Сейчас реализация — IndexedDB (Dexie), см. ./dexie. Чтобы перейти на Supabase
 * или собственный API, достаточно написать новую реализацию и подключить её в ./index.ts.
 */
import type { BodyFit, Item, ItemDraft, ItemFilter, ItemShape, Outfit, OutfitDraft } from "@/domain/types";

export type Unsubscribe = () => void;

export interface ItemRepository {
  list(filter?: ItemFilter): Promise<Item[]>;
  get(id: string): Promise<Item | undefined>;
  getMany(ids: string[]): Promise<Item[]>;
  /** Создаёт вещь, сохраняя изображение и миниатюру в BlobStore */
  create(draft: ItemDraft, image: ItemImage): Promise<Item>;
  /** touch: false — служебное обновление, не поднимает вещь наверх списка */
  update(id: string, patch: ItemPatch, opts?: { touch?: boolean }): Promise<Item>;
  /** Заменить изображение (например, после повторной обрезки) */
  replaceImage(id: string, image: ItemImage): Promise<Item>;
  delete(id: string): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
}

export type ItemPatch = Partial<ItemDraft & Pick<Item, "shape" | "bodyFit">>;

export interface ItemImage {
  image: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** Силуэт для автоматической посадки на манекен */
  shape?: ItemShape;
  /** Положение на теле (только для вещей, вырезанных из фото образа) */
  bodyFit?: BodyFit;
}

export interface OutfitRepository {
  list(): Promise<Outfit[]>;
  get(id: string): Promise<Outfit | undefined>;
  create(draft: OutfitDraft, preview?: Blob): Promise<Outfit>;
  update(id: string, draft: Partial<OutfitDraft>, preview?: Blob): Promise<Outfit>;
  duplicate(id: string): Promise<Outfit>;
  delete(id: string): Promise<void>;
  subscribe(listener: () => void): Unsubscribe;
}

export interface BlobStore {
  put(blob: Blob, id?: string): Promise<string>;
  get(id: string): Promise<Blob | undefined>;
  /** object URL для <img>/Konva; кешируется на время жизни вкладки */
  getUrl(id: string): Promise<string | undefined>;
  delete(id: string): Promise<void>;
}

/** Низкоуровневый доступ для резервного копирования (экспорт/импорт всего гардероба). */
export interface BackupPort {
  dump(): Promise<{ items: Item[]; outfits: Outfit[]; blobIds: string[] }>;
  restore(data: { items: Item[]; outfits: Outfit[] }, mode: "merge" | "replace"): Promise<void>;
}

export interface Repositories {
  items: ItemRepository;
  outfits: OutfitRepository;
  blobs: BlobStore;
  backup: BackupPort;
}
