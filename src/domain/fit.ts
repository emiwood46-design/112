/**
 * Автоматическая посадка вещи на фигуру манекена.
 *
 * 1. Вещь вырезана из фото образа (есть bodyFit) — переносим её положение
 *    с тела человека на манекен пропорционально росту.
 * 2. Есть силуэт (shape) — подгоняем по ключевой мерке категории:
 *    верх — по ширине плеч, низ — по поясу, обувь — по ширине стоп, шапка — по голове.
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
    feetSpan: 124,
  },
};

type Placement = Pick<OutfitLayer, "x" | "y" | "scale" | "rotation">;
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

/** Подгонка по силуэту. Возвращает null, если мерка не подходит для категории. */
function fromShape(item: FitItem, m: MannequinKind): Placement | null {
  const s = item.shape;
  if (!s || s.widths.length !== SHAPE_ROWS) return null;
  const b = BODY[m];
  const { width: w, height: h } = item;
  const cx = MANNEQUIN_WIDTH / 2;

  // Привязка: строка силуэта (row), её ширина должна стать targetWidth,
  // а точка (centers[row], anchorImgY) встать в (cx, anchorBodyY)
  const place = (row: number, targetWidth: number, anchorImgY: number, anchorBodyY: number) => {
    const width = s.widths[row];
    if (!(width > w * 0.05)) return null;
    const scale = targetWidth / width;
    return {
      x: cx + (w / 2 - s.centers[row]) * scale,
      y: anchorBodyY + (h / 2 - anchorImgY) * scale,
      scale,
      rotation: 0,
    };
  };

  switch (item.category as Category) {
    case "top":
      // Строка чуть ниже горловины — это линия плеч
      return place(1, b.shoulderWidth * 1.1, 0, b.shoulderY);
    case "dress":
      return place(1, b.shoulderWidth * 1.05, 0, b.shoulderY);
    case "outerwear":
      return place(1, b.shoulderWidth * 1.22, 0, b.shoulderY - 6);
    case "bottom":
      return place(0, b.waistWidth * 1.2, 0, b.waistY);
    case "shoes": {
      // Пара обуви — подгоняем по общей ширине, подошва на уровне пола
      const widest = maxOf(s.widths);
      if (!widest) return null;
      const scale = (b.feetSpan * 1.3) / widest;
      return { x: cx, y: b.feetBottom - (h / 2) * scale, scale, rotation: 0 };
    }
    case "headwear": {
      const row = s.widths.indexOf(maxOf(s.widths, SHAPE_ROWS / 2));
      if (row < 0) return null;
      // Нижний край шапки — чуть выше середины головы
      return place(row, b.headWidth * 1.3, h, b.headTop + b.headHeight * 0.42);
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
  const p = fromBody(item, m) ?? fromShape(item, m);
  if (!p || !Number.isFinite(p.scale) || p.scale <= 0) return null;
  if (item.bodyFit) return p; // фото образа — доверяем исходным пропорциям
  if (p.scale > boxScale * 1.6 || p.scale < boxScale / 1.6) return null;
  return p;
}
