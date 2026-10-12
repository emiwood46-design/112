import { nearestPaletteColor, rgbToHex } from "@/domain/colors";
import type { ItemColor } from "@/domain/types";
import { blobToImage, createCanvas, fitSize } from "./canvas";

/**
 * Определяет основной цвет вещи: берём только непрозрачные пиксели,
 * раскладываем по корзинам (по 3 бита на канал), берём самую населённую
 * и усредняем её пиксели.
 */
export async function detectDominantColor(png: Blob): Promise<ItemColor> {
  const img = await blobToImage(png);
  const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, 96);
  const { ctx } = createCanvas(width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;

  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n++;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  }
  let best: { n: number; r: number; g: number; b: number } | undefined;
  for (const bin of bins.values()) if (!best || bin.n > best.n) best = bin;
  if (!best) return nearestPaletteColor("#8e8e8e");

  const hex = rgbToHex(best.r / best.n, best.g / best.n, best.b / best.n);
  return { hex, name: nearestPaletteColor(hex).name };
}
