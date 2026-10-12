import type { Item, ItemFilter } from "./types";

/** Чистая функция фильтрации — используется и локальным хранилищем, и UI. */
export function filterItems(items: Item[], filter: ItemFilter = {}): Item[] {
  const search = filter.search?.trim().toLowerCase();
  return items.filter((item) => {
    if (search) {
      const hay = [item.name, ...item.tags, item.color.name].join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (filter.categories?.length && !filter.categories.includes(item.category)) return false;
    if (filter.colors?.length && !filter.colors.includes(item.color.name)) return false;
    if (
      filter.seasons?.length &&
      !item.seasons.some((s) => s === "all" || filter.seasons!.includes(s))
    )
      return false;
    if (filter.tags?.length && !filter.tags.every((t) => item.tags.includes(t))) return false;
    return true;
  });
}

export function collectTags(items: Item[]): string[] {
  const set = new Set<string>();
  items.forEach((i) => i.tags.forEach((t) => set.add(t)));
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toLowerCase();
}
