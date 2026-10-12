/**
 * НА БУДУЩЕЕ: подсказки сочетаемости по цвету и стилю.
 * Первая версия может быть локальной (цветовой круг: комплементарные/аналоговые цвета,
 * нейтральные базовые цвета сочетаются со всем), следующая — на LLM/ML-модели на сервере.
 */
import type { Item, OutfitLayer } from "@/domain/types";

export interface Suggestion {
  item: Item;
  /** 0..1 — насколько хорошо вещь подходит к текущему образу */
  score: number;
  /** Объяснение для пользователя, например «бежевый — нейтральный цвет» */
  reason: string;
}

export interface SuggestionEngine {
  /** Предложить вещи, которые подойдут к уже надетым */
  suggest(current: OutfitLayer[], wardrobe: Item[], limit?: number): Promise<Suggestion[]>;
}
