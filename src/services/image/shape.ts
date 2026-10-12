import { SHAPE_ROWS } from "@/domain/fit";
import type { ItemShape } from "@/domain/types";
import { blobToImage, createCanvas } from "./canvas";

/**
 * Профиль силуэта по альфа-каналу: для каждой из SHAPE_ROWS полос — средняя ширина
 * непрозрачной части (от крайнего левого до крайнего правого пикселя) и её центр.
 */
export function measureShape(alpha: (i: number) => number, w: number, h: number, threshold = 128): ItemShape {
  const widths: number[] = [];
  const centers: number[] = [];
  for (let band = 0; band < SHAPE_ROWS; band++) {
    const y0 = Math.floor((band / SHAPE_ROWS) * h);
    const y1 = Math.max(y0 + 1, Math.floor(((band + 1) / SHAPE_ROWS) * h));
    let sumW = 0,
      sumC = 0,
      rows = 0;
    for (let y = y0; y < y1; y++) {
      let left = -1,
        right = -1;
      for (let x = 0; x < w; x++) {
        if (alpha(y * w + x) >= threshold) {
          if (left < 0) left = x;
          right = x;
        }
      }
      if (left >= 0) {
        sumW += right - left + 1;
        sumC += (left + right) / 2;
        rows++;
      }
    }
    widths.push(rows ? Math.round(sumW / rows) : 0);
    centers.push(rows ? Math.round(sumC / rows) : w / 2);
  }
  return { widths, centers };
}

/** Силуэт по PNG-файлу вещи. */
export async function measureBlobShape(blob: Blob): Promise<ItemShape> {
  const img = await blobToImage(blob);
  const { ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data;
  return measureShape((i) => data[i * 4 + 3], img.naturalWidth, img.naturalHeight);
}
