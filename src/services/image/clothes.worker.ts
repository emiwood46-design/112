/// <reference lib="webworker" />
/**
 * Анализ одежды на фото в фоновом потоке:
 *  - refine: убирает из вырезанной вещи всё, что не одежда (вешалки, крючки, руки, обрезки фона);
 *  - split: делит фото человека в полный рост на отдельные вещи.
 * Модель — SegFormer, обученная размечать одежду по пикселям (см. clothesLabels.ts).
 */
import * as ort from "onnxruntime-web/wasm";
import type { Category } from "@/domain/types";
import { CLOTHING_LABELS, PIECE_GROUPS } from "./clothesLabels";
import type { ClothesRequest, ClothesResponse, OutfitPiece } from "./clothes.shared";
import { bbox, countOnes, dilate, erode, fillHoles, keepLargeComponents, open, soften } from "./mask";

declare const self: DedicatedWorkerGlobalScope;

const MODEL_CACHE = "wardrobe-clothes-model";
const INPUT = 512;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let session: Promise<ort.InferenceSession> | null = null;
let currentJob = 0;

const post = (msg: ClothesResponse) => self.postMessage(msg);
const progress = (stage: "download" | "process", value: number) =>
  post({ id: currentJob, type: "progress", stage, value });

async function fetchModel(url: string): Promise<ArrayBuffer> {
  const cache = await caches.open(MODEL_CACHE).catch(() => null);
  const hit = await cache?.match(url);
  if (hit) return hit.arrayBuffer();

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Модель одежды недоступна (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total) progress("download", loaded / total);
  }
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  await cache?.put(url, new Response(buf, { headers: { "content-type": "application/octet-stream" } }));
  return buf.buffer;
}

function getSession(modelUrl: string, wasmPath: string) {
  if (!session) {
    ort.env.wasm.wasmPaths = wasmPath;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    session = fetchModel(modelUrl).then((buf) =>
      ort.InferenceSession.create(buf, { executionProviders: ["wasm"], graphOptimizationLevel: "all" }),
    );
    session.catch(() => {
      session = null; // следующая попытка загрузит заново
    });
  }
  return session;
}

async function decode(blob: Blob, w?: number, h?: number) {
  const bmp = await createImageBitmap(blob);
  const cw = w ?? bmp.width;
  const ch = h ?? bmp.height;
  const canvas = new OffscreenCanvas(cw, ch);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, cw, ch);
  bmp.close();
  return ctx.getImageData(0, 0, cw, ch);
}

interface Parsing {
  /** Класс пикселя (argmax) */
  labelAt(x: number, y: number): number;
  /** Вероятность того, что пиксель относится к группе PIECE_GROUPS[g] (0..1) */
  groupProb(g: number, x: number, y: number): number;
  /** Вероятность того, что пиксель — какая-либо одежда (0..1) */
  clothingProb(x: number, y: number): number;
  /** Вероятность фона (0..1) */
  backgroundProb(x: number, y: number): number;
}

/** Рамка непрозрачной части выреза с запасом, приведённая к пропорции 2:3, как у фото в обучающем наборе. */
function regionOfInterest(A: Uint8Array, w: number, h: number) {
  const fg = new Uint8Array(w * h);
  for (let i = 0; i < fg.length; i++) fg[i] = A[i] > 64 ? 1 : 0;
  const b = bbox(fg, w, h) ?? { x: 0, y: 0, w, h };
  const pad = Math.round(Math.max(w, h) * 0.03);
  let rw = b.w + pad * 2;
  let rh = b.h + pad * 2;
  const aspect = 2 / 3;
  if (rw / rh < aspect) rw = rh * aspect;
  else rh = rw / aspect;
  return { x: b.x + b.w / 2 - rw / 2, y: b.y + b.h / 2 - rh / 2, w: rw, h: rh };
}

/**
 * Разметка пикселей моделью. Модель смотрит только на область с вещью/человеком
 * (а не на всё фото, сжатое в 512×512) — так деталей в несколько раз больше.
 * Логиты увеличиваются билинейно, по ним считаются вероятности классов —
 * границы между вещами получаются плавными, без «ступенек».
 */
async function parse(src: ImageData, A: Uint8Array, modelUrl: string, wasmPath: string): Promise<Parsing> {
  const sess = await getSession(modelUrl, wasmPath);
  progress("process", 0.3);
  const roi = regionOfInterest(A, src.width, src.height);
  const c = new OffscreenCanvas(INPUT, INPUT);
  const cx = c.getContext("2d")!;
  cx.fillStyle = "#ffffff";
  cx.fillRect(0, 0, INPUT, INPUT);
  const tmp = new OffscreenCanvas(src.width, src.height);
  tmp.getContext("2d")!.putImageData(src, 0, 0);
  const k = INPUT / roi.w;
  cx.drawImage(tmp, -roi.x * k, -roi.y * (INPUT / roi.h), src.width * k, src.height * (INPUT / roi.h));
  const px = cx.getImageData(0, 0, INPUT, INPUT).data;
  const plane = INPUT * INPUT;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let ch = 0; ch < 3; ch++) input[ch * plane + i] = (px[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
  }
  const feeds = { [sess.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, INPUT, INPUT]) };
  const out = await sess.run(feeds);
  const logits = out[sess.outputNames[0]];
  progress("process", 0.7);
  const [, classes, lh, lw] = logits.dims as number[];
  const data = logits.data as Float32Array;
  const lplane = lw * lh;

  // Рабочая сетка: область интереса с длинной стороной ≤ 768
  const ws = Math.min(1, 768 / Math.max(roi.w, roi.h));
  const W = Math.max(1, Math.round(roi.w * ws));
  const H = Math.max(1, Math.round(roi.h * ws));
  const labels = new Uint8Array(W * H);
  const groups = PIECE_GROUPS.length;
  const slots = groups + 2; // + «любая одежда» + фон
  const probs = new Float32Array(W * H * slots);
  const groupOf = new Int8Array(classes).fill(-1);
  PIECE_GROUPS.forEach((g, gi) => g.labels.forEach((l) => (groupOf[l] = gi)));
  const v = new Float32Array(classes);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(lh - 1, Math.max(0, ((y + 0.5) / H) * lh - 0.5));
    const y0 = Math.floor(fy),
      y1 = Math.min(lh - 1, y0 + 1),
      ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(lw - 1, Math.max(0, ((x + 0.5) / W) * lw - 0.5));
      const x0 = Math.floor(fx),
        x1 = Math.min(lw - 1, x0 + 1),
        tx = fx - x0;
      let best = 0;
      for (let c2 = 0; c2 < classes; c2++) {
        const o = c2 * lplane;
        v[c2] =
          (data[o + y0 * lw + x0] * (1 - tx) + data[o + y0 * lw + x1] * tx) * (1 - ty) +
          (data[o + y1 * lw + x0] * (1 - tx) + data[o + y1 * lw + x1] * tx) * ty;
        if (v[c2] > v[best]) best = c2;
      }
      const i = y * W + x;
      labels[i] = best;
      let sum = 0;
      for (let c2 = 0; c2 < classes; c2++) sum += v[c2] = Math.exp(v[c2] - v[best]);
      const base = i * slots;
      probs[base + groups + 1] = v[0] / sum;
      for (let c2 = 0; c2 < classes; c2++) {
        const g = groupOf[c2];
        if (g >= 0) {
          const p = v[c2] / sum;
          probs[base + g] += p;
          probs[base + groups] += p;
        }
      }
    }
  }

  // Координаты исходного фото → рабочая сетка
  const gx = (x: number) => ((x + 0.5 - roi.x) / roi.w) * W - 0.5;
  const gy = (y: number) => ((y + 0.5 - roi.y) / roi.h) * H - 0.5;
  const sample = (slot: number, x: number, y: number) => {
    const fx = gx(x),
      fy = gy(y);
    if (fx < -0.5 || fy < -0.5 || fx > W - 0.5 || fy > H - 0.5) return 0;
    const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx))),
      y0 = Math.max(0, Math.min(H - 1, Math.floor(fy)));
    const x1 = Math.min(W - 1, x0 + 1),
      y1 = Math.min(H - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)),
      ty = Math.max(0, Math.min(1, fy - y0));
    const at = (xx: number, yy: number) => probs[(yy * W + xx) * slots + slot];
    return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
  };
  return {
    labelAt(x, y) {
      const fx = Math.round(gx(x)),
        fy = Math.round(gy(y));
      return fx < 0 || fy < 0 || fx >= W || fy >= H ? 0 : labels[fy * W + fx];
    },
    groupProb: (g, x, y) => sample(g, x, y),
    clothingProb: (x, y) => sample(groups, x, y),
    backgroundProb: (x, y) => sample(groups + 1, x, y),
  };
}

/** Плавный порог: 0 ниже lo, 1 выше hi */
function smoothstep(lo: number, hi: number, v: number) {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

function alphaOf(img: ImageData) {
  const a = new Uint8Array(img.width * img.height);
  for (let i = 0; i < a.length; i++) a[i] = img.data[i * 4 + 3];
  return a;
}

async function toPng(img: ImageData) {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c.convertToBlob({ type: "image/png" });
}

/** Одна вещь: оставить только одежду. */
async function refine(req: Extract<ClothesRequest, { type: "refine" }>) {
  const src = await decode(req.source);
  const { width: w, height: h } = src;
  const cut = await decode(req.cutout, w, h);
  const A = alphaOf(cut);
  const maxSide = Math.max(w, h);
  let fg: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < fg.length; i++) fg[i] = A[i] > 128 ? 1 : 0;

  let category: Category | undefined;
  let modelError: string | undefined;
  /** Плавный множитель края по вероятности «это одежда» (null — модель не помогла) */
  let edge: Uint8ClampedArray | null = null;
  try {
    const parsing = await parse(src, A, req.modelUrl, req.wasmPath);
    const counts = new Map<number, number>();
    let fgCount = 0;
    for (let y = 0, i = 0; y < h; y++)
      for (let x = 0; x < w; x++, i++) {
        if (!fg[i]) continue;
        fgCount++;
        const l = parsing.labelAt(x, y);
        if (CLOTHING_LABELS.has(l)) counts.set(l, (counts.get(l) ?? 0) + 1);
      }
    let inside = 0;
    counts.forEach((n) => (inside += n));
    // Модель узнала одежду — убираем всё, что ей не является (вешалки, руки, обрезки фона)
    if (fgCount && inside / fgCount >= 0.25) {
      edge = new Uint8ClampedArray(w * h);
      for (let y = 0, i = 0; y < h; y++)
        for (let x = 0; x < w; x++, i++) {
          if (!fg[i]) continue;
          const p = parsing.clothingProb(x, y);
          edge[i] = smoothstep(0.2, 0.6, p) * 255;
          if (p < 0.35) fg[i] = 0;
        }
      let bestN = 0;
      for (const g of PIECE_GROUPS) {
        const n = g.labels.reduce((sum, l) => sum + (counts.get(l) ?? 0), 0);
        if (n > bestN) {
          bestN = n;
          category = g.category;
        }
      }
    }
  } catch (e) {
    modelError = e instanceof Error ? e.message : String(e);
  }
  progress("process", 0.85);

  // Убираем тонкие детали (проволока, крючок вешалки), отдельные «острова» и мелкие дыры
  fg = open(fg, w, h, Math.max(2, Math.round(maxSide * 0.005)));
  fg = keepLargeComponents(fg, w, h, 0.08);
  fg = fillHoles(fg, w, h, countOnes(fg) * 0.03);
  const interior = erode(fg, w, h, 3);
  const soft = soften(fg, w, h, 1);
  for (let i = 0; i < A.length; i++) {
    const k = edge && !interior[i] ? edge[i] / 255 : 1;
    cut.data[i * 4 + 3] = Math.min(A[i], soft[i]) * k;
  }
  return { png: await toPng(cut), category, modelError };
}

/**
 * «Ставит ноги вместе»: на фото ноги часто расставлены, и брюки/пара обуви получаются
 * вдвое шире ног манекена. Построчно сдвигаем левую и правую половины к оси cx так,
 * чтобы между ними остался небольшой зазор. Сдвиг сглажен по высоте, чтобы не было «лесенки».
 * Те же сдвиги применяются к исходному фрагменту фото (для кисти «Восстановить»).
 */
function closeStance(piece: ImageData, orig: ImageData, cx: number) {
  const { width: w, height: h } = piece;
  const gapTarget = Math.max(2, Math.round(w * 0.02));
  // 1. В каждой строке — зазор между ногами: промежуток между непрозрачными участками, ближайший к оси cx
  const gapC = new Float32Array(h).fill(NaN);
  const gapW = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let prevEnd = -1,
      bestD = Infinity;
    let x = 0;
    while (x < w) {
      while (x < w && piece.data[(y * w + x) * 4 + 3] <= 40) x++;
      if (x >= w) break;
      const start = x;
      while (x < w && piece.data[(y * w + x) * 4 + 3] > 40) x++;
      if (prevEnd >= 0) {
        const c = (prevEnd + start) / 2;
        if (Math.abs(c - cx) < bestD) {
          bestD = Math.abs(c - cx);
          gapC[y] = c;
          gapW[y] = start - prevEnd - 1;
        }
      }
      prevEnd = x - 1;
    }
  }
  // 2. Ноги — сплошной участок строк с зазором, идущий снизу вверх (мелкие разрывы допускаем)
  let bottom = h - 1;
  while (bottom >= 0 && Number.isNaN(gapC[bottom])) bottom--;
  if (bottom < 0) return { piece, orig };
  let top = bottom,
    miss = 0;
  for (let y = bottom; y >= 0; y--) {
    if (Number.isNaN(gapC[y])) {
      if (++miss > Math.max(3, h * 0.02)) break;
    } else {
      miss = 0;
      top = y;
    }
  }
  // 3. Ноги почти прямые: центр и ширину зазора аппроксимируем прямыми (наименьшие квадраты),
  //    чтобы шум отдельных строк не превращал край в «пилу»
  const fit = (vals: Float32Array) => {
    let n = 0,
      sy = 0,
      sv = 0,
      syy = 0,
      syv = 0;
    for (let y = top; y <= bottom; y++) {
      if (Number.isNaN(gapC[y])) continue;
      n++;
      sy += y;
      sv += vals[y];
      syy += y * y;
      syv += y * vals[y];
    }
    const den = n * syy - sy * sy;
    const b = n > 1 && den ? (n * syv - sy * sv) / den : 0;
    const a = n ? (sv - b * sy) / n : 0;
    return (y: number) => a + b * y;
  };
  if (bottom - top < h * 0.15) return { piece, orig };
  const centerAt = fit(gapC);
  const widthAt = fit(gapW);

  // Обратное отображение с субпиксельным сдвигом: для каждого пикселя результата берём
  // точку левой половины (x − d) или правой (x + d) с линейной интерполяцией — край остаётся гладким
  const apply = (img: ImageData) => {
    const out = new ImageData(w, h);
    const px = new Float32Array(4);
    const sampleInto = (y: number, fx: number, target: Float32Array) => {
      const x0 = Math.floor(fx),
        t = fx - x0;
      for (let c = 0; c < 4; c++) {
        const a = x0 >= 0 && x0 < w ? img.data[(y * w + x0) * 4 + c] : 0;
        const b = x0 + 1 >= 0 && x0 + 1 < w ? img.data[(y * w + x0 + 1) * 4 + c] : 0;
        target[c] = a * (1 - t) + b * t;
      }
    };
    const other = new Float32Array(4);
    for (let y = 0; y < h; y++) {
      const inLegs = y >= top && y <= bottom;
      const d = inLegs ? Math.max(0, (widthAt(y) - gapTarget) / 2) : 0;
      const split = inLegs ? centerAt(y) : cx;
      for (let x = 0; x < w; x++) {
        const di = (y * w + x) * 4;
        if (d === 0) {
          for (let c = 0; c < 4; c++) out.data[di + c] = img.data[di + c];
          continue;
        }
        // Кандидат из левой половины и из правой; берём более непрозрачный
        const lx = x - d,
          rx = x + d;
        px.fill(0);
        other.fill(0);
        if (lx < split) sampleInto(y, lx, px);
        if (rx >= split) sampleInto(y, rx, other);
        const src = other[3] > px[3] ? other : px;
        for (let c = 0; c < 4; c++) out.data[di + c] = src[c];
      }
    }
    return out;
  };
  return { piece: apply(piece), orig: apply(orig) };
}

/**
 * Пара обуви: две отдельные детали. Сдвигаем каждую целиком (без искажения формы),
 * чтобы между ними остался небольшой зазор — как у манекена, стоящего ровно.
 */
function closeShoes(piece: ImageData, orig: ImageData) {
  const { width: w, height: h } = piece;
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const comps: { id: number; area: number; minX: number; maxX: number }[] = [];
  let next = 1;
  for (let start = 0; start < w * h; start++) {
    if (labels[start] || piece.data[start * 4 + 3] <= 40) continue;
    const comp = { id: next, area: 0, minX: w, maxX: -1 };
    let sp = 0;
    stack[sp++] = start;
    labels[start] = next;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      comp.area++;
      if (x < comp.minX) comp.minX = x;
      if (x > comp.maxX) comp.maxX = x;
      const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of neighbors) {
        if (q >= 0 && !labels[q] && piece.data[q * 4 + 3] > 40) {
          labels[q] = next;
          stack[sp++] = q;
        }
      }
    }
    comps.push(comp);
    next++;
  }
  comps.sort((a, b) => b.area - a.area);
  const [a, b] = comps;
  if (!a || !b || b.area < a.area * 0.25) return { piece, orig };
  const [left, right] = a.minX < b.minX ? [a, b] : [b, a];
  const gap = right.minX - left.maxX - 1;
  const d = Math.round(Math.max(0, (gap - Math.max(2, w * 0.03)) / 2));
  if (!d) return { piece, orig };
  // Полупрозрачный край детали (alpha ≤ 40) относим к ближайшей по горизонтали детали
  const shiftOf = (x: number, y: number) => {
    const l = labels[y * w + x];
    if (l === left.id) return d;
    if (l === right.id) return -d;
    if (l) return 0;
    return x <= left.maxX + 2 ? d : x >= right.minX - 2 ? -d : 0;
  };
  const apply = (img: ImageData) => {
    const out = new ImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const tx = x + shiftOf(x, y);
        if (tx < 0 || tx >= w) continue;
        const si = (y * w + x) * 4;
        const di = (y * w + tx) * 4;
        if (img.data[si + 3] >= out.data[di + 3]) for (let c = 0; c < 4; c++) out.data[di + c] = img.data[si + c];
      }
    return out;
  };
  return { piece: apply(piece), orig: apply(orig) };
}

/** Обрезает фрагмент по непрозрачной части. Возвращает смещение новой рамки. */
function cropToContent(piece: ImageData, orig: ImageData, pad = 4) {
  const { width: w, height: h } = piece;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = piece.data[i * 4 + 3] > 8 ? 1 : 0;
  const b = bbox(m, w, h);
  if (!b) return { piece, orig, dx: 0, dy: 0 };
  const x0 = Math.max(0, b.x - pad),
    y0 = Math.max(0, b.y - pad);
  const cw = Math.min(w, b.x + b.w + pad) - x0,
    ch = Math.min(h, b.y + b.h + pad) - y0;
  const crop = (img: ImageData) => {
    const out = new ImageData(cw, ch);
    for (let y = 0; y < ch; y++) {
      const from = ((y + y0) * w + x0) * 4;
      out.data.set(img.data.subarray(from, from + cw * 4), y * cw * 4);
    }
    return out;
  };
  return { piece: crop(piece), orig: crop(orig), dx: x0, dy: y0 };
}

/** Фото образа: разделить на отдельные вещи. */
async function split(req: Extract<ClothesRequest, { type: "split" }>) {
  const src = await decode(req.source);
  const { width: w, height: h } = src;
  const cut = await decode(req.cutout, w, h);
  const A = alphaOf(cut);
  const maxSide = Math.max(w, h);
  const parsing = await parse(src, A, req.modelUrl, req.wasmPath);
  const L = new Uint8Array(w * h);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) L[i] = A[i] > 32 ? parsing.labelAt(x, y) : 0;

  // Рамка человека — для привязки сумок и аксессуаров к телу
  const person = new Uint8Array(w * h);
  for (let i = 0; i < person.length; i++) person[i] = L[i] !== 0 && A[i] > 64 ? 1 : 0;
  const pb = bbox(keepLargeComponents(person, w, h, 0.3), w, h);
  if (!pb || pb.h < h * 0.3) throw new Error("Не удалось найти человека в полный рост на фото");
  // Макушка — по волосам/лицу (без шляпы), центр тела — по лицу или торсу (без сумки в руке)
  const FACE = 11,
    HAIR = 2;
  let headTop = h,
    faceSumX = 0,
    faceN = 0,
    torsoSumX = 0,
    torsoN = 0;
  for (let y = 0, i = 0; y < h; y++)
    for (let x = 0; x < w; x++, i++) {
      const l = L[i];
      if (A[i] <= 64) continue;
      if (l === FACE || l === HAIR) headTop = Math.min(headTop, y);
      if (l === FACE) {
        faceSumX += x;
        faceN++;
      } else if (l === 4 || l === 7) {
        torsoSumX += x;
        torsoN++;
      }
    }
  if (headTop >= pb.y + pb.h * 0.3) headTop = pb.y;
  const personCX = faceN > 200 ? faceSumX / faceN : torsoN > 200 ? torsoSumX / torsoN : pb.x + pb.w / 2;
  const personH = pb.y + pb.h - headTop;

  const pieces: OutfitPiece[] = [];
  const minArea = Math.max(400, w * h * 0.002);
  // Широкая зона вокруг грубой маски модели: внешний край вещи должна задавать точная маска
  // удаления фона, а не «ступеньки» разметки. Чужие вещи и тело в зоне отсекаются по вероятностям.
  const bandR = Math.max(4, Math.round(maxSide * 0.02));
  for (let gi = 0; gi < PIECE_GROUPS.length; gi++) {
    const group = PIECE_GROUPS[gi];
    let m: Uint8Array = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = group.labels.includes(L[i]) ? 1 : 0;
    if (countOnes(m) < minArea) continue;
    m = open(m, w, h, Math.max(1, Math.round(maxSide * 0.003)));
    m = keepLargeComponents(m, w, h, 0.15);
    const area = countOnes(m);
    if (area < minArea) continue;
    m = fillHoles(m, w, h, area * 0.04);
    // Внутри вещи — полная непрозрачность, на границе с другими вещами и телом — плавный переход по вероятности
    const interior = erode(m, w, h, 2);
    const band = dilate(m, w, h, bandR);
    const b = bbox(band, w, h)!;
    const x0 = b.x,
      y0 = b.y,
      pw = b.w,
      ph = b.h;
    // (для брюк и обуви рамка ещё уточнится после выравнивания стойки)
    let piece = new ImageData(pw, ph);
    let orig = new ImageData(pw, ph);
    for (let y = 0; y < ph; y++)
      for (let x = 0; x < pw; x++) {
        const sx = x + x0,
          sy = y + y0;
        const si = sy * w + sx;
        const di = (y * pw + x) * 4;
        for (let c = 0; c < 3; c++) piece.data[di + c] = orig.data[di + c] = src.data[si * 4 + c];
        orig.data[di + 3] = 255;
        let k = interior[si] ? 1 : 0;
        if (!k && band[si]) {
          // Граница с фоном — край задаёт точная маска удаления фона (A);
          // граница с другой вещью или телом — плавный переход по вероятностям модели
          const pg = parsing.groupProb(gi, sx, sy);
          const other = Math.max(0, 1 - pg - parsing.backgroundProb(sx, sy));
          k = smoothstep(0.3, 0.65, pg / (pg + other + 1e-6));
        }
        piece.data[di + 3] = A[si] * k;
      }
    // Отдельные мелкие островки (обрывки соседних вещей) убираем
    {
      const vis = new Uint8Array(pw * ph);
      for (let i = 0; i < vis.length; i++) vis[i] = piece.data[i * 4 + 3] > 40 ? 1 : 0;
      const keep = keepLargeComponents(vis, pw, ph, 0.05);
      for (let i = 0; i < vis.length; i++) if (vis[i] && !keep[i]) piece.data[i * 4 + 3] = 0;
    }
    let bx = x0,
      by = y0;
    if (group.key === "pants" || group.key === "shoes") {
      // Ноги вместе — как у манекена
      ({ piece, orig } = group.key === "shoes" ? closeShoes(piece, orig) : closeStance(piece, orig, personCX - x0));
      const c = cropToContent(piece, orig);
      ({ piece, orig } = c);
      bx += c.dx;
      by += c.dy;
    }
    pieces.push({
      key: group.key,
      category: group.category,
      name: group.name,
      png: await toPng(piece),
      original: await toPng(orig),
      width: piece.width,
      height: piece.height,
      bodyFit: {
        cx: (bx + piece.width / 2 - personCX) / personH,
        cy: (by + piece.height / 2 - headTop) / personH,
        h: piece.height / personH,
      },
    });
  }
  if (!pieces.length) throw new Error("На фото не нашлось одежды");
  return { pieces };
}

self.onmessage = async (e: MessageEvent<ClothesRequest>) => {
  const req = e.data;
  currentJob = req.id;
  try {
    const result = req.type === "refine" ? await refine(req) : await split(req);
    post({ id: req.id, type: "done", result });
  } catch (err) {
    post({ id: req.id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
