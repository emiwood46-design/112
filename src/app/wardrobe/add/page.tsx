import type { Metadata } from "next";
import { AddItemScreen } from "./AddItemScreen";

export const metadata: Metadata = { title: "Добавить вещь" };

export default function AddItemPage() {
  return <AddItemScreen />;
}
