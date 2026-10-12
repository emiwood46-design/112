import type { Metadata } from "next";
import { Suspense } from "react";
import { OutfitEditor } from "./OutfitEditor";

export const metadata: Metadata = { title: "Конструктор образов" };

export default function OutfitEditorPage() {
  return (
    <Suspense>
      <OutfitEditor />
    </Suspense>
  );
}
