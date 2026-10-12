import type { Category, Season } from "./types";

export const CATEGORY_LABELS: Record<Category, string> = {
  top: "Верх",
  bottom: "Низ",
  dress: "Платье",
  outerwear: "Верхняя одежда",
  shoes: "Обувь",
  headwear: "Головной убор",
  accessory: "Аксессуар",
  bag: "Сумка",
};

export const CATEGORY_ICONS: Record<Category, string> = {
  top: "👕",
  bottom: "👖",
  dress: "👗",
  outerwear: "🧥",
  shoes: "👟",
  headwear: "🧢",
  accessory: "💍",
  bag: "👜",
};

export const SEASON_LABELS: Record<Season, string> = {
  spring: "Весна",
  summer: "Лето",
  autumn: "Осень",
  winter: "Зима",
  all: "Всесезон",
};

/** Подходит ли вещь с такими сезонами под выбранный сезон */
export function matchesSeason(itemSeasons: Season[], season: Season | undefined): boolean {
  if (!season || season === "all") return true;
  if (itemSeasons.length === 0) return true;
  return itemSeasons.includes(season) || itemSeasons.includes("all");
}

/** Сезон по текущей дате — значение по умолчанию для «Случайного образа» */
export function currentSeason(date = new Date()): Season {
  const m = date.getMonth();
  if (m <= 1 || m === 11) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "autumn";
}
