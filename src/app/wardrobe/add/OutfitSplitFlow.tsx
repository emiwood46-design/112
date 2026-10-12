"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MaskEditor } from "@/components/items/MaskEditor";
import { Chip } from "@/components/ui/Chip";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useToast } from "@/components/ui/Toast";
import { getRepositories } from "@/data";
import { CATEGORY_ICONS, CATEGORY_LABELS, SEASON_LABELS } from "@/domain/categories";
import { PALETTE } from "@/domain/colors";
import { CATEGORIES, SEASONS, type BodyFit, type ItemDraft, type Season } from "@/domain/types";
import { makePreview, type Preview } from "@/hooks/useObjectUrl";
import { removeBackground } from "@/services/image/backgroundRemoval";
import { splitOutfit } from "@/services/image/clothesAnalysis";
import { detectDominantColor } from "@/services/image/dominantColor";
import { buildItemImages, prepareSourcePhoto } from "@/services/image/process";
import { PhotoInputs, type PhotoInputsHandle } from "./PhotoInputs";
import { stageLabel, stageValue, type Stage } from "./progress";

interface Piece {
  key: string;
  include: boolean;
  draft: ItemDraft;
  image: Preview;
  original: Blob;
  bodyFit: BodyFit;
}

export function OutfitSplitFlow({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const router = useRouter();
  const toast = useToast();
  const inputs = useRef<PhotoInputsHandle>(null);
  const jobRef = useRef(0);

  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Preview | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [makeOutfit, setMakeOutfit] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updatePiece = (key: string, fn: (p: Piece) => Piece) =>
    setPieces((ps) => ps.map((p) => (p.key === key ? fn(p) : p)));

  const onFile = async (file: File) => {
    const job = ++jobRef.current;
    const alive = () => job === jobRef.current;
    setError(null);
    setPieces([]);
    setStage({ step: "prepare" });
    onBusyChange?.(true);
    try {
      const prepared = await prepareSourcePhoto(file);
      if (!alive()) return;
      setPhoto(makePreview(prepared));
      setStage({ step: "background" });
      const cut = await removeBackground(prepared, (p) => alive() && setStage({ step: "background", p }));
      if (!alive()) return;
      setStage({ step: "clothes", task: "split" });
      const { pieces: found } = await splitOutfit(prepared, cut, (p) => alive() && setStage({ step: "clothes", task: "split", p }));
      const next: Piece[] = [];
      for (const f of found) {
        const color = await detectDominantColor(f.png);
        next.push({
          key: f.key,
          include: true,
          draft: { name: f.name, category: f.category, color: color ?? PALETTE[2], seasons: [], tags: [] },
          image: makePreview(f.png),
          original: f.original,
          bodyFit: f.bodyFit,
        });
      }
      if (!alive()) return;
      setPieces(next);
    } catch (e) {
      if (!alive()) return;
      console.error(e);
      const msg = e instanceof Error ? e.message : "";
      setError(
        !navigator.onLine
          ? "Нет сети: модели ещё не загружены. Подключитесь к интернету и повторите."
          : msg.startsWith("Не удалось найти") || msg.startsWith("На фото")
            ? `${msg}. Нужно фото человека в полный рост на однородном фоне.`
            : "Не удалось разобрать фото. Попробуйте другое — в полный рост, при хорошем освещении.",
      );
    } finally {
      if (alive()) {
        setStage(null);
        onBusyChange?.(false);
      }
    }
  };

  const save = async () => {
    const chosen = pieces.filter((p) => p.include);
    if (!chosen.length) return;
    setSaving(true);
    try {
      const repo = getRepositories().items;
      const ids: string[] = [];
      for (const p of chosen) {
        const images = await buildItemImages(p.image.blob);
        const item = await repo.create({ ...p.draft, seasons }, { ...images, bodyFit: p.bodyFit });
        ids.push(item.id);
      }
      toast(`Добавлено вещей: ${ids.length}`);
      router.push(makeOutfit ? `/outfits/editor?add=${ids.join(",")}` : "/wardrobe");
    } catch (e) {
      console.error(e);
      toast("Не удалось сохранить вещи", "error");
    } finally {
      setSaving(false);
    }
  };

  const editingPiece = pieces.find((p) => p.key === editing);

  return (
    <>
      <PhotoInputs handleRef={inputs} onFile={onFile} />
      {!photo ? (
        <div className="flex flex-col items-center gap-6 py-8 text-center">
          <div className="text-6xl" aria-hidden>
            🧍‍♀️
          </div>
          <div>
            <h2 className="text-xl font-semibold">Загрузите фото образа</h2>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Фото человека в полный рост — приложение само найдёт верх, низ, платье, обувь, головной
              убор, сумку и аксессуары, вырежет каждую вещь отдельно и наденет их на манекен.
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-3">
            <button className="btn-accent py-3.5 text-base" onClick={() => inputs.current?.gallery()}>
              Выбрать фото
            </button>
            <button className="btn-ghost py-3.5 text-base" onClick={() => inputs.current?.camera()}>
              Сфотографировать
            </button>
          </div>
          <p className="max-w-sm text-xs text-muted">
            Лучше всего: стоя прямо, руки не закрывают одежду, однородный фон. Части одежды, закрытые руками
            или сумкой, на вырезанных вещах останутся пустыми.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="flex flex-col gap-3">
            <div className="relative aspect-[3/4] overflow-hidden rounded-3xl border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="Фото образа" className="absolute inset-0 size-full object-contain" />
              {stage && (
                <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-surface/95 p-4 shadow">
                  <ProgressBar label={stageLabel(stage)} value={stageValue(stage)} />
                </div>
              )}
            </div>
            {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
            <button className="btn-ghost" onClick={() => inputs.current?.gallery()} disabled={!!stage}>
              Другое фото
            </button>
          </section>

          <section className="flex flex-col gap-4">
            {pieces.length > 0 && (
              <>
                <h2 className="font-semibold">Найдено вещей: {pieces.length}</h2>
                <div className="flex flex-col gap-3">
                  {pieces.map((p) => (
                    <div key={p.key} className={`card flex gap-3 p-3 ${p.include ? "" : "opacity-50"}`}>
                      <div className="checker relative size-24 shrink-0 overflow-hidden rounded-xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.image.url} alt={p.draft.name} className="absolute inset-0 size-full object-contain p-1" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            className="input py-1.5 text-sm"
                            value={p.draft.name}
                            aria-label="Название"
                            onChange={(e) => updatePiece(p.key, (x) => ({ ...x, draft: { ...x.draft, name: e.target.value } }))}
                          />
                          <span
                            className="size-6 shrink-0 rounded-full border border-black/10"
                            style={{ background: p.draft.color.hex }}
                            title={p.draft.color.name}
                          />
                        </div>
                        <select
                          className="input py-1.5 text-sm"
                          aria-label="Категория"
                          value={p.draft.category}
                          onChange={(e) =>
                            updatePiece(p.key, (x) => ({
                              ...x,
                              draft: { ...x.draft, category: e.target.value as ItemDraft["category"] },
                            }))
                          }
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditing(p.key)}>
                            🧽 Ластик
                          </button>
                          <label className="ml-auto flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="size-4 accent-[var(--color-accent)]"
                              checked={p.include}
                              onChange={(e) => updatePiece(p.key, (x) => ({ ...x, include: e.target.checked }))}
                            />
                            Сохранить
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <span className="label">Сезон для всех вещей</span>
                  <div className="flex flex-wrap gap-2">
                    {SEASONS.map((s) => (
                      <Chip
                        key={s}
                        active={seasons.includes(s)}
                        onClick={() => setSeasons((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))}
                      >
                        {SEASON_LABELS[s]}
                      </Chip>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent)]"
                    checked={makeOutfit}
                    onChange={(e) => setMakeOutfit(e.target.checked)}
                  />
                  Сразу открыть образ на манекене
                </label>

                <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-2xl md:border md:px-3">
                  <button
                    className="btn-primary w-full py-3"
                    onClick={save}
                    disabled={saving || !pieces.some((p) => p.include)}
                  >
                    {saving ? "Сохраняю…" : `Добавить в гардероб (${pieces.filter((p) => p.include).length})`}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {editingPiece && (
        <MaskEditor
          image={editingPiece.image.blob}
          original={editingPiece.original}
          onClose={() => setEditing(null)}
          onDone={(b) => {
            // Размер не меняется — привязка к телу остаётся верной
            updatePiece(editingPiece.key, (x) => ({ ...x, image: makePreview(b) }));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
