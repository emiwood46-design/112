import type { Metadata } from "next";
import { Suspense } from "react";
import { EditItemScreen } from "./EditItemScreen";

export const metadata: Metadata = { title: "Вещь" };

export default function EditItemPage() {
  return (
    <Suspense>
      <EditItemScreen />
    </Suspense>
  );
}
