"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ItemCard } from "@/components/items/ItemCard";
import { Chip } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet } from "@/components/ui/Sheet";
import { CATEGORY_ICONS, CATEGORY_LABELS, SEASON_LABELS } from "@/domain/categories";
import { PALETTE } from "@/domain/colors";
import { collectTags, filterItems } from "@/domain/filter";
import { CATEGORIES, SEASONS, type Category, type ItemFilter, type Season } from "@/domain/types";
import { useItems } from "@/hooks/useData";

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const a = arr ?? [];
  return a.includes(v) ? a.filter((x) => x !== v) : [...a, v];
}

export function WardrobeScreen() {
  // Грузим всё и фильтруем на клиенте: так фильтры мгновенные, а счётчики считаются по полному списку
  const { data: all, loading } = useItems();
  const [filter, setFilter] = useState<ItemFilter>({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  const items = useMemo(() => (all ? filterItems(all, filter) : []), [all, filter]);
  const tags = useMemo(() => (all ? collectTags(all) : []), [all]);
  const usedColors = useMemo(() => new Set(all?.map((i) => i.color.name)), [all]);
  const countByCat = useMemo(() => {
    const m = new Map<Category, number>();
    all?.forEach((i) => m.set(i.category, (m.get(i.category) ?? 0) + 1));
    return m;
  }, [all]);

  const extraFilters =
    (filter.colors?.length ?? 0) + (filter.seasons?.length ?? 0) + (filter.tags?.length ?? 0);

  return (
    <>
      <PageHeader
        title="Гардероб"
        actions={
          <Link href="/wardrobe/add" className="btn-accent hidden md:inline-flex">
            + Добавить вещь
          </Link>
        }
      />

      <div className="sticky top-14 z-10 flex flex-col gap-3 bg-bg/95 px-4 py-3 backdrop-blur md:px-8">
        <div className="flex gap-2">
          <input
            type="search"
            className="input"
            placeholder="Поиск по названию, тегам, цвету"
            value={filter.search ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
          <button className="btn-ghost relative shrink-0" onClick={() => setFiltersOpen(true)}>
            Фильтры
            {extraFilters > 0 && (
              <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-accent text-[11px] text-white">
                {extraFilters}
              </span>
            )}
          </button>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <Chip active={!filter.categories?.length} onClick={() => setFilter((f) => ({ ...f, categories: [] }))}>
            Все {all ? <span className="opacity-60">{all.length}</span> : null}
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              active={filter.categories?.includes(c)}
              onClick={() => setFilter((f) => ({ ...f, categories: toggle(f.categories, c) }))}
            >
              <span aria-hidden>{CATEGORY_ICONS[c]}</span>
              {CATEGORY_LABELS[c]}
              {countByCat.get(c) ? <span className="opacity-60">{countByCat.get(c)}</span> : null}
            </Chip>
          ))}
        </div>
      </div>

      <div className="px-4 pb-6 md:px-8">
        {loading && !all ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="card aspect-[4/5] animate-pulse" />
            ))}
          </div>
        ) : all?.length === 0 ? (
          <EmptyWardrobe />
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-muted">
            Ничего не найдено.{" "}
            <button className="text-accent underline" onClick={() => setFilter({})}>
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Плавающая кнопка на телефоне */}
      <Link
        href="/wardrobe/add"
        aria-label="Добавить вещь"
        className="fixed right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 rounded-full bg-accent px-5 py-3.5 font-medium text-white shadow-lg active:scale-95 md:hidden"
      >
        <span className="text-xl leading-none">+</span> Добавить вещь
      </Link>

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Фильтры"
        footer={
          <div className="flex gap-2">
            <button
              className="btn-ghost flex-1"
              onClick={() => setFilter((f) => ({ search: f.search, categories: f.categories }))}
            >
              Сбросить
            </button>
            <button className="btn-primary flex-1" onClick={() => setFiltersOpen(false)}>
              Показать {items.length}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <span className="label">Цвет</span>
            <div className="flex flex-wrap gap-2">
              {PALETTE.filter((c) => usedColors.has(c.name)).map((c) => (
                <Chip
                  key={c.name}
                  active={filter.colors?.includes(c.name)}
                  onClick={() => setFilter((f) => ({ ...f, colors: toggle(f.colors, c.name) }))}
                >
                  <span className="size-3.5 rounded-full border border-black/10" style={{ background: c.hex }} />
                  {c.name}
                </Chip>
              ))}
              {usedColors.size === 0 && <span className="text-sm text-muted">Пока нет вещей</span>}
            </div>
          </div>
          <div>
            <span className="label">Сезон</span>
            <div className="flex flex-wrap gap-2">
              {SEASONS.filter((s) => s !== "all").map((s: Season) => (
                <Chip
                  key={s}
                  active={filter.seasons?.includes(s)}
                  onClick={() => setFilter((f) => ({ ...f, seasons: toggle(f.seasons, s) }))}
                >
                  {SEASON_LABELS[s]}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Теги</span>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <Chip
                  key={t}
                  active={filter.tags?.includes(t)}
                  onClick={() => setFilter((f) => ({ ...f, tags: toggle(f.tags, t) }))}
                >
                  #{t}
                </Chip>
              ))}
              {tags.length === 0 && <span className="text-sm text-muted">Тегов пока нет</span>}
            </div>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function EmptyWardrobe() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="text-6xl" aria-hidden>
        🧺
      </div>
      <h2 className="text-lg font-semibold">Гардероб пока пуст</h2>
      <p className="max-w-xs text-sm text-muted">
        Сфотографируйте первую вещь — фон удалится автоматически, и её можно будет примерять на манекене.
      </p>
      <Link href="/wardrobe/add" className="btn-accent">
        Добавить первую вещь
      </Link>
    </div>
  );
}
