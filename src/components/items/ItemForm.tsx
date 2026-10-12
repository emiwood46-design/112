"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { CATEGORY_ICONS, CATEGORY_LABELS, SEASON_LABELS } from "@/domain/categories";
import { PALETTE, nearestPaletteColor } from "@/domain/colors";
import { normalizeTag } from "@/domain/filter";
import { CATEGORIES, SEASONS, type ItemDraft, type Season } from "@/domain/types";

export function ItemForm({
  value,
  onChange,
  autoColor,
  knownTags = [],
}: {
  value: ItemDraft;
  onChange: (v: ItemDraft) => void;
  /** Автоматически определённый цвет — показываем как подсказку */
  autoColor?: ItemDraft["color"];
  knownTags?: string[];
}) {
  const [tagInput, setTagInput] = useState("");
  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) => onChange({ ...value, [k]: v });

  const toggleSeason = (s: Season) => {
    const has = value.seasons.includes(s);
    set("seasons", has ? value.seasons.filter((x) => x !== s) : [...value.seasons, s]);
  };

  const addTag = (raw: string) => {
    const tags = raw.split(/[,\s]+/).map(normalizeTag).filter(Boolean);
    if (!tags.length) return;
    set("tags", [...new Set([...value.tags, ...tags])]);
    setTagInput("");
  };

  const suggestions = knownTags.filter(
    (t) => !value.tags.includes(t) && (!tagInput || t.startsWith(normalizeTag(tagInput))),
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="label" htmlFor="item-name">
          Название
        </label>
        <input
          id="item-name"
          className="input"
          placeholder="Например, синий свитер"
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div>
        <span className="label">Категория</span>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={value.category === c} onClick={() => set("category", c)}>
              <span aria-hidden>{CATEGORY_ICONS[c]}</span>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <span className="label">Цвет</span>
        <div className="mb-2 flex items-center gap-3">
          <span className="size-9 rounded-full border border-black/10" style={{ background: value.color.hex }} />
          <span className="text-sm font-medium">{value.color.name}</span>
          {autoColor && autoColor.hex !== value.color.hex && (
            <button type="button" className="text-xs text-accent underline" onClick={() => set("color", autoColor)}>
              вернуть авто ({autoColor.name})
            </button>
          )}
          <label className="ml-auto cursor-pointer text-xs text-muted underline">
            свой цвет
            <input
              type="color"
              className="sr-only"
              value={value.color.hex}
              onChange={(e) => set("color", { hex: e.target.value, name: nearestPaletteColor(e.target.value).name })}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button
              key={c.name}
              type="button"
              title={c.name}
              aria-label={c.name}
              onClick={() => set("color", c)}
              className={`size-8 rounded-full border-2 transition ${
                value.color.name === c.name ? "scale-110 border-ink" : "border-black/10"
              }`}
              style={{ background: c.hex }}
            />
          ))}
        </div>
      </div>

      <div>
        <span className="label">Сезон</span>
        <div className="flex flex-wrap gap-2">
          {SEASONS.map((s) => (
            <Chip key={s} active={value.seasons.includes(s)} onClick={() => toggleSeason(s)}>
              {SEASON_LABELS[s]}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="item-tags">
          Теги
        </label>
        {value.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {value.tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("tags", value.tags.filter((x) => x !== t))}
                className="rounded-full bg-accent-soft px-3 py-1 text-sm text-accent"
              >
                #{t} ✕
              </button>
            ))}
          </div>
        )}
        <input
          id="item-tags"
          className="input"
          placeholder="офис, любимое… (Enter — добавить)"
          value={tagInput}
          enterKeyHint="done"
          onChange={(e) => {
            const v = e.target.value;
            if (/[,]$/.test(v)) addTag(v);
            else setTagInput(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          onBlur={() => tagInput && addTag(tagInput)}
        />
        {suggestions.length > 0 && (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {suggestions.slice(0, 12).map((t) => (
              <Chip key={t} onClick={() => addTag(t)}>
                #{t}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
