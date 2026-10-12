"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { getRepositories } from "@/data";
import { useItems, useOutfits } from "@/hooks/useData";
import { downloadBlob } from "@/lib/share";
import { exportBackup, importBackup } from "@/services/backup/backup";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} МБ`;
  return `${(n / 1024 ** 3).toFixed(2)} ГБ`;
}

export function SettingsScreen() {
  const toast = useToast();
  const { data: items } = useItems();
  const { data: outfits } = useOutfits();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  const refreshStorage = async () => {
    if (!navigator.storage?.estimate) return;
    const [est, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted?.() ?? Promise.resolve(false),
    ]);
    setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0, persisted });
  };

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      refreshStorage();
      setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      alive = false;
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  const doExport = async () => {
    setBusy("export");
    try {
      const blob = await exportBackup(getRepositories());
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `garderob-${date}.zip`);
      toast(`Копия сохранена (${formatBytes(blob.size)})`);
    } catch (e) {
      console.error(e);
      toast("Не удалось создать копию", "error");
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    if (
      mode === "replace" &&
      !confirm("Текущий гардероб и образы будут заменены содержимым копии. Продолжить?")
    )
      return;
    setBusy("import");
    try {
      const res = await importBackup(getRepositories(), file, mode);
      toast(`Импортировано: вещей — ${res.items}, образов — ${res.outfits}`);
      refreshStorage();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось импортировать", "error");
    } finally {
      setBusy(null);
    }
  };

  const persist = async () => {
    const ok = await navigator.storage?.persist?.();
    toast(ok ? "Браузер не будет удалять данные гардероба" : "Браузер не разрешил — сделайте резервную копию");
    refreshStorage();
  };

  return (
    <>
      <PageHeader title="Настройки" />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 md:p-8">
        <section className="card p-4">
          <h2 className="font-semibold">Резервная копия</h2>
          <p className="mt-1 text-sm text-muted">
            Все данные хранятся только на этом устройстве. Сохраните копию в один файл .zip, чтобы
            перенести гардероб на другой телефон или не потерять его при очистке браузера.
          </p>
          <div className="mt-3 text-sm">
            Вещей: <b>{items?.length ?? "…"}</b> · образов: <b>{outfits?.length ?? "…"}</b>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <button className="btn-primary" onClick={doExport} disabled={busy !== null}>
              {busy === "export" ? "Создаю копию…" : "Экспортировать гардероб (.zip)"}
            </button>
            <div className="flex rounded-xl border border-line bg-bg p-1 text-sm" role="radiogroup">
              {(
                [
                  ["merge", "Объединить"],
                  ["replace", "Заменить всё"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg py-2 ${mode === m ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                doImport(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === "import" ? "Импортирую…" : "Импортировать из файла"}
            </button>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold">Хранилище</h2>
          {storage ? (
            <>
              <p className="mt-1 text-sm text-muted">
                Занято {formatBytes(storage.usage)}
                {storage.quota ? ` из ${formatBytes(storage.quota)}` : ""} (включая кеш модели удаления фона).
              </p>
              {storage.persisted ? (
                <p className="mt-2 text-sm">✅ Данные защищены от автоматической очистки браузером.</p>
              ) : (
                <button className="btn-ghost mt-3" onClick={persist}>
                  Защитить данные от очистки
                </button>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Браузер не сообщает размер хранилища.</p>
          )}
        </section>

        {!standalone && (
          <section className="card p-4">
            <h2 className="font-semibold">Установить на главный экран</h2>
            {installEvent ? (
              <button
                className="btn-accent mt-3"
                onClick={async () => {
                  await installEvent.prompt();
                  setInstallEvent(null);
                }}
              >
                Установить приложение
              </button>
            ) : (
              <p className="mt-1 text-sm text-muted">
                iPhone: Safari → «Поделиться» → «На экран „Домой“». Android: меню Chrome → «Установить
                приложение».
              </p>
            )}
          </section>
        )}

        <section className="card p-4 text-sm text-muted">
          <h2 className="mb-1 font-semibold text-ink">О приложении</h2>
          Удаление фона выполняется прямо на устройстве с помощью @imgly/background-removal — фотографии
          никуда не отправляются. При первом использовании загружается модель (~40–80 МБ), дальше она
          берётся из кеша и работает без интернета.
        </section>
      </div>
    </>
  );
}
