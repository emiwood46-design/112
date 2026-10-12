/** Поделиться файлом через системное меню (мессенджеры на телефоне) или скачать его. */
export async function shareOrDownload(blob: Blob, filename: string, title?: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared" as const;
    } catch (e) {
      // Пользователь закрыл меню — это не ошибка
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled" as const;
    }
  }
  downloadBlob(blob, filename);
  return "downloaded" as const;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFilename(name: string) {
  return (name.trim() || "образ").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60);
}
