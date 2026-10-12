"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BlobImage } from "@/components/items/BlobImage";
import { ImageCropper } from "@/components/items/ImageCropper";
import { ItemForm } from "@/components/items/ItemForm";
import { MaskEditor } from "@/components/items/MaskEditor";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { getRepositories } from "@/data";
import { collectTags } from "@/domain/filter";
import type { Item, ItemDraft } from "@/domain/types";
import { useBlobUrl, useItem, useItems } from "@/hooks/useData";
import { buildItemImages } from "@/services/image/process";

export function EditItemScreen() {
  const id = useSearchParams().get("id");
  const { data: item, loading } = useItem(id);

  const back = (
    <Link href="/wardrobe" className="-ml-2 rounded-full p-2 hover:bg-line/50" aria-label="Назад">
      ←
    </Link>
  );

  if (loading) return <PageHeader title="Загрузка…" back={back} />;
  if (!item)
    return (
      <>
        <PageHeader title="Вещь не найдена" back={back} />
        <div className="p-8 text-center">
          <Link href="/wardrobe" className="btn-ghost">
            В гардероб
          </Link>
        </div>
      </>
    );
  // key: при смене вещи форма инициализируется заново
  return <EditItemForm key={item.id} item={item} back={back} />;
}

function EditItemForm({ item, back }: { item: Item; back: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const { data: all } = useItems();
  const imageUrl = useBlobUrl(item.imageId);
  const [draft, setDraft] = useState<ItemDraft>({
    name: item.name,
    category: item.category,
    color: item.color,
    seasons: item.seasons,
    tags: item.tags,
  });
  const [saving, setSaving] = useState(false);
  const [cropBlob, setCropBlob] = useState<Blob | null>(null);
  const [eraseBlob, setEraseBlob] = useState<Blob | null>(null);

  const repo = getRepositories().items;

  const save = async () => {
    setSaving(true);
    try {
      await repo.update(item.id, draft);
      toast("Изменения сохранены");
      router.push("/wardrobe");
    } catch {
      toast("Не удалось сохранить", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Удалить «${item.name || "вещь"}»? Она пропадёт и из сохранённых образов.`)) return;
    await repo.delete(item.id);
    toast("Вещь удалена");
    router.push("/wardrobe");
  };

  const openCrop = async () => {
    const blob = await getRepositories().blobs.get(item.imageId);
    if (blob) setCropBlob(blob);
  };
  const openEraser = async () => {
    const blob = await getRepositories().blobs.get(item.imageId);
    if (blob) setEraseBlob(blob);
  };

  return (
    <>
      <PageHeader title={item.name || "Вещь"} back={back} />
      <div className="mx-auto grid w-full max-w-5xl gap-6 p-4 md:grid-cols-2 md:p-8">
        <section className="flex flex-col gap-3">
          <div className="checker aspect-[3/4] overflow-hidden rounded-3xl border border-line p-4">
            <BlobImage id={item.imageId} alt={item.name} className="size-full object-contain" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-ghost px-2" onClick={openEraser}>
              🧽 Ластик
            </button>
            <button className="btn-ghost px-2" onClick={openCrop}>
              ✂️ Обрезать
            </button>
            <Link href={`/outfits/editor?add=${item.id}`} className="btn-ghost px-2">
              Примерить
            </Link>
          </div>
        </section>
        <section className="flex flex-col gap-6">
          <ItemForm value={draft} onChange={setDraft} knownTags={all ? collectTags(all) : []} />
          <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] -mx-4 flex gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-2xl md:border md:px-3">
            <button className="btn-danger" onClick={remove}>
              Удалить
            </button>
            <button className="btn-primary flex-1 py-3" onClick={save} disabled={saving}>
              {saving ? "Сохраняю…" : "Сохранить"}
            </button>
          </div>
        </section>
      </div>

      {cropBlob && imageUrl && (
        <ImageCropper
          open
          src={imageUrl}
          blob={cropBlob}
          onClose={() => setCropBlob(null)}
          onDone={async (b) => {
            setCropBlob(null);
            // После обрезки привязка к телу с фото образа теряет смысл — посадка пойдёт по силуэту
            await repo.replaceImage(item.id, await buildItemImages(b));
            toast("Изображение обновлено");
          }}
        />
      )}

      {eraseBlob && (
        <MaskEditor
          image={eraseBlob}
          onClose={() => setEraseBlob(null)}
          onDone={async (b) => {
            setEraseBlob(null);
            // Размер картинки не меняется — привязку к телу сохраняем
            await repo.replaceImage(item.id, { ...(await buildItemImages(b)), bodyFit: item.bodyFit });
            toast("Изображение обновлено");
          }}
        />
      )}
    </>
  );
}
