import type { Metadata } from "next";
import { WardrobeScreen } from "./WardrobeScreen";

export const metadata: Metadata = { title: "Гардероб" };

export default function WardrobePage() {
  return <WardrobeScreen />;
}
