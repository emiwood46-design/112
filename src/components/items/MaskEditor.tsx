"use client";

import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { blobToImage, canvasToBlob, createCanvas } from "@/services/image/canvas";

type Mode = "erase" | "restore";
const MAX_UNDO = 15;

/**
 * Ручная доводка выреза кистью: «Стереть» лишнее (вешалку, руку, кусок фона)
 * и «Восстановить» случайно срезанное из исходного фото.
 * Размер результата совпадает с входным изображением.
 */
export function MaskEditor({
  image,
  original,
  onClose,
  onDone,
}: {
  image: Blob;
  /** Исходное фото того же размера — без него доступна только кисть «Стереть» */
  original?: Blob;
  onClose: () => void;
  onDone: (result: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const patternRef = useRef<CanvasPattern | null>(null);
  const undo = useRef<ImageData[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<Mode>("erase");
  const [brush, setBrush] = useState(4); // % от длинной стороны
  const [ready, setReady] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const img = await blobToImage(image);
      const canvas = canvasRef.current;
      if (!alive || !canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      if (original) {
        const o = await blobToImage(original);
        const { canvas: oc, ctx: octx } = createCanvas(canvas.width, canvas.height);
        octx.drawImage(o, 0, 0, canvas.width, canvas.height);
        patternRef.current = ctx.createPattern(oc, "no-repeat");
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [image, original]);

  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = (Math.max(c.width, c.height) * brush) / 100;
    if (mode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "#000";
    } else if (patternRef.current) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = patternRef.current;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.01, to.y);
    ctx.stroke();
    ctx.restore();
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const c = canvasRef.current!;
    undo.current.push(c.getContext("2d")!.getImageData(0, 0, c.width, c.height));
    if (undo.current.length > MAX_UNDO) undo.current.shift();
    setUndoCount(undo.current.length);
    const p = toCanvas(e);
    last.current = p;
    stroke(p, p);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const p = toCanvas(e);
    stroke(last.current, p);
    last.current = p;
  };
  const onUp = () => {
    last.current = null;
  };

  const doUndo = () => {
    const snap = undo.current.pop();
    if (snap) canvasRef.current!.getContext("2d")!.putImageData(snap, 0, 0);
    setUndoCount(undo.current.length);
  };

  const apply = async () => {
    setBusy(true);
    try {
      onDone(await canvasToBlob(canvasRef.current!, "image/png"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Ластик"
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={doUndo} disabled={!undoCount}>
            ↶ Отменить
          </button>
          <button className="btn-primary flex-1" onClick={apply} disabled={!ready || busy}>
            {busy ? "Применяю…" : "Готово"}
          </button>
        </div>
      }
    >
      <div className="checker flex h-[52dvh] items-center justify-center overflow-hidden rounded-2xl">
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full touch-none"
          style={{ cursor: "crosshair" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <Chip active={mode === "erase"} onClick={() => setMode("erase")}>
            🧽 Стереть
          </Chip>
          {original && (
            <Chip active={mode === "restore"} onClick={() => setMode("restore")}>
              🖌 Восстановить
            </Chip>
          )}
        </div>
        <label className="flex items-center gap-3 text-sm">
          <span className="w-20 text-muted">Кисть</span>
          <input
            type="range"
            min={1}
            max={12}
            step={0.5}
            value={brush}
            onChange={(e) => setBrush(Number(e.target.value))}
            className="flex-1 accent-[var(--color-ink)]"
          />
        </label>
        <p className="text-xs text-muted">
          Проведите пальцем по лишнему — например, по вешалке.
          {original ? " «Восстановить» возвращает пиксели исходного фото." : ""}
        </p>
      </div>
    </Sheet>
  );
}
