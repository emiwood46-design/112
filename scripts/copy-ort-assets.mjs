// Копирует WASM-файлы ONNX Runtime в public/ort — их загружает воркер анализа одежды.
// Запускается автоматически перед `npm run dev` и `npm run build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "node_modules", "onnxruntime-web", "dist");
const out = join(process.cwd(), "public", "ort");
mkdirSync(out, { recursive: true });
for (const f of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  copyFileSync(join(dist, f), join(out, f));
}
console.log("onnxruntime-web: WASM скопирован в public/ort");
