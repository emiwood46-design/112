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
import { bbox, countOnes, dilate, keepLargeComponents, open, soften } from "./mask";

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

/** Разметка пикселей: метка класса для каждого пикселя (в уменьшенном разрешении ≤ 512). */
async function parse(src: ImageData, modelUrl: string, wasmPath: string) {
  const sess = await getSession(modelUrl, wasmPath);
  progress("process", 0.3);
  // SegFormer ждёт 512×512 без сохранения пропорций, нормализация как в ImageNet
  const c = new OffscreenCanvas(INPUT, INPUT);
  const cx = c.getContext("2d")!;
  const tmp = new OffscreenCanvas(src.width, src.height);
  tmp.getContext("2d")!.putImageData(src, 0, 0);
  cx.drawImage(tmp, 0, 0, INPUT, INPUT);
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

  // Билинейно увеличиваем логиты до рабочего разрешения и берём argmax
  const scale = Math.min(1, 512 / Math.max(src.width, src.height));
  const W = Math.max(1, Math.round(src.width * scale));
  const H = Math.max(1, Math.round(src.height * scale));
  const labels = new Uint8Array(W * H);
  const lplane = lw * lh;
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
      let best = 0,
        bestV = -Infinity;
      for (let k = 0; k < classes; k++) {
        const o = k * lplane;
        const v =
          (data[o + y0 * lw + x0] * (1 - tx) + data[o + y0 * lw + x1] * tx) * (1 - ty) +
          (data[o + y1 * lw + x0] * (1 - tx) + data[o + y1 * lw + x1] * tx) * ty;
        if (v > bestV) {
          bestV = v;
          best = k;
        }
      }
      labels[y * W + x] = best;
    }
  }
  // Метка для пикселя исходного размера
  const sx = W / src.width;
  const sy = H / src.height;
  return (x: number, y: number) => labels[Math.min(H - 1, (y * sy) | 0) * W + Math.min(W - 1, (x * sx) | 0)];
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
  try {
    const labelAt = await parse(src, req.modelUrl, req.wasmPath);
    const clothing = new Uint8Array(w * h);
    const counts = new Map<number, number>();
    for (let y = 0, i = 0; y < h; y++)
      for (let x = 0; x < w; x++, i++) {
        const l = labelAt(x, y);
        if (CLOTHING_LABELS.has(l)) {
          clothing[i] = 1;
          if (fg[i]) counts.set(l, (counts.get(l) ?? 0) + 1);
        }
      }
    const fgCount = countOnes(fg);
    let inside = 0;
    counts.forEach((n) => (inside += n));
    // Модель узнала одежду — отрезаем всё, что ей не является (с небольшим запасом по краю)
    if (fgCount && inside / fgCount >= 0.25) {
      const allowed = dilate(clothing, w, h, Math.round(maxSide * 0.006));
      for (let i = 0; i < fg.length; i++) fg[i] &= allowed[i];
      let bestN = 0;
      for (const g of PIECE_GROUPS) {
        const n = g.labels.reduce((s, l) => s + (counts.get(l) ?? 0), 0);
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

  // Убираем тонкие детали (проволока, крючок вешалки) и отдельные «острова»
  fg = open(fg, w, h, Math.max(2, Math.round(maxSide * 0.005)));
  fg = keepLargeComponents(fg, w, h, 0.08);
  const soft = soften(fg, w, h, 1);
  for (let i = 0; i < A.length; i++) cut.data[i * 4 + 3] = Math.min(A[i], soft[i]);
  return { png: await toPng(cut), category, modelError };
}

/** Фото образа: разделить на отдельные вещи. */
async function split(req: Extract<ClothesRequest, { type: "split" }>) {
  const src = await decode(req.source);
  const { width: w, height: h } = src;
  const cut = await decode(req.cutout, w, h);
  const A = alphaOf(cut);
  const maxSide = Math.max(w, h);
  const labelAt = await parse(src, req.modelUrl, req.wasmPath);
  const L = new Uint8Array(w * h);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) L[i] = labelAt(x, y);

  // Рамка человека — для привязки вещей к телу
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
  for (const group of PIECE_GROUPS) {
    let m: Uint8Array = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = group.labels.includes(L[i]) && A[i] > 32 ? 1 : 0;
    if (countOnes(m) < minArea) continue;
    m = open(m, w, h, Math.max(1, Math.round(maxSide * 0.003)));
    m = keepLargeComponents(m, w, h, 0.15);
    if (countOnes(m) < minArea) continue;
    const soft = soften(dilate(m, w, h, 1), w, h, 1);
    const b = bbox(m, w, h)!;
    const pad = 4;
    const x0 = Math.max(0, b.x - pad),
      y0 = Math.max(0, b.y - pad);
    const x1 = Math.min(w, b.x + b.w + pad),
      y1 = Math.min(h, b.y + b.h + pad);
    const pw = x1 - x0,
      ph = y1 - y0;
    const piece = new ImageData(pw, ph);
    const orig = new ImageData(pw, ph);
    for (let y = 0; y < ph; y++)
      for (let x = 0; x < pw; x++) {
        const si = (y + y0) * w + (x + x0);
        const di = (y * pw + x) * 4;
        for (let c = 0; c < 3; c++) piece.data[di + c] = orig.data[di + c] = src.data[si * 4 + c];
        orig.data[di + 3] = 255;
        piece.data[di + 3] = Math.min(A[si], soft[si]);
      }
    pieces.push({
      key: group.key,
      category: group.category,
      name: group.name,
      png: await toPng(piece),
      original: await toPng(orig),
      width: pw,
      height: ph,
      bodyFit: {
        cx: (x0 + pw / 2 - personCX) / personH,
        cy: (y0 + ph / 2 - headTop) / personH,
        h: ph / personH,
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
