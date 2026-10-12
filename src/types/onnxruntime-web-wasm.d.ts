// Сборка onnxruntime-web только с WASM-бэкендом: тот же API, что и у основного пакета
declare module "onnxruntime-web/wasm" {
  export * from "onnxruntime-common";
}
