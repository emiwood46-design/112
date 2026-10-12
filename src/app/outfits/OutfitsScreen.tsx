"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BlobImage } from "@/components/items/BlobImage";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { getRepositories } from "@/data";
import { SEASON_LABELS } from "@/domain/categories";
import type { Outfit } from "@/domain/types";
import { useOutfits } from "@/hooks/useData";
import { safeFilename, shareOrDownload } from "@/lib/share";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

export function OutfitsScreen() {
  const { data: outfits, loading } = useOutfits();

  return (
    <>
      <PageHeader
        title="Мои образы"
        actions={
          <Link href="/outfits/editor" className="btn-accent">
            + Новый образ
          </Link>
        }
      />
      <div className="px-4 py-4 md:px-8">
        {loading && !outfits ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="card aspect-[1/2] animate-pulse" />
            ))}
          </div>
        ) : outfits?.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="text-6xl" aria-hidden>
              🧍
            </div>
            <h2 className="text-lg font-semibold">Образов пока нет</h2>
            <p className="max-w-xs text-sm text-muted">
              Соберите первый образ на манекене из вещей гардероба или нажмите «Случайный образ».
            </p>
            <Link href="/outfits/editor" className="btn-accent">
              Открыть конструктор
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {outfits?.map((o) => <OutfitCard key={o.id} outfit={o} />)}
          </div>
        )}
      </div>
    </>
  );
}

function OutfitCard({ outfit }: { outfit: Outfit }) {
  const router = useRouter();
  const toast = useToast();
  const repo = getRepositories().outfits;

  const duplicate = async () => {
    await repo.duplicate(outfit.id);
    toast("Копия создана");
  };
  const remove = async () => {
    if (!confirm(`Удалить образ «${outfit.name}»?`)) return;
    await repo.delete(outfit.id);
    toast("Образ удалён");
  };
  const share = async () => {
    // Быстрый шеринг превью; полноразмерный PNG — из конструктора
    const blob = outfit.previewId ? await getRepositories().blobs.get(outfit.previewId) : undefined;
    if (blob) await shareOrDownload(blob, `${safeFilename(outfit.name)}.png`, outfit.name);
  };

  return (
    <div className="card flex flex-col self-start overflow-hidden">
      <button
        className="relative aspect-[1/2] bg-[#f3efe9]"
        onClick={() => router.push(`/outfits/editor?id=${outfit.id}`)}
        aria-label={`Открыть ${outfit.name}`}
      >
        <BlobImage id={outfit.previewId} alt={outfit.name} className="absolute inset-0 size-full object-contain" />
      </button>
      <div className="border-t border-line px-3 pt-2">
        <div className="truncate text-sm font-medium">{outfit.name}</div>
        <div className="truncate text-xs text-muted">
          {outfit.layers.length} вещ. · {dateFmt.format(outfit.updatedAt)}
          {outfit.season && outfit.season !== "all" ? ` · ${SEASON_LABELS[outfit.season]}` : ""}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1 p-2">
        <CardBtn label="Редактировать" onClick={() => router.push(`/outfits/editor?id=${outfit.id}`)}>✎</CardBtn>
        <CardBtn label="Дублировать" onClick={duplicate}>⧉</CardBtn>
        <CardBtn label="Поделиться" onClick={share}>⤴</CardBtn>
        <CardBtn label="Удалить" onClick={remove}>🗑</CardBtn>
      </div>
    </div>
  );
}

function CardBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-9 place-items-center rounded-lg text-base text-muted hover:bg-bg hover:text-ink"
    >
      {children}
    </button>
  );
}
