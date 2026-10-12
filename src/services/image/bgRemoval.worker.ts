/// <reference lib="webworker" />
import { bgConfig, type BgRequest, type BgResponse } from "./bgRemoval.shared";

declare const self: DedicatedWorkerGlobalScope;

const post = (msg: BgResponse) => self.postMessage(msg);

self.onmessage = async (e: MessageEvent<BgRequest>) => {
  const { id, blob, publicPath } = e.data;
  try {
    const { removeBackground } = await import("@imgly/background-removal");
    const hasGpu = "gpu" in self.navigator;
    const progress = (key: string, current: number, total: number) =>
      post({ id, type: "progress", key, current, total });
    let out: Blob;
    try {
      out = await removeBackground(blob, bgConfig(hasGpu, progress, publicPath));
    } catch (err) {
      if (!hasGpu) throw err;
      // WebGPU есть, но не завёлся (бывает на части устройств) — пробуем CPU
      out = await removeBackground(blob, bgConfig(false, progress, publicPath));
    }
    post({ id, type: "done", blob: out });
  } catch (err) {
    post({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
