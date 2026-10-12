import type { BodyFit, Category } from "@/domain/types";

/** Модель парсинга одежды (ONNX, квантованная ~28 МБ). Можно заменить своим адресом. */
export const CLOTHES_MODEL_URL =
  process.env.NEXT_PUBLIC_CLOTHES_MODEL_URL ||
  "https://huggingface.co/Xenova/segformer_b2_clothes/resolve/main/onnx/model_quantized.onnx";

export type ClothesRequest =
  | { id: number; type: "refine"; source: Blob; cutout: Blob; modelUrl: string; wasmPath: string }
  | { id: number; type: "split"; source: Blob; cutout: Blob; modelUrl: string; wasmPath: string };

export interface RefineResult {
  /** Вырезанная вещь без вешалки и посторонних деталей (того же размера, что и исходник) */
  png: Blob;
  /** Категория, которую узнала модель */
  category?: Category;
  /** Модель одежды недоступна — использована только морфологическая очистка */
  modelError?: string;
}

export interface OutfitPiece {
  key: string;
  category: Category;
  name: string;
  /** Вещь с прозрачным фоном, обрезанная по своей рамке */
  png: Blob;
  /** Тот же фрагмент исходного фото — для кисти «Восстановить» */
  original: Blob;
  width: number;
  height: number;
  bodyFit: BodyFit;
}

export interface SplitResult {
  pieces: OutfitPiece[];
}

export type ClothesResponse =
  | { id: number; type: "progress"; stage: "download" | "process"; value: number }
  | { id: number; type: "done"; result: RefineResult | SplitResult }
  | { id: number; type: "error"; message: string };
