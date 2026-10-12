/**
 * Автоматическая посадка вещи на фигуру манекена.
 *
 * 1. Есть силуэт (shape) — подгоняем по меркам манекена: верх — по ширине плеч,
 *    низ — по поясу (длинные брюки ещё и вытягиваются до щиколоток), обувь — по стопам
 *    и до пола, головной убор — по голове. Так вещи сидят на фигуре манекена,
 *    а не повторяют позу и ракурс человека с фото.
 * 2. Нет мерки для категории (сумки, аксессуары), но вещь вырезана из фото образа —
 *    переносим её положение с тела человека пропорционально росту.
 * 3. Иначе — вписываем в прямоугольник слота (defaultPlacement в outfitRules).
 */
import { MANNEQUIN_WIDTH } from "./slots";
import type { Category, Item, MannequinKind, OutfitLayer } from "./types";

export const SHAPE_ROWS = 20;

/** Мерки манекенов (в координатах 600×1200), сняты с SVG-силуэтов. */
export const BODY: Record<
  MannequinKind,
  {
    headTop: number;
    feetBottom: number;
    headHeight: number;
    headWidth: number;
    shoulderY: number;
    shoulderWidth: number;
    waistY: number;
    waistWidth: number;
    ankleY: number;
    feetSpan: number;
  }
> = {
  female: {
    headTop: 54,
    feetBottom: 1140,
    headHeight: 116,
    headWidth: 92,
    shoulderY: 202,
    shoulderWidth: 200,
    waistY: 452,
    waistWidth: 128,
    ankleY: 1084,
    feetSpan: 128,
  },
  male: {
    headTop: 46,
    feetBottom: 1140,
    headHeight: 124,
    headWidth: 100,
    shoulderY: 208,
    shoulderWidth: 244,
    waistY: 480,
    waistWidth: 142,
    ankleY: 1084,
    feetSpan: 124,
  },
};

type Placement = Pick<OutfitLayer, "x" | "y" | "scale" | "rotation" | "scaleY">;
type FitItem = Pick<Item, "width" | "height" | "category" | "shape" | "bodyFit">;

/** Положение по фото образа: тело человека → тело манекена. */
function fromBody(item: FitItem, m: MannequinKind): Placement | null {
  const f = item.bodyFit;
  if (!f || !(f.h > 0)) return null;
  const b = BODY[m];
  const H = b.feetBottom - b.headTop;
  return {
    x: MANNEQUIN_WIDTH / 2 + f.cx * H,
    y: b.headTop + f.cy * H,
    scale: (f.h * H) / item.height,
    rotation: 0,
  };
}

const maxOf = (a: number[], from = 0, to = a.length) => Math.max(0, ...a.slice(from, to));

/** Подгонка по силуэту. Возвращает null, если мерки для категории нет. */
function fromShape(item: FitItem, m: MannequinKind): Placement | null {
  const s = item.shape;
  if (!s || s.widths.length !== SHAPE_ROWS) return null;
  const b = BODY[m];
  const { width: w, height: h } = item;
  const cx = MANNEQUIN_WIDTH / 2;
  // Доля роста человека с фото → координата Y на манекене
  const bodyY = (frac: number) => b.headTop + frac * (b.feetBottom - b.headTop);
  // Ширина по нескольким верхним полосам: на фото образа край вещи бывает закрыт волосами или другой вещью
  const widest = (from: number, to: number) => {
    let row = from;
    for (let r = from; r <= to; r++) if (s.widths[r] > s.widths[row]) row = r;
    return row;
  };

  // Строка силуэта row шириной должна стать targetWidth, верх вещи — встать на topY
  const hang = (row: number, targetWidth: number, topY: number): Placement | null => {
    const width = s.widths[row];
    if (!(width > w * 0.05)) return null;
    const scale = targetWidth / width;
    return { x: cx + (w / 2 - s.centers[row]) * scale, y: topY + (h / 2) * scale, scale, rotation: 0 };
  };

  switch (item.category as Category) {
    case "top":
      return hang(widest(1, 2), b.shoulderWidth * 1.1, b.shoulderY);
    case "dress":
      return hang(widest(1, 2), b.shoulderWidth * 1.05, b.shoulderY);
    case "outerwear":
      return hang(widest(1, 2), b.shoulderWidth * 1.22, b.shoulderY - 6);
    case "bottom": {
      const row = widest(0, 2);
      const p = hang(row, b.waistWidth * 1.2, b.waistY);
      if (!p) return null;
      // Длина: для вещи с фото — докуда она доходит на теле человека (брюки до сапог, юбка до колена);
      // для отдельной вещи — длинные брюки до щиколоток. Ширина остаётся по поясу манекена,
      // искажение пропорций ограничено.
      const hemY = item.bodyFit
        ? bodyY(item.bodyFit.cy + item.bodyFit.h / 2)
        : h / s.widths[row] >= 2
          ? b.ankleY
          : null;
      if (hemY === null || hemY <= b.waistY + 40) return p;
      const wanted = (hemY - b.waistY) / h;
      if (item.bodyFit) {
        // Вещь с фото: длина важнее — иначе брюки не дойдут до обуви из того же образа.
        // Ширину подгоняем к поясу, но не уже 75% от пропорциональной.
        const sx = Math.min(wanted * 1.1, Math.max(wanted * 0.75, p.scale));
        return {
          x: cx + (w / 2 - s.centers[row]) * sx,
          y: b.waistY + (h / 2) * wanted,
          scale: sx,
          scaleY: wanted,
          rotation: 0,
        };
      }
      const sy = Math.min(p.scale * 1.6, Math.max(p.scale * 0.7, wanted));
      return { ...p, y: b.waistY + (h / 2) * sy, scaleY: sy };
    }
    case "shoes": {
      // Подошва на уровне пола. Высота голенища — как на фото образа, иначе подгонка по ширине стоп
      const max = maxOf(s.widths);
      if (!max) return null;
      const byWidth = (b.feetSpan * 1.3) / max;
      let scale = byWidth;
      if (item.bodyFit) {
        const topY = bodyY(item.bodyFit.cy - item.bodyFit.h / 2);
        const byHeight = (b.feetBottom - topY) / h;
        if (byHeight > 0) scale = Math.min(byWidth * 1.6, Math.max(byWidth * 0.6, byHeight));
      }
      return { x: cx, y: b.feetBottom - (h / 2) * scale, scale, rotation: 0 };
    }
    case "headwear": {
      const row = s.widths.indexOf(maxOf(s.widths, SHAPE_ROWS / 2));
      if (row < 0) return null;
      const width = s.widths[row];
      if (!(width > w * 0.05)) return null;
      const scale = (b.headWidth * 1.3) / width;
      // Нижний край шапки — чуть выше середины головы
      const bottomY = b.headTop + b.headHeight * 0.42;
      return { x: cx + (w / 2 - s.centers[row]) * scale, y: bottomY - (h / 2) * scale, scale, rotation: 0 };
    }
    default:
      return null;
  }
}

/**
 * Автоматическая посадка. boxScale — масштаб «вписать в слот»: используем его как
 * страховку от странных фото (результат не может отличаться от него больше чем в 1.6 раза).
 */
export function fitPlacement(item: FitItem, m: MannequinKind, boxScale: number): Placement | null {
  const byShape = fromShape(item, m);
  if (byShape && Number.isFinite(byShape.scale) && byShape.scale > 0) {
    if (byShape.scale <= boxScale * 1.6 && byShape.scale >= boxScale / 1.6) return byShape;
  }
  const byBody = fromBody(item, m);
  return byBody && Number.isFinite(byBody.scale) && byBody.scale > 0 ? byBody : null;
}
