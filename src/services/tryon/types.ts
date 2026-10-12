/**
 * НА БУДУЩЕЕ: реалистичная примерка (AI virtual try-on) на фото пользователя.
 * Сейчас не используется — только контракт, чтобы UI можно было подключить без переделки.
 *
 * Предполагаемая реализация: серверный маршрут Next.js (app/api/try-on/route.ts),
 * который хранит ключ REPLICATE_API_TOKEN и вызывает модель IDM-VTON
 * (cuuupid/idm-vton на Replicate). Браузер отправляет фото человека и PNG вещи,
 * получает id задачи и опрашивает статус.
 */
import type { Item } from "@/domain/types";

export interface TryOnRequest {
  /** Фото пользователя в полный рост */
  personImage: Blob;
  /** Вещь из гардероба (PNG с прозрачностью) */
  garment: Pick<Item, "id" | "category" | "name">;
  garmentImage: Blob;
}

export type TryOnStatus =
  | { state: "queued" | "processing"; progress?: number }
  | { state: "done"; image: Blob }
  | { state: "failed"; error: string };

export interface TryOnProvider {
  /** Запускает генерацию, возвращает id задачи */
  start(req: TryOnRequest): Promise<string>;
  status(jobId: string): Promise<TryOnStatus>;
  cancel?(jobId: string): Promise<void>;
}
