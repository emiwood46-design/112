export type BgRequest = { id: number; blob: Blob; publicPath?: string };
export type BgResponse =
  | { id: number; type: "progress"; key: string; current: number; total: number }
  | { id: number; type: "done"; blob: Blob }
  | { id: number; type: "error"; message: string };

/** Конфиг для @imgly/background-removal: WebGPU, если есть, иначе облегчённая модель на CPU. */
export function bgConfig(
  hasGpu: boolean,
  progress: (key: string, cur: number, total: number) => void,
  publicPath?: string,
) {
  return {
    // Свой адрес модели (self-hosting), иначе — CDN IMG.LY по умолчанию
    ...(publicPath ? { publicPath } : {}),
    device: hasGpu ? ("gpu" as const) : ("cpu" as const),
    model: hasGpu ? ("isnet_fp16" as const) : ("isnet_quint8" as const),
    output: { format: "image/png" as const, quality: 1 },
    progress,
  };
}

/** Можно разместить файлы модели у себя: NEXT_PUBLIC_BG_REMOVAL_PUBLIC_PATH=https://…/ (со слешем в конце) */
export const BG_PUBLIC_PATH = process.env.NEXT_PUBLIC_BG_REMOVAL_PUBLIC_PATH || undefined;
