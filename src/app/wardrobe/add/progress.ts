import type { BgProgress } from "@/services/image/backgroundRemoval";
import type { ClothesProgress } from "@/services/image/clothesAnalysis";

export type Stage =
  | { step: "prepare" }
  | { step: "background"; p?: BgProgress }
  | { step: "clothes"; p?: ClothesProgress; task: "refine" | "split" };

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function stageLabel(s: Stage): string {
  switch (s.step) {
    case "prepare":
      return "Подготавливаю фото…";
    case "background":
      if (s.p?.stage === "download") return `Загружаю модель удаления фона (только в первый раз)… ${pct(s.p.value)}`;
      return "Вырезаю из фона…";
    case "clothes":
      if (s.p?.stage === "download")
        return `Загружаю модель распознавания одежды (только в первый раз)… ${pct(s.p.value)}`;
      return s.task === "refine" ? "Убираю вешалку и всё, что не одежда…" : "Ищу вещи на фото…";
  }
}

/** Значение для прогресс-бара: при загрузке модели — проценты, иначе неопределённый */
export function stageValue(s: Stage): number | undefined {
  if (s.step === "prepare") return undefined;
  return s.p?.stage === "download" ? s.p.value : undefined;
}
