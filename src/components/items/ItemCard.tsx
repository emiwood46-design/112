"use client";

import Link from "next/link";
import { CATEGORY_LABELS } from "@/domain/categories";
import type { Item } from "@/domain/types";
import { BlobImage } from "./BlobImage";

export function ItemCard({ item }: { item: Item }) {
  return (
    <Link
      href={`/wardrobe/item?id=${item.id}`}
      className="group card flex flex-col overflow-hidden transition hover:shadow-md"
    >
      <div className="aspect-square bg-[#faf8f5] p-3">
        <BlobImage id={item.thumbId} alt={item.name} className="size-full object-contain transition group-hover:scale-[1.03]" />
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        <span
          className="size-3 shrink-0 rounded-full border border-black/10"
          style={{ background: item.color.hex }}
          title={item.color.name}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{item.name || CATEGORY_LABELS[item.category]}</div>
          <div className="truncate text-xs text-muted">{CATEGORY_LABELS[item.category]}</div>
        </div>
      </div>
    </Link>
  );
}
