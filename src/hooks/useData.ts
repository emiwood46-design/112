"use client";

import { useEffect, useState } from "react";
import { getRepositories } from "@/data";
import type { Unsubscribe } from "@/data/repositories";
import type { Item, ItemFilter, Outfit } from "@/domain/types";

/**
 * Подписка на данные репозитория: загружает значение и перезагружает его при изменениях.
 * `deps` — сериализуемый ключ запроса.
 */
function useRepoQuery<T>(
  load: () => Promise<T>,
  subscribe: (fn: () => void) => Unsubscribe,
  key: string,
): { data: T | undefined; loading: boolean; error?: Error } {
  const [state, setState] = useState<{ key: string; data?: T; error?: Error } | null>(null);

  useEffect(() => {
    let alive = true;
    const run = () =>
      load().then(
        (data) => alive && setState({ key, data }),
        (error: Error) => alive && setState({ key, error }),
      );
    run();
    const unsub = subscribe(run);
    return () => {
      alive = false;
      unsub();
    };
    // load/subscribe пересоздаются на каждый рендер — зависим только от ключа
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const fresh = state?.key === key;
  return { data: state?.data, loading: !fresh, error: fresh ? state?.error : undefined };
}

export function useItems(filter?: ItemFilter) {
  return useRepoQuery<Item[]>(
    () => getRepositories().items.list(filter),
    (fn) => getRepositories().items.subscribe(fn),
    "items:" + JSON.stringify(filter ?? {}),
  );
}

export function useItem(id: string | null | undefined) {
  return useRepoQuery<Item | undefined>(
    () => (id ? getRepositories().items.get(id) : Promise.resolve(undefined)),
    (fn) => getRepositories().items.subscribe(fn),
    "item:" + id,
  );
}

export function useOutfits() {
  return useRepoQuery<Outfit[]>(
    () => getRepositories().outfits.list(),
    (fn) => getRepositories().outfits.subscribe(fn),
    "outfits",
  );
}

/** object URL картинки из BlobStore */
export function useBlobUrl(id: string | undefined): string | undefined {
  const [state, setState] = useState<{ id: string; url?: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    getRepositories()
      .blobs.getUrl(id)
      .then((url) => alive && setState({ id, url }));
    return () => {
      alive = false;
    };
  }, [id]);
  return state && state.id === id ? state.url : undefined;
}
