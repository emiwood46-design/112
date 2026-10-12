"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ItemPicker } from "@/components/mannequin/ItemPicker";
import type { OutfitCanvasHandle } from "@/components/mannequin/OutfitCanvas";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { getRepositories } from "@/data";
import { CATEGORY_LABELS, SEASON_LABELS, currentSeason } from "@/domain/categories";
import {
  addItemToLayers,
  defaultPlacement,
  moveLayer,
  randomOutfitItems,
  sortedLayers,
} from "@/domain/outfitRules";
import { getSlot } from "@/domain/slots";
import { SEASONS, type Item, type MannequinKind, type Outfit, type OutfitLayer, type Season } from "@/domain/types";
import { useItems, useOutfit } from "@/hooks/useData";
import { newId } from "@/lib/id";
import { safeFilename, shareOrDownload } from "@/lib/share";

// Konva работает только в браузере
const OutfitCanvas = dynamic(() => import("@/components/mannequin/OutfitCanvas"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse rounded-3xl bg-line/40" />,
});

const PREVIEW_HEIGHT = 480;
const EXPORT_HEIGHT = 1800;

export function OutfitEditor() {
  const params = useSearchParams();
  const id = params.get("id");
  const addId = params.get("add");
  const { data: outfit, loading: outfitLoading } = useOutfit(id);
  const { data: items } = useItems();

  if ((id && outfitLoading) || !items) {
    return <div className="flex flex-1 items-center justify-center text-muted">Загрузка…</div>;
  }
  if (id && !outfit) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted">
        Образ не найден
        <Link href="/outfits" className="btn-ghost">
          К образам
        </Link>
      </div>
    );
  }
  return <EditorBody key={id ?? `new:${addId ?? ""}`} initial={outfit} addItemId={addId} items={items} />;
}

function EditorBody({
  initial,
  addItemId,
  items,
}: {
  initial?: Outfit;
  addItemId: string | null;
  items: Item[];
}) {
  const router = useRouter();
  const toast = useToast();
  const canvasRef = useRef<OutfitCanvasHandle>(null);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const [mannequin, setMannequin] = useState<MannequinKind>(initial?.mannequin ?? "female");
  const [name, setName] = useState(initial?.name ?? "");
  const [season, setSeason] = useState<Season>(initial?.season ?? currentSeason());
  const [layers, setLayers] = useState<OutfitLayer[]>(() => {
    const base = initial?.layers ?? [];
    const toAdd = addItemId ? itemMap.get(addItemId) : undefined;
    return toAdd ? addItemToLayers(base, toAdd, initial?.mannequin ?? "female", newId()) : base;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [randomOpen, setRandomOpen] = useState(false);
  const [busy, setBusy] = useState<"save" | "export" | null>(null);
  const [dirty, setDirty] = useState(Boolean(addItemId));

  // Вещи, удалённые из гардероба, в образе не показываем
  const visibleLayers = layers.filter((l) => itemMap.has(l.itemId));
  const missing = layers.length - visibleLayers.length;
  const activeItemIds = useMemo(() => new Set(layers.map((l) => l.itemId)), [layers]);
  const selected = visibleLayers.find((l) => l.id === selectedId);
  const selectedItem = selected ? itemMap.get(selected.itemId) : undefined;

  const change = (next: OutfitLayer[]) => {
    setLayers(next);
    setDirty(true);
  };

  // Предупреждение при закрытии вкладки с несохранёнными изменениями
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const addItem = (item: Item, point?: { x: number; y: number }) => {
    const id = newId();
    const next = addItemToLayers(layers, item, mannequin, id, point);
    if (next === layers) return;
    change(next);
    setSelectedId(id);
  };

  const toggleItem = (item: Item) => {
    const existing = layers.find((l) => l.itemId === item.id);
    if (existing) {
      change(layers.filter((l) => l.id !== existing.id));
      if (selectedId === existing.id) setSelectedId(null);
    } else addItem(item);
  };

  const updateSelected = (fn: (l: OutfitLayer) => OutfitLayer) => {
    if (!selected) return;
    change(layers.map((l) => (l.id === selected.id ? fn(l) : l)));
  };

  const resetToSlot = () => {
    if (!selected || !selectedItem) return;
    const idx = sortedLayers(layers)
      .filter((l) => l.slot === selected.slot)
      .findIndex((l) => l.id === selected.id);
    updateSelected((l) => ({ ...l, ...defaultPlacement(selectedItem, l.slot, mannequin, Math.max(0, idx)) }));
  };

  const switchMannequin = (kind: MannequinKind) => {
    if (kind === mannequin) return;
    setMannequin(kind);
    // Анатомия отличается — раскладываем вещи по слотам нового манекена
    const counters = new Map<string, number>();
    change(
      sortedLayers(layers).map((l) => {
        const item = itemMap.get(l.itemId);
        if (!item) return l;
        const n = counters.get(l.slot) ?? 0;
        counters.set(l.slot, n + 1);
        return { ...l, ...defaultPlacement(item, l.slot, kind, n) };
      }),
    );
  };

  const randomize = (s: Season) => {
    setSeason(s);
    setRandomOpen(false);
    const picked = randomOutfitItems(items, s);
    if (picked.length === 0) {
      toast(`Нет вещей для сезона «${SEASON_LABELS[s]}»`, "error");
      return;
    }
    // Аксессуары и сумки оставляем, основные вещи заменяем
    let next = layers.filter((l) => getSlot(l.slot, mannequin).multiple);
    for (const item of picked) next = addItemToLayers(next, item, mannequin, newId());
    change(next);
    setSelectedId(null);
  };

  const save = async () => {
    const repo = getRepositories().outfits;
    setBusy("save");
    try {
      setSelectedId(null);
      const preview = await canvasRef.current?.exportPng(PREVIEW_HEIGHT);
      const draft = {
        name: name.trim() || "Без названия",
        mannequin,
        season,
        layers: visibleLayers,
      };
      if (initial) {
        await repo.update(initial.id, draft, preview);
        setDirty(false);
        toast("Образ сохранён");
      } else {
        const created = await repo.create(draft, preview);
        setDirty(false);
        toast("Образ сохранён");
        router.replace(`/outfits/editor?id=${created.id}`);
      }
      setSaveOpen(false);
    } catch (e) {
      console.error(e);
      toast("Не удалось сохранить образ", "error");
    } finally {
      setBusy(null);
    }
  };

  const exportPng = async () => {
    setBusy("export");
    try {
      setSelectedId(null);
      const blob = await canvasRef.current?.exportPng(EXPORT_HEIGHT);
      if (!blob) return;
      const res = await shareOrDownload(blob, `${safeFilename(name)}.png`, name || "Мой образ");
      if (res === "downloaded") toast("PNG сохранён в загрузки");
    } catch (e) {
      console.error(e);
      toast("Не удалось экспортировать", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-64px-env(safe-area-inset-bottom))] flex-col md:h-dvh">
      {/* Верхняя панель */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-bg px-3 pt-[env(safe-area-inset-top)] md:px-6">
        <div className="flex min-h-14 min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-base font-semibold md:text-lg">
            {initial ? name || "Без названия" : "Новый образ"}
            {dirty && <span className="ml-1 text-accent">•</span>}
          </h1>
        </div>
        <div className="flex rounded-xl border border-line bg-surface p-0.5 text-sm" role="group" aria-label="Манекен">
          {(["female", "male"] as const).map((k) => (
            <button
              key={k}
              onClick={() => switchMannequin(k)}
              className={`rounded-lg px-2.5 py-1.5 ${mannequin === k ? "bg-ink text-white" : "text-muted"}`}
              aria-pressed={mannequin === k}
            >
              {k === "female" ? "Ж" : "М"}
            </button>
          ))}
        </div>
        <button className="btn-ghost px-3" onClick={() => setRandomOpen(true)} title="Случайный образ">
          🎲<span className="hidden sm:inline">Случайный</span>
        </button>
        <button className="btn-ghost px-3" onClick={exportPng} disabled={busy !== null || !visibleLayers.length} title="Экспорт в PNG">
          ⤴<span className="hidden sm:inline">PNG</span>
        </button>
        <button className="btn-primary px-3" onClick={() => setSaveOpen(true)} disabled={busy !== null || !visibleLayers.length}>
          Сохранить
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Холст с манекеном */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {missing > 0 && (
            <div className="mx-3 mt-2 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent">
              {missing} вещ. из образа удалены из гардероба и не показываются
            </div>
          )}
          <div className="min-h-0 flex-1 p-2 md:p-4">
            <OutfitCanvas
              handleRef={canvasRef}
              mannequin={mannequin}
              layers={visibleLayers}
              items={itemMap}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onLayerChange={(l) => change(layers.map((x) => (x.id === l.id ? l : x)))}
              onDropItem={(itemId, p) => {
                const it = itemMap.get(itemId);
                if (it) addItem(it, p);
              }}
            />
          </div>

          {/* Панель действий над выбранной вещью */}
          <div className="no-scrollbar flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto px-3">
            {selected && selectedItem ? (
              <>
                <span className="mr-1 max-w-28 shrink-0 truncate text-xs text-muted">
                  {selectedItem.name || CATEGORY_LABELS[selectedItem.category]}
                </span>
                <ToolBtn label="Слой выше" onClick={() => change(moveLayer(layers, selected.id, 1))}>⬆︎</ToolBtn>
                <ToolBtn label="Слой ниже" onClick={() => change(moveLayer(layers, selected.id, -1))}>⬇︎</ToolBtn>
                <ToolBtn label="Уменьшить" onClick={() => updateSelected((l) => ({ ...l, scale: l.scale * 0.9 }))}>−</ToolBtn>
                <ToolBtn label="Увеличить" onClick={() => updateSelected((l) => ({ ...l, scale: l.scale * 1.1 }))}>+</ToolBtn>
                <ToolBtn label="Повернуть влево" onClick={() => updateSelected((l) => ({ ...l, rotation: l.rotation - 15 }))}>⟲</ToolBtn>
                <ToolBtn label="Повернуть вправо" onClick={() => updateSelected((l) => ({ ...l, rotation: l.rotation + 15 }))}>⟳</ToolBtn>
                <ToolBtn label="Вернуть в слот" onClick={resetToSlot}>↺ слот</ToolBtn>
                <ToolBtn
                  label="Снять"
                  onClick={() => {
                    change(layers.filter((l) => l.id !== selected.id));
                    setSelectedId(null);
                  }}
                >
                  🗑
                </ToolBtn>
              </>
            ) : (
              <span className="text-xs text-muted">
                {visibleLayers.length
                  ? "Нажмите на вещь, чтобы двигать, масштабировать (двумя пальцами) и менять слои"
                  : "Выберите вещи ниже — они встанут на своё место"}
              </span>
            )}
          </div>
        </div>

        {/* Вещи: лента снизу на телефоне, панель справа на десктопе */}
        <aside className="h-36 shrink-0 border-t border-line bg-surface lg:h-auto lg:w-80 lg:border-t-0 lg:border-l xl:w-96">
          <ItemPicker items={items} activeItemIds={activeItemIds} onToggle={toggleItem} />
        </aside>
      </div>

      <Sheet
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={initial ? "Сохранить образ" : "Новый образ"}
        footer={
          <button className="btn-primary w-full py-3" onClick={save} disabled={busy !== null}>
            {busy === "save" ? "Сохраняю…" : "Сохранить"}
          </button>
        }
      >
        <label className="label" htmlFor="outfit-name">
          Название
        </label>
        <input
          id="outfit-name"
          className="input"
          autoFocus
          placeholder="Например, офис в пятницу"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </Sheet>

      <Sheet open={randomOpen} onClose={() => setRandomOpen(false)} title="Случайный образ">
        <p className="mb-3 text-sm text-muted">
          Подберу верх и низ (или платье), обувь, а также верхнюю одежду и головной убор, если они есть.
          Аксессуары останутся на месте.
        </p>
        <span className="label">Сезон</span>
        <div className="flex flex-wrap gap-2">
          {SEASONS.map((s) => (
            <Chip key={s} active={season === s} onClick={() => randomize(s)}>
              {s === "all" ? "Любой" : SEASON_LABELS[s]}
            </Chip>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function ToolBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="h-9 min-w-9 shrink-0 rounded-xl border border-line bg-surface px-2.5 text-sm hover:bg-bg active:scale-95"
    >
      {children}
    </button>
  );
}
