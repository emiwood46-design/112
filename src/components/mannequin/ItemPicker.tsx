"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BlobImage } from "@/components/items/BlobImage";
import { Chip } from "@/components/ui/Chip";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "@/domain/categories";
import { CATEGORIES, type Category, type Item } from "@/domain/types";

export const DRAG_MIME = "application/x-wardrobe-item";

/**
 * Список вещей для конструктора. На телефоне — горизонтальная лента под манекеном,
 * на десктопе — сетка в боковой панели с поддержкой перетаскивания на холст.
 */
export function ItemPicker({
  items,
  activeItemIds,
  onToggle,
}: {
  items: Item[];
  activeItemIds: Set<string>;
  onToggle: (item: Item) => void;
}) {
  const [cat, setCat] = useState<Category | "all">("all");
  const present = useMemo(() => CATEGORIES.filter((c) => items.some((i) => i.category === c)), [items]);
  const shown = cat === "all" ? items : items.filter((i) => i.category === cat);

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted">
        В гардеробе пока нет вещей.
        <Link href="/wardrobe/add" className="btn-accent">
          Добавить вещь
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-3 py-2 lg:flex-wrap">
        <Chip active={cat === "all"} onClick={() => setCat("all")}>
          Все
        </Chip>
        {present.map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            <span aria-hidden>{CATEGORY_ICONS[c]}</span>
            {CATEGORY_LABELS[c]}
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar flex min-h-0 flex-1 gap-2 overflow-x-auto px-3 pb-3 lg:grid lg:auto-rows-min lg:grid-cols-3 lg:overflow-x-hidden lg:overflow-y-auto">
        {shown.map((item) => {
          const active = activeItemIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_MIME, item.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onToggle(item)}
              title={active ? `Снять: ${item.name}` : `Надеть: ${item.name}`}
              className={`relative aspect-square h-full shrink-0 rounded-2xl border-2 bg-surface p-1.5 transition lg:h-auto lg:w-full ${
                active ? "border-accent" : "border-transparent hover:border-line"
              }`}
            >
              <BlobImage id={item.thumbId} alt={item.name} className="size-full object-contain" />
              {active && (
                <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-accent text-[11px] text-white">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
