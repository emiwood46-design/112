import { blobToImage, canvasToBlob, createCanvas, fitSize } from "./canvas";

export const MAX_SIDE = 1500;
export const THUMB_SIDE = 400;

/**
 * Уменьшает фото до MAX_SIDE по длинной стороне перед удалением фона.
 * На выходе — JPEG (быстрее декодируется моделью и занимает меньше памяти).
 */
export async function prepareSourcePhoto(file: Blob, maxSide = MAX_SIDE): Promise<Blob> {
  const img = await blobToImage(file);
  const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, maxSide);
  const { canvas, ctx } = createCanvas(width, height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvasToBlob(canvas, "image/jpeg", 0.92);
}

/** Обрезает прозрачные поля вокруг вещи (после удаления фона). */
export async function trimTransparent(png: Blob, padding = 8, alphaThreshold = 12): Promise<Blob> {
  const img = await blobToImage(png);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const { canvas, ctx } = createCanvas(w, h);
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return png; // всё прозрачное — оставляем как есть
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(w - 1, maxX + padding);
  maxY = Math.min(h - 1, maxY + padding);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  if (cw === w && ch === h) return png;
  const out = createCanvas(cw, ch);
  out.ctx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return canvasToBlob(out.canvas, "image/png");
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Поворачивает изображение на rotation градусов и вырезает область crop
 * (координаты — в системе повёрнутого изображения, как отдаёт react-easy-crop).
 */
export async function cropAndRotate(src: Blob, crop: CropArea, rotation: number): Promise<Blob> {
  const img = await blobToImage(src);
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bw = img.naturalWidth * cos + img.naturalHeight * sin;
  const bh = img.naturalWidth * sin + img.naturalHeight * cos;

  const rotated = createCanvas(bw, bh);
  rotated.ctx.translate(bw / 2, bh / 2);
  rotated.ctx.rotate(rad);
  rotated.ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  const out = createCanvas(crop.width, crop.height);
  out.ctx.drawImage(
    rotated.canvas,
    Math.round(crop.x),
    Math.round(crop.y),
    Math.round(crop.width),
    Math.round(crop.height),
    0,
    0,
    Math.round(crop.width),
    Math.round(crop.height),
  );
  return canvasToBlob(out.canvas, "image/png");
}

/** Готовит финальные файлы вещи: PNG (≤ MAX_SIDE) + миниатюра WebP/PNG с прозрачностью. */
export async function buildItemImages(png: Blob) {
  const img = await blobToImage(png);
  const full = fitSize(img.naturalWidth, img.naturalHeight, MAX_SIDE);
  let image = png;
  if (full.width !== img.naturalWidth) {
    const c = createCanvas(full.width, full.height);
    c.ctx.drawImage(img, 0, 0, full.width, full.height);
    image = await canvasToBlob(c.canvas, "image/png");
  }
  const t = fitSize(img.naturalWidth, img.naturalHeight, THUMB_SIDE);
  const tc = createCanvas(t.width, t.height);
  tc.ctx.drawImage(img, 0, 0, t.width, t.height);
  // Safari не умеет кодировать WebP и вернёт PNG — это нормально
  const thumb = await canvasToBlob(tc.canvas, "image/webp", 0.85);
  return { image, thumb, width: full.width, height: full.height };
}
