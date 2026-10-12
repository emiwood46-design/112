"use client";

import { useEffect } from "react";
import { getRepositories } from "@/data";
import type { Item } from "@/domain/types";
import { measureBlobShape } from "@/services/image/shape";

/**
 * Вещи, добавленные до появления автопосадки, не имеют силуэта.
 * Измеряем его в фоне по одной вещи, пока открыт конструктор.
 */
export function useShapeMigration(items: Item[] | undefined) {
  useEffect(() => {
    const todo = items?.find((i) => !i.shape);
    if (!todo) return;
    let cancelled = false;
    (async () => {
      const repos = getRepositories();
      const blob = await repos.blobs.get(todo.imageId);
      if (!blob || cancelled) return;
      const shape = await measureBlobShape(blob);
      // Обновление вызовет перезагрузку списка — эффект возьмёт следующую вещь
      if (!cancelled) await repos.items.update(todo.id, { shape }, { touch: false });
    })().catch((e) => console.warn("Не удалось измерить силуэт", e));
    return () => {
      cancelled = true;
    };
  }, [items]);
}
