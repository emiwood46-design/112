/**
 * Удаление фона в браузере через @imgly/background-removal.
 * Библиотека и модель (~40–80 МБ) загружаются лениво — при первой обработке фото.
 * Работа идёт в Web Worker, чтобы не блокировать интерфейс; если воркер недоступен —
 * выполняемся в основном потоке.
 */
import { BG_PUBLIC_PATH, bgConfig, type BgRequest, type BgResponse } from "./bgRemoval.shared";

export interface BgProgress {
  stage: "download" | "process";
  /** 0..1 */
  value: number;
}

type Job = {
  resolve: (b: Blob) => void;
  reject: (e: Error) => void;
  onProgress?: (p: BgProgress) => void;
  tracker: ProgressTracker;
};

class ProgressTracker {
  private downloads = new Map<string, { cur: number; total: number }>();
  update(key: string, cur: number, total: number): BgProgress {
    if (key.startsWith("fetch:")) {
      this.downloads.set(key, { cur, total });
      let c = 0,
        t = 0;
      this.downloads.forEach((d) => {
        c += d.cur;
        t += d.total;
      });
      return { stage: "download", value: t ? c / t : 0 };
    }
    return { stage: "process", value: total ? cur / total : 0 };
  }
}

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const jobs = new Map<number, Job>();

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./bgRemoval.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<BgResponse>) => {
      const msg = e.data;
      const job = jobs.get(msg.id);
      if (!job) return;
      if (msg.type === "progress") {
        job.onProgress?.(job.tracker.update(msg.key, msg.current, msg.total));
      } else if (msg.type === "done") {
        jobs.delete(msg.id);
        job.resolve(msg.blob);
      } else {
        jobs.delete(msg.id);
        job.reject(new Error(msg.message));
      }
    };
    worker.onerror = () => {
      // Воркер не загрузился — переключаемся на основной поток и перезапускаем задачи
      workerBroken = true;
      worker?.terminate();
      worker = null;
      const pending = [...jobs.values()];
      jobs.clear();
      pending.forEach((job) => job.reject(new WorkerUnavailable()));
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

class WorkerUnavailable extends Error {}

async function runInMainThread(blob: Blob, onProgress?: (p: BgProgress) => void) {
  const { removeBackground } = await import("@imgly/background-removal");
  const tracker = new ProgressTracker();
  const hasGpu = "gpu" in navigator;
  return removeBackground(
    blob,
    bgConfig(hasGpu, (k, c, t) => onProgress?.(tracker.update(k, c, t)), BG_PUBLIC_PATH),
  );
}

export async function removeBackground(
  blob: Blob,
  onProgress?: (p: BgProgress) => void,
): Promise<Blob> {
  const w = getWorker();
  if (!w) return runInMainThread(blob, onProgress);
  const id = ++seq;
  try {
    return await new Promise<Blob>((resolve, reject) => {
      jobs.set(id, { resolve, reject, onProgress, tracker: new ProgressTracker() });
      w.postMessage({ id, blob, publicPath: BG_PUBLIC_PATH } satisfies BgRequest);
    });
  } catch (err) {
    if (err instanceof WorkerUnavailable) return runInMainThread(blob, onProgress);
    throw err;
  }
}
