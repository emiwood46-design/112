"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImageCropper } from "@/components/items/ImageCropper";
import { ItemForm } from "@/components/items/ItemForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useToast } from "@/components/ui/Toast";
import { getRepositories } from "@/data";
import { PALETTE } from "@/domain/colors";
import { collectTags } from "@/domain/filter";
import type { ItemColor, ItemDraft } from "@/domain/types";
import { useItems } from "@/hooks/useData";
import { usePreview } from "@/hooks/useObjectUrl";
import { removeBackground, type BgProgress } from "@/services/image/backgroundRemoval";
import { blobToImage, canvasToBlob, createCanvas } from "@/services/image/canvas";
import { detectDominantColor } from "@/services/image/dominantColor";
import { buildItemImages, prepareSourcePhoto, trimTransparent } from "@/services/image/process";

type Status = "idle" | "preparing" | "removing" | "ready" | "error";

const EMPTY_DRAFT: ItemDraft = {
  name: "",
  category: "top",
  color: PALETTE[2],
  seasons: [],
  tags: [],
};

export function AddItemScreen() {
  const router = useRouter();
  const toast = useToast();
  const { data: allItems } = useItems();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const jobRef = useRef(0);

  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<BgProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = usePreview();
  const [result, setResult] = usePreview();
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [autoColor, setAutoColor] = useState<ItemColor | undefined>();
  const [colorTouched, setColorTouched] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const applyResult = async (png: Blob, job: number) => {
    const color = await detectDominantColor(png);
    if (job !== jobRef.current) return;
    setResult(png);
    setAutoColor(color);
    if (!colorTouched) setDraft((d) => ({ ...d, color }));
    setStatus("ready");
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const job = ++jobRef.current;
    setError(null);
    setResult(null);
    setProgress(null);
    setStatus("preparing");
    try {
      const prepared = await prepareSourcePhoto(file);
      if (job !== jobRef.current) return;
      setSource(prepared);
      setStatus("removing");
      const cut = await removeBackground(prepared, (p) => job === jobRef.current && setProgress(p));
      if (job !== jobRef.current) return;
      await applyResult(await trimTransparent(cut), job);
    } catch (e) {
      if (job !== jobRef.current) return;
      console.error(e);
      setError(
        navigator.onLine
          ? "Не удалось удалить фон. Можно сохранить фото как есть или попробовать другое."
          : "Нет сети: модель удаления фона ещё не загружена. Подключитесь к интернету и повторите.",
      );
      setStatus("error");
    }
  };

  /** Пропустить удаление фона: используем исходное фото как PNG */
  const useOriginal = async () => {
    if (!source) return;
    const job = ++jobRef.current;
    const img = await blobToImage(source.blob);
    const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    await applyResult(await canvasToBlob(canvas, "image/png"), job);
  };

  const reset = () => {
    jobRef.current++;
    setStatus("idle");
    setSource(null);
    setResult(null);
    setError(null);
    setDraft(EMPTY_DRAFT);
    setAutoColor(undefined);
    setColorTouched(false);
  };

  const save = async (addAnother: boolean) => {
    if (!result) return;
    setSaving(true);
    try {
      const images = await buildItemImages(result.blob);
      await getRepositories().items.create(draft, images);
      toast("Вещь добавлена в гардероб");
      if (addAnother) reset();
      else router.push("/wardrobe");
    } catch (e) {
      console.error(e);
      toast("Не удалось сохранить вещь", "error");
    } finally {
      setSaving(false);
    }
  };

  const progressLabel = () => {
    if (status === "preparing") return "Подготавливаю фото…";
    if (!progress) return "Запускаю удаление фона…";
    if (progress.stage === "download")
      return `Загружаю модель (только в первый раз)… ${Math.round(progress.value * 100)}%`;
    return "Вырезаю вещь из фона…";
  };

  return (
    <>
      <PageHeader
        title="Новая вещь"
        back={
          <Link href="/wardrobe" className="-ml-2 rounded-full p-2 hover:bg-line/50" aria-label="Назад">
            ←
          </Link>
        }
      />

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
        {status === "idle" ? (
          <div className="flex flex-col items-center gap-6 py-10 text-center">
            <div className="text-6xl" aria-hidden>
              📸
            </div>
            <div>
              <h2 className="text-xl font-semibold">Сфотографируйте вещь</h2>
              <p className="mt-2 max-w-sm text-sm text-muted">
                Разложите вещь на ровном контрастном фоне или повесьте на дверь. Фон удалится
                автоматически прямо на устройстве — фото никуда не отправляется.
              </p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-3">
              <button className="btn-accent py-3.5 text-base" onClick={() => cameraRef.current?.click()}>
                Сфотографировать
              </button>
              <button className="btn-ghost py-3.5 text-base" onClick={() => galleryRef.current?.click()}>
                Выбрать из галереи
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="flex flex-col gap-3">
              <div className="checker relative aspect-[3/4] overflow-hidden rounded-3xl border border-line">
                {(result ?? source) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={(result ?? source)!.url}
                    alt="Превью вещи"
                    className={`absolute inset-0 size-full object-contain p-4 transition ${
                      result ? "" : "opacity-50 blur-[1px]"
                    }`}
                  />
                )}
                {(status === "preparing" || status === "removing") && (
                  <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-surface/95 p-4 shadow">
                    <ProgressBar
                      label={progressLabel()}
                      value={progress?.stage === "download" ? progress.value : undefined}
                    />
                    <p className="mt-2 text-xs text-muted">
                      Можно пока заполнить данные о вещи ниже.
                    </p>
                  </div>
                )}
              </div>

              {status === "error" && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
              )}

              <div className="flex flex-wrap gap-2">
                {result && (
                  <button className="btn-ghost" onClick={() => setCropOpen(true)}>
                    ✂️ Обрезать / повернуть
                  </button>
                )}
                {(status === "removing" || status === "error") && source && (
                  <button className="btn-ghost" onClick={useOriginal}>
                    Без удаления фона
                  </button>
                )}
                <button className="btn-ghost" onClick={() => cameraRef.current?.click()}>
                  Переснять
                </button>
                <button className="btn-ghost" onClick={() => galleryRef.current?.click()}>
                  Другое фото
                </button>
              </div>
            </section>

            <section className="flex flex-col gap-6">
              <ItemForm
                value={draft}
                onChange={(d) => {
                  if (d.color !== draft.color) setColorTouched(true);
                  setDraft(d);
                }}
                autoColor={autoColor}
                knownTags={allItems ? collectTags(allItems) : []}
              />
              <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] -mx-4 flex gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-2xl md:border md:px-3">
                <button
                  className="btn-ghost flex-1 py-3"
                  disabled={!result || saving}
                  onClick={() => save(true)}
                >
                  Сохранить и ещё
                </button>
                <button
                  className="btn-primary flex-1 py-3"
                  disabled={!result || saving}
                  onClick={() => save(false)}
                >
                  {saving ? "Сохраняю…" : "Сохранить"}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>

      {result && cropOpen && (
        <ImageCropper
          open
          src={result.url}
          blob={result.blob}
          onClose={() => setCropOpen(false)}
          onDone={(b) => {
            setResult(b);
            setCropOpen(false);
          }}
        />
      )}
    </>
  );
}
