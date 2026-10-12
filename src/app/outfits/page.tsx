import type { Metadata } from "next";
import { OutfitsScreen } from "./OutfitsScreen";

export const metadata: Metadata = { title: "Мои образы" };

export default function OutfitsPage() {
  return <OutfitsScreen />;
}
