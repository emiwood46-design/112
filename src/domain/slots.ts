import type { Category, MannequinKind, SlotId } from "./types";

/** Логический размер холста манекена. Все координаты слоёв хранятся в этой системе. */
export const MANNEQUIN_WIDTH = 600;
export const MANNEQUIN_HEIGHT = 1200;

export interface SlotDef {
  id: SlotId;
  label: string;
  /** Центр вещи по умолчанию */
  center: { x: number; y: number };
  /** Вещь вписывается в этот прямоугольник с сохранением пропорций */
  maxWidth: number;
  maxHeight: number;
  /** Слой по умолчанию: больше — выше */
  defaultZ: number;
  /** Можно ли надеть несколько вещей в этот слот */
  multiple: boolean;
  /** Слоты, которые освобождаются при надевании вещи в этот слот */
  conflicts: SlotId[];
}

const BASE_SLOTS: Record<SlotId, SlotDef> = {
  legs: {
    id: "legs",
    label: "Низ",
    center: { x: 300, y: 830 },
    maxWidth: 240,
    maxHeight: 560,
    defaultZ: 10,
    multiple: false,
    conflicts: ["fullBody"],
  },
  feet: {
    id: "feet",
    label: "Обувь",
    center: { x: 300, y: 1118 },
    maxWidth: 230,
    maxHeight: 100,
    defaultZ: 15,
    multiple: false,
    conflicts: [],
  },
  torso: {
    id: "torso",
    label: "Верх",
    center: { x: 300, y: 400 },
    maxWidth: 320,
    maxHeight: 400,
    defaultZ: 20,
    multiple: false,
    conflicts: ["fullBody"],
  },
  fullBody: {
    id: "fullBody",
    label: "Платье",
    center: { x: 300, y: 560 },
    maxWidth: 330,
    maxHeight: 720,
    defaultZ: 20,
    multiple: false,
    conflicts: ["torso", "legs"],
  },
  outer: {
    id: "outer",
    label: "Верхняя одежда",
    center: { x: 300, y: 470 },
    maxWidth: 360,
    maxHeight: 540,
    defaultZ: 30,
    multiple: false,
    conflicts: [],
  },
  head: {
    id: "head",
    label: "Головной убор",
    center: { x: 300, y: 82 },
    maxWidth: 190,
    maxHeight: 120,
    defaultZ: 35,
    multiple: false,
    conflicts: [],
  },
  accessory: {
    id: "accessory",
    label: "Аксессуар",
    center: { x: 300, y: 240 },
    maxWidth: 150,
    maxHeight: 150,
    defaultZ: 40,
    multiple: true,
    conflicts: [],
  },
  bag: {
    id: "bag",
    label: "Сумка",
    center: { x: 440, y: 640 },
    maxWidth: 170,
    maxHeight: 200,
    defaultZ: 45,
    multiple: true,
    conflicts: [],
  },
};

/** Поправки под пропорции мужского манекена (шире плечи, выше рост торса). */
const MALE_OVERRIDES: Partial<Record<SlotId, Partial<SlotDef>>> = {
  torso: { center: { x: 300, y: 410 }, maxWidth: 360, maxHeight: 410 },
  outer: { center: { x: 300, y: 480 }, maxWidth: 400, maxHeight: 560 },
  legs: { center: { x: 300, y: 845 }, maxWidth: 250 },
  bag: { center: { x: 460, y: 650 } },
};

export function getSlot(id: SlotId, mannequin: MannequinKind): SlotDef {
  const base = BASE_SLOTS[id];
  const o = mannequin === "male" ? MALE_OVERRIDES[id] : undefined;
  return o ? { ...base, ...o } : base;
}

export const CATEGORY_SLOT: Record<Category, SlotId> = {
  top: "torso",
  bottom: "legs",
  dress: "fullBody",
  outerwear: "outer",
  shoes: "feet",
  headwear: "head",
  accessory: "accessory",
  bag: "bag",
};

/** Основные категории — по одной вещи на слот. */
export const MAIN_CATEGORIES: Category[] = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "headwear",
];
