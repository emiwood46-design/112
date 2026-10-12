"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { OutfitSplitFlow } from "./OutfitSplitFlow";
import { SingleItemFlow } from "./SingleItemFlow";

type Mode = "single" | "outfit";

export function AddItemScreen() {
  const [mode, setMode] = useState<Mode>("single");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <PageHeader
        title="Добавить"
        back={
          <Link href="/wardrobe" className="-ml-2 rounded-full p-2 hover:bg-line/50" aria-label="Назад">
            ←
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
        <div className="mx-auto mb-4 flex max-w-sm rounded-xl border border-line bg-surface p-1 text-sm" role="tablist">
          {(
            [
              ["single", "Одна вещь"],
              ["outfit", "Образ с фото"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              disabled={busy}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-2 ${mode === m ? "bg-ink font-medium text-white" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "single" ? <SingleItemFlow onBusyChange={setBusy} /> : <OutfitSplitFlow onBusyChange={setBusy} />}
      </div>
    </>
  );
}
