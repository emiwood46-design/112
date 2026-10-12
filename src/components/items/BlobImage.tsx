"use client";

import { useBlobUrl } from "@/hooks/useData";

/** Картинка из BlobStore по id. */
export function BlobImage({
  id,
  alt,
  className,
}: {
  id: string | undefined;
  alt: string;
  className?: string;
}) {
  const url = useBlobUrl(id);
  if (!url) return <div className={`animate-pulse bg-line/50 ${className ?? ""}`} />;
  // eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image не нужен
  return <img src={url} alt={alt} className={className} draggable={false} />;
}
