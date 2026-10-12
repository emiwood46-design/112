"use client";

import { useEffect } from "react";

/** Регистрирует service worker (только в production — в dev он мешает горячей перезагрузке). */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Не критично: приложение работает и без SW
    });
  }, []);
  return null;
}
