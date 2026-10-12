"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { cropAndRotate, trimTransparent } from "@/services/image/process";

const ASPECTS: { label: string; value: number | "orig" }[] = [
  { label: "Как есть", value: "orig" },
  { label: "1:1", value: 1 },
  { label: "3:4", value: 3 / 4 },
  { label: "4:3", value: 4 / 3 },
];

/** Ручная обрезка и поворот вещи. Возвращает новый PNG с прозрачностью. */
export function ImageCropper({
  open,
  src,
  blob,
  onClose,
  onDone,
}: {
  open: boolean;
  src: string;
  blob: Blob;
  onClose: () => void;
  onDone: (result: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [mediaAspect, setMediaAspect] = useState(1);
  const [aspect, setAspect] = useState<number | "orig">("orig");
  const [busy, setBusy] = useState(false);

  const onComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const apply = async () => {
    if (!area) return;
    setBusy(true);
    try {
      // Лишние прозрачные поля после обрезки убираем автоматически
      onDone(await trimTransparent(await cropAndRotate(blob, area, rotation)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Обрезать и повернуть"
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-primary flex-1" onClick={apply} disabled={busy || !area}>
            {busy ? "Применяю…" : "Применить"}
          </button>
        </div>
      }
    >
      <div className="checker relative h-[50dvh] overflow-hidden rounded-2xl">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={
            aspect !== "orig"
              ? aspect
              : Math.abs(rotation) % 180 === 90
                ? 1 / mediaAspect
                : mediaAspect
          }
          onMediaLoaded={(m) => setMediaAspect(m.naturalWidth / m.naturalHeight)}
          minZoom={0.5}
          restrictPosition={false}
          objectFit="contain"
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onComplete}
          style={{ containerStyle: { background: "transparent" } }}
        />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex gap-2">
          {ASPECTS.map((a) => (
            <Chip key={a.label} active={aspect === a.value} onClick={() => setAspect(a.value)}>
              {a.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted">
          Двигайте и масштабируйте фото, чтобы отрезать лишнее. Прозрачные поля обрезаются сами.
        </p>
        <label className="flex items-center gap-3 text-sm">
          <span className="w-20 text-muted">Масштаб</span>
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[var(--color-ink)]"
          />
        </label>
        <label className="flex items-center gap-3 text-sm">
          <span className="w-20 text-muted">Поворот</span>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            className="flex-1 accent-[var(--color-ink)]"
          />
          <span className="w-10 text-right tabular-nums">{rotation}°</span>
        </label>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => setRotation((r) => ((r - 90 + 540) % 360) - 180)}>
            ⟲ 90°
          </button>
          <button className="btn-ghost flex-1" onClick={() => setRotation((r) => ((r + 90 + 540) % 360) - 180)}>
            ⟳ 90°
          </button>
          <button
            className="btn-ghost flex-1"
            onClick={() => {
              setRotation(0);
              setZoom(1);
              setCrop({ x: 0, y: 0 });
            }}
          >
            Сброс
          </button>
        </div>
      </div>
    </Sheet>
  );
}
