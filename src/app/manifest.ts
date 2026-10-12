import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Виртуальный гардероб",
    short_name: "Гардероб",
    description: "Фотографируйте одежду и собирайте образы на манекене",
    lang: "ru",
    start_url: "/wardrobe",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f3ee",
    theme_color: "#f6f3ee",
    categories: ["lifestyle", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Добавить вещь", url: "/wardrobe/add" },
      { name: "Конструктор", url: "/outfits/editor" },
    ],
  };
}
