"use client";

import { useEffect, useState } from "react";

export interface Preview {
  blob: Blob;
  url: string;
}

export function makePreview(blob: Blob): Preview {
  return { blob, url: URL.createObjectURL(blob) };
}

/** Состояние с Blob + object URL; предыдущий URL освобождается при замене. */
export function usePreview() {
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);
  return [preview, (blob: Blob | null) => setPreview(blob ? makePreview(blob) : null)] as const;
}
