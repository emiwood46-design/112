/** Общие утилиты работы с изображениями в браузере. */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
    img.src = src;
  });
}

/** Загружает Blob как HTMLImageElement (с учётом EXIF-ориентации — браузер применяет её сам). */
export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    // Картинка уже декодирована, URL можно освободить
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function createCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D недоступен");
  return { canvas, ctx };
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Не удалось сохранить изображение"))),
      type,
      quality,
    ),
  );
}

export function fitSize(w: number, h: number, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}
