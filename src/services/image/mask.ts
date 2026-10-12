/**
 * Операции над бинарными масками (Uint8Array, 0/1, построчно w×h).
 * Чистые функции без DOM — работают и в Web Worker.
 */

/** Сумма по скользящему окну [i-r, i+r] вдоль одной оси через префиксные суммы. */
function windowPass(src: Uint8Array, w: number, h: number, r: number, horizontal: boolean, test: (sum: number, size: number) => boolean) {
  const out = new Uint8Array(src.length);
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const prefix = new Int32Array(len + 1);
  for (let line = 0; line < lines; line++) {
    for (let i = 0; i < len; i++) {
      const idx = horizontal ? line * w + i : i * w + line;
      prefix[i + 1] = prefix[i] + src[idx];
    }
    for (let i = 0; i < len; i++) {
      const a = Math.max(0, i - r);
      const b = Math.min(len - 1, i + r);
      const idx = horizontal ? line * w + i : i * w + line;
      out[idx] = test(prefix[b + 1] - prefix[a], b - a + 1) ? 1 : 0;
    }
  }
  return out;
}

/** Эрозия квадратным окном (2r+1)²: пиксель остаётся, только если всё окно заполнено. */
export function erode(m: Uint8Array, w: number, h: number, r: number) {
  if (r <= 0) return m;
  const full = (s: number, n: number) => s === n;
  return windowPass(windowPass(m, w, h, r, true, full), w, h, r, false, full);
}

/** Дилатация квадратным окном (2r+1)². */
export function dilate(m: Uint8Array, w: number, h: number, r: number) {
  if (r <= 0) return m;
  const any = (s: number) => s > 0;
  return windowPass(windowPass(m, w, h, r, true, any), w, h, r, false, any);
}

/** Морфологическое открытие: убирает детали тоньше 2r (проволока, крючки вешалок). */
export function open(m: Uint8Array, w: number, h: number, r: number) {
  return dilate(erode(m, w, h, r), w, h, r);
}

/**
 * Оставляет только крупные связные области: площадью не меньше keepRatio от самой большой.
 * Отсекает отдельные «острова» — обрезки фона, ножку вешалки и т. п.
 */
export function keepLargeComponents(m: Uint8Array, w: number, h: number, keepRatio: number) {
  const labels = new Int32Array(m.length);
  const areas: number[] = [0];
  const stack = new Int32Array(m.length);
  let next = 1;
  for (let start = 0; start < m.length; start++) {
    if (!m[start] || labels[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = next;
    let area = 0;
    while (sp) {
      const p = stack[--sp];
      area++;
      const x = p % w;
      const y = (p - x) / w;
      const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of neighbors) {
        if (q >= 0 && m[q] && !labels[q]) {
          labels[q] = next;
          stack[sp++] = q;
        }
      }
    }
    areas.push(area);
    next++;
  }
  const max = Math.max(0, ...areas);
  const keep = areas.map((a) => a > 0 && a >= max * keepRatio);
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = keep[labels[i]] ? 1 : 0;
  return out;
}

/** Размытие маски 0/1 в мягкую 0..255 (box blur r по обеим осям) — для ровного края. */
export function soften(m: Uint8Array, w: number, h: number, r: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(m.length);
  if (r <= 0) {
    for (let i = 0; i < m.length; i++) out[i] = m[i] * 255;
    return out;
  }
  const tmp = new Float32Array(m.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += m[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n;
      s += m[y * w + Math.min(w - 1, x + r + 1)] - m[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = (s / n) * 255;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

export function countOnes(m: Uint8Array) {
  let n = 0;
  for (let i = 0; i < m.length; i++) n += m[i];
  return n;
}

export function bbox(m: Uint8Array, w: number, h: number) {
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (m[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Заливает «дыры» внутри маски — пустые области, не касающиеся края изображения,
 * площадью не больше maxArea (ошибки разметки посреди вещи).
 */
export function fillHoles(m: Uint8Array, w: number, h: number, maxArea: number) {
  const inv = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1;
  const seen = new Uint8Array(m.length);
  const stack = new Int32Array(m.length);
  const region: number[] = [];
  const out = m.slice();
  for (let start = 0; start < m.length; start++) {
    if (!inv[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    region.length = 0;
    let touchesBorder = false;
    while (sp) {
      const p = stack[--sp];
      region.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
      const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of neighbors) {
        if (q >= 0 && inv[q] && !seen[q]) {
          seen[q] = 1;
          stack[sp++] = q;
        }
      }
    }
    if (!touchesBorder && region.length <= maxArea) for (const p of region) out[p] = 1;
  }
  return out;
}
