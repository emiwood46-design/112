import { matchesSeason } from "./categories";
import { CATEGORY_SLOT, getSlot } from "./slots";
import type { Item, MannequinKind, OutfitLayer, Season, SlotId } from "./types";

/** Позиция и масштаб вещи «по умолчанию» в её слоте. */
export function defaultPlacement(
  item: Pick<Item, "width" | "height">,
  slotId: SlotId,
  mannequin: MannequinKind,
  indexInSlot = 0,
): Pick<OutfitLayer, "x" | "y" | "scale" | "rotation"> {
  const slot = getSlot(slotId, mannequin);
  const scale = Math.min(slot.maxWidth / item.width, slot.maxHeight / item.height);
  // Несколько аксессуаров/сумок раскладываем веером, чтобы не лежали друг на друге
  const offsets = [
    [0, 0],
    [-150, 380],
    [150, 380],
    [-140, 60],
    [140, 60],
  ];
  const [dx, dy] = slot.multiple ? offsets[indexInSlot % offsets.length] : [0, 0];
  return { x: slot.center.x + dx, y: slot.center.y + dy, scale, rotation: 0 };
}

/**
 * Добавляет вещь в образ по правилам слотов:
 * основные категории заменяют вещь в своём слоте (и конфликтующих — платье ↔ верх/низ),
 * аксессуаров и сумок можно несколько.
 */
export function addItemToLayers(
  layers: OutfitLayer[],
  item: Item,
  mannequin: MannequinKind,
  newLayerId: string,
  dropPoint?: { x: number; y: number },
): OutfitLayer[] {
  const slotId = CATEGORY_SLOT[item.category];
  const slot = getSlot(slotId, mannequin);

  let next = layers;
  if (slot.multiple) {
    // Повторно ту же вещь не добавляем
    if (layers.some((l) => l.itemId === item.id)) return layers;
  } else {
    const freed = new Set<SlotId>([slotId, ...slot.conflicts]);
    next = layers.filter((l) => !freed.has(l.slot));
  }

  const indexInSlot = next.filter((l) => l.slot === slotId).length;
  const placement = defaultPlacement(item, slotId, mannequin, indexInSlot);
  // Перетащили на конкретное место — для аксессуаров уважаем точку броска
  if (slot.multiple && dropPoint) {
    placement.x = dropPoint.x;
    placement.y = dropPoint.y;
  }
  const z = Math.max(slot.defaultZ, ...next.filter((l) => l.slot === slotId).map((l) => l.z + 1));
  return [...next, { id: newLayerId, itemId: item.id, slot: slotId, z, ...placement }];
}

export function sortedLayers(layers: OutfitLayer[]): OutfitLayer[] {
  return [...layers].sort((a, b) => a.z - b.z);
}

/** Поднять/опустить слой на одну позицию. */
export function moveLayer(layers: OutfitLayer[], id: string, dir: 1 | -1): OutfitLayer[] {
  const sorted = sortedLayers(layers);
  const i = sorted.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return layers;
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  // Переписываем z по новому порядку
  const zMap = new Map(sorted.map((l, idx) => [l.id, idx * 10]));
  return layers.map((l) => ({ ...l, z: zMap.get(l.id)! }));
}

function pick<T>(arr: T[], rnd: () => number): T | undefined {
  return arr.length ? arr[Math.floor(rnd() * arr.length)] : undefined;
}

/**
 * «Случайный образ»: верх + низ или платье, обувь, и если есть — верхняя одежда и головной убор.
 * Вещи фильтруются по сезону.
 */
export function randomOutfitItems(
  items: Item[],
  season: Season | undefined,
  rnd: () => number = Math.random,
): Item[] {
  const pool = items.filter((i) => matchesSeason(i.seasons, season));
  const by = (c: Item["category"]) => pool.filter((i) => i.category === c);
  const tops = by("top");
  const bottoms = by("bottom");
  const dresses = by("dress");

  const result: Item[] = [];
  const canSeparates = tops.length > 0 && bottoms.length > 0;
  const useDress = dresses.length > 0 && (!canSeparates || rnd() < 0.5);
  if (useDress) {
    result.push(pick(dresses, rnd)!);
  } else {
    const top = pick(tops, rnd);
    const bottom = pick(bottoms, rnd);
    if (top) result.push(top);
    if (bottom) result.push(bottom);
  }
  for (const c of ["shoes", "outerwear", "headwear"] as const) {
    const it = pick(by(c), rnd);
    if (it) result.push(it);
  }
  return result;
}
