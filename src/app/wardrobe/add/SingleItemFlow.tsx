"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImageCropper } from "@/components/items/ImageCropper";
import { ItemForm } from "@/components/items/ItemForm";
import { MaskEditor } from "@/components/items/MaskEditor";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useToast } from "@/components/ui/Toast";
import { getRepositories } from "@/data";
import { PALETTE } from "@/domain/colors";
import { collectTags } from "@/domain/filter";
import type { ItemColor, ItemDraft } from "@/domain/types";
import { useItems } from "@/hooks/useData";
import { usePreview } from "@/hooks/useObjectUrl";
import { removeBackground } from "@/services/image/backgroundRemoval";
import { blobToImage, canvasToBlob, createCanvas } from "@/services/image/canvas";
import { refineGarment } from "@/services/image/clothesAnalysis";
import { detectDominantColor } from "@/services/image/dominantColor";
import { buildItemImages, prepareSourcePhoto, trimTransparent } from "@/services/image/process";
import { PhotoInputs, type PhotoInputsHandle } from "./PhotoInputs";
import { stageLabel, stageValue, type Stage } from "./progress";

const EMPTY_DRAFT: ItemDraft = { name: "", category: "top", color: PALETTE[2], seasons: [], tags: [] };

export function SingleItemFlow({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { data: allItems } = useItems();
  const inputs = useRef<PhotoInputsHandle>(null);
  const jobRef = useRef(0);

  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = usePreview();
  const [result, setResult] = usePreview();
  /** Вырез в размере исходного фото — нужен для кисти «Восстановить» */
  const [fullCut, setFullCut] = useState<Blob | null>(null);
  /** Вырез только по фону, без удаления вешалок — чтобы можно было откатить очистку */
  const [rawCut, setRawCut] = useState<Blob | null>(null);
  const [cleaned, setCleaned] = useState(false);
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [autoColor, setAutoColor] = useState<ItemColor | undefined>();
  const [touched, setTouched] = useState({ color: false, category: false });
  const [cropOpen, setCropOpen] = useState(false);
  const [eraserOpen, setEraserOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const started = source !== null || stage !== null;

  const showResult = async (full: Blob, job: number) => {
    const trimmed = await trimTransparent(full);
    const color = await detectDominantColor(trimmed);
    if (job !== jobRef.current) return;
    setFullCut(full);
    setResult(trimmed);
    setAutoColor(color);
    if (!touched.color) setDraft((d) => ({ ...d, color }));
  };

  const onFile = async (file: File) => {
    const job = ++jobRef.current;
    const alive = () => job === jobRef.current;
    setError(null);
    setResult(null);
    setFullCut(null);
    setRawCut(null);
    setCleaned(false);
    setStage({ step: "prepare" });
    onBusyChange?.(true);
    try {
      const prepared = await prepareSourcePhoto(file);
      if (!alive()) return;
      setSource(prepared);
      setStage({ step: "background" });
      const cut = await removeBackground(prepared, (p) => alive() && setStage({ step: "background", p }));
      if (!alive()) return;
      setRawCut(cut);
      // Сразу показываем вырез, а очистку от вешалок делаем следом
      await showResult(cut, job);
      setStage({ step: "clothes", task: "refine" });
      const refined = await refineGarment(prepared, cut, (p) => alive() && setStage({ step: "clothes", task: "refine", p }));
      if (!alive()) return;
      await showResult(refined.png, job);
      setCleaned(true);
      if (refined.category && !touched.category) setDraft((d) => ({ ...d, category: refined.category! }));
      if (refined.modelError) {
        console.warn(refined.modelError);
        toast("Модель распознавания одежды недоступна — применена базовая очистка");
      }
    } catch (e) {
      if (!alive()) return;
      console.error(e);
      setError(
        navigator.onLine
          ? "Не удалось обработать фото. Можно сохранить как есть, подправить ластиком или выбрать другое фото."
          : "Нет сети: модели ещё не загружены. Подключитесь к интернету и повторите.",
      );
    } finally {
      if (alive()) {
        setStage(null);
        onBusyChange?.(false);
      }
    }
  };

  /** Пропустить удаление фона: исходное фото целиком */
  const useOriginal = async () => {
    if (!source) return;
    const job = ++jobRef.current;
    const img = await blobToImage(source.blob);
    const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    await showResult(await canvasToBlob(canvas, "image/png"), job);
    setStage(null);
    onBusyChange?.(false);
  };

  const toggleCleanup = async () => {
    if (!rawCut || !fullCut) return;
    // Откат очистки работает только пока вещь не обрезали вручную
    const job = jobRef.current;
    if (cleaned) {
      setCleaned(false);
      await showResult(rawCut, job);
    }
  };

  const reset = () => {
    jobRef.current++;
    setStage(null);
    setSource(null);
    setResult(null);
    setFullCut(null);
    setRawCut(null);
    setError(null);
    setDraft(EMPTY_DRAFT);
    setAutoColor(undefined);
    setTouched({ color: false, category: false });
    onBusyChange?.(false);
  };

  const save = async (addAnother: boolean) => {
    if (!result) return;
    setSaving(true);
    try {
      await getRepositories().items.create(draft, await buildItemImages(result.blob));
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

  return (
    <>
      <PhotoInputs handleRef={inputs} onFile={onFile} />
      {!started ? (
        <div className="flex flex-col items-center gap-6 py-8 text-center">
          <div className="text-6xl" aria-hidden>
            📸
          </div>
          <div>
            <h2 className="text-xl font-semibold">Сфотографируйте вещь</h2>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Можно прямо на вешалке — фон, вешалка и всё, что не одежда, удалятся автоматически.
              Обработка идёт на устройстве, фото никуда не отправляется.
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-3">
            <button className="btn-accent py-3.5 text-base" onClick={() => inputs.current?.camera()}>
              Сфотографировать
            </button>
            <button className="btn-ghost py-3.5 text-base" onClick={() => inputs.current?.gallery()}>
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
              {stage && (
                <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-surface/95 p-4 shadow">
                  <ProgressBar label={stageLabel(stage)} value={stageValue(stage)} />
                  <p className="mt-2 text-xs text-muted">Можно пока заполнить данные о вещи.</p>
                </div>
              )}
            </div>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

            <div className="flex flex-wrap gap-2">
              {result && (
                <>
                  <button className="btn-ghost" onClick={() => setEraserOpen(true)} disabled={!!stage}>
                    🧽 Ластик
                  </button>
                  <button className="btn-ghost" onClick={() => setCropOpen(true)} disabled={!!stage}>
                    ✂️ Обрезать / повернуть
                  </button>
                </>
              )}
              {cleaned && rawCut && !stage && (
                <button className="btn-ghost" onClick={toggleCleanup} title="Вернуть вырез до удаления вешалки">
                  ↺ Без очистки
                </button>
              )}
              {(stage?.step === "background" || error) && source && (
                <button className="btn-ghost" onClick={useOriginal}>
                  Без удаления фона
                </button>
              )}
              <button className="btn-ghost" onClick={() => inputs.current?.camera()}>
                Переснять
              </button>
              <button className="btn-ghost" onClick={() => inputs.current?.gallery()}>
                Другое фото
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <ItemForm
              value={draft}
              onChange={(d) => {
                setTouched((t) => ({
                  color: t.color || d.color !== draft.color,
                  category: t.category || d.category !== draft.category,
                }));
                setDraft(d);
              }}
              autoColor={autoColor}
              knownTags={allItems ? collectTags(allItems) : []}
            />
            <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] -mx-4 flex gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-2xl md:border md:px-3">
              <button className="btn-ghost flex-1 py-3" disabled={!result || saving || !!stage} onClick={() => save(true)}>
                Сохранить и ещё
              </button>
              <button className="btn-primary flex-1 py-3" disabled={!result || saving || !!stage} onClick={() => save(false)}>
                {saving ? "Сохраняю…" : "Сохранить"}
              </button>
            </div>
          </section>
        </div>
      )}

      {result && cropOpen && (
        <ImageCropper
          open
          src={result.url}
          blob={result.blob}
          onClose={() => setCropOpen(false)}
          onDone={(b) => {
            // После обрезки геометрия меняется — «Восстановить» и откат очистки больше недоступны
            setResult(b);
            setFullCut(null);
            setRawCut(null);
            setCleaned(false);
            setCropOpen(false);
          }}
        />
      )}

      {result && eraserOpen && (
        <MaskEditor
          image={fullCut ?? result.blob}
          original={fullCut ? source?.blob : undefined}
          onClose={() => setEraserOpen(false)}
          onDone={async (b) => {
            setEraserOpen(false);
            if (fullCut) await showResult(b, jobRef.current);
            else setResult(await trimTransparent(b));
            setRawCut(null);
            setCleaned(false);
          }}
        />
      )}
    </>
  );
}
