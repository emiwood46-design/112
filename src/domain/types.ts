export const CATEGORIES = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "headwear",
  "accessory",
  "bag",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEASONS = ["spring", "summer", "autumn", "winter", "all"] as const;
export type Season = (typeof SEASONS)[number];

export type MannequinKind = "female" | "male";

export interface ItemColor {
  /** #rrggbb */
  hex: string;
  /** Человекочитаемое название, например «тёмно-синий» */
  name: string;
}

export interface Item {
  id: string;
  name: string;
  category: Category;
  color: ItemColor;
  seasons: Season[];
  tags: string[];
  /** PNG с прозрачностью в BlobStore */
  imageId: string;
  /** Сжатая миниатюра в BlobStore */
  thumbId: string;
  /** Размер полноразмерного изображения в пикселях */
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  // На будущее (синхронизация): ownerId?: string; syncedAt?: number; version?: number;
}

/** Данные вещи, которые задаёт пользователь (без служебных полей). */
export type ItemDraft = Pick<Item, "name" | "category" | "color" | "seasons" | "tags">;

export type SlotId =
  | "head"
  | "torso"
  | "outer"
  | "legs"
  | "fullBody"
  | "feet"
  | "accessory"
  | "bag";

export interface OutfitLayer {
  id: string;
  itemId: string;
  slot: SlotId;
  /** Центр вещи в координатах манекена (холст MANNEQUIN_WIDTH × MANNEQUIN_HEIGHT) */
  x: number;
  y: number;
  /** Масштаб относительно натурального размера изображения вещи */
  scale: number;
  /** Поворот в градусах */
  rotation: number;
  /** Порядок слоёв: больше — выше */
  z: number;
}

export interface Outfit {
  id: string;
  name: string;
  mannequin: MannequinKind;
  layers: OutfitLayer[];
  /** PNG-превью в BlobStore */
  previewId?: string;
  season?: Season;
  createdAt: number;
  updatedAt: number;
}

export type OutfitDraft = Pick<Outfit, "name" | "mannequin" | "layers" | "season">;

export interface ItemFilter {
  search?: string;
  categories?: Category[];
  colors?: string[];
  seasons?: Season[];
  tags?: string[];
}
