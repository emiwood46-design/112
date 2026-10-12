"use client";

import { useEffect, useState } from "react";
import { getRepositories } from "@/data";
import { loadImage } from "@/services/image/canvas";

/** Загружает HTMLImageElement по URL (для Konva). */
export function useHtmlImage(src: string | undefined): HTMLImageElement | undefined {
  const [state, setState] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    loadImage(src).then(
      (img) => alive && setState({ src, img }),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [src]);
  return state && state.src === src ? state.img : undefined;
}

/** Загружает изображение из BlobStore. */
export function useBlobHtmlImage(blobId: string | undefined) {
  const [url, setUrl] = useState<{ id: string; url?: string } | null>(null);
  useEffect(() => {
    if (!blobId) return;
    let alive = true;
    getRepositories()
      .blobs.getUrl(blobId)
      .then((u) => alive && setUrl({ id: blobId, url: u }));
    return () => {
      alive = false;
    };
  }, [blobId]);
  return useHtmlImage(url && url.id === blobId ? url.url : undefined);
}
