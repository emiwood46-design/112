import type { Category } from "@/domain/types";

/**
 * Классы модели парсинга одежды segformer_b2_clothes (обучена на фото людей, датасет ATR).
 * https://huggingface.co/mattmdjaga/segformer_b2_clothes
 */
export const CLOTHES_LABELS = [
  "Background",
  "Hat",
  "Hair",
  "Sunglasses",
  "Upper-clothes",
  "Skirt",
  "Pants",
  "Dress",
  "Belt",
  "Left-shoe",
  "Right-shoe",
  "Face",
  "Left-leg",
  "Right-leg",
  "Left-arm",
  "Right-arm",
  "Bag",
  "Scarf",
] as const;

/** Группы классов → отдельные вещи гардероба */
export interface PieceGroup {
  key: string;
  labels: number[];
  category: Category;
  name: string;
}

export const PIECE_GROUPS: PieceGroup[] = [
  { key: "hat", labels: [1], category: "headwear", name: "Головной убор" },
  { key: "glasses", labels: [3], category: "accessory", name: "Очки" },
  { key: "upper", labels: [4], category: "top", name: "Верх" },
  { key: "skirt", labels: [5], category: "bottom", name: "Юбка" },
  { key: "pants", labels: [6], category: "bottom", name: "Брюки" },
  { key: "dress", labels: [7], category: "dress", name: "Платье" },
  { key: "belt", labels: [8], category: "accessory", name: "Ремень" },
  { key: "shoes", labels: [9, 10], category: "shoes", name: "Обувь" },
  { key: "bag", labels: [16], category: "bag", name: "Сумка" },
  { key: "scarf", labels: [17], category: "accessory", name: "Шарф" },
];

/** Классы, которые считаются одеждой (всё, кроме фона и частей тела) */
export const CLOTHING_LABELS = new Set(PIECE_GROUPS.flatMap((g) => g.labels));
