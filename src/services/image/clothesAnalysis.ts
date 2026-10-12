/**
 * Клиент воркера анализа одежды (см. clothes.worker.ts).
 * Модель (~28 МБ) скачивается при первом использовании и хранится в Cache Storage.
 */
import {
  CLOTHES_MODEL_URL,
  type ClothesRequest,
  type ClothesResponse,
  type RefineResult,
  type SplitResult,
} from "./clothes.shared";

export type { OutfitPiece, RefineResult, SplitResult } from "./clothes.shared";

export interface ClothesProgress {
  stage: "download" | "process";
  value: number;
}

type Job = {
  resolve: (r: RefineResult | SplitResult) => void;
  reject: (e: Error) => void;
  onProgress?: (p: ClothesProgress) => void;
};

let worker: Worker | null = null;
let seq = 0;
const jobs = new Map<number, Job>();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./clothes.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<ClothesResponse>) => {
    const msg = e.data;
    const job = jobs.get(msg.id);
    if (!job) return;
    if (msg.type === "progress") job.onProgress?.({ stage: msg.stage, value: msg.value });
    else {
      jobs.delete(msg.id);
      if (msg.type === "done") job.resolve(msg.result);
      else job.reject(new Error(msg.message));
    }
  };
  worker.onerror = () => {
    jobs.forEach((j) => j.reject(new Error("Не удалось запустить анализ одежды")));
    jobs.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function run<T extends RefineResult | SplitResult>(
  type: ClothesRequest["type"],
  source: Blob,
  cutout: Blob,
  onProgress?: (p: ClothesProgress) => void,
): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    jobs.set(id, { resolve: resolve as Job["resolve"], reject, onProgress });
    getWorker().postMessage({
      id,
      type,
      source,
      cutout,
      modelUrl: CLOTHES_MODEL_URL,
      wasmPath: `${location.origin}/ort/`,
    } satisfies ClothesRequest);
  });
}

/** Оставляет в вырезанной вещи только одежду: убирает вешалки, крючки, руки, обрезки фона. */
export function refineGarment(source: Blob, cutout: Blob, onProgress?: (p: ClothesProgress) => void) {
  return run<RefineResult>("refine", source, cutout, onProgress);
}

/** Делит фото человека в полный рост на отдельные вещи. */
export function splitOutfit(source: Blob, cutout: Blob, onProgress?: (p: ClothesProgress) => void) {
  return run<SplitResult>("split", source, cutout, onProgress);
}
