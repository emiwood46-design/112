import type { Metadata } from "next";
import { SettingsScreen } from "./SettingsScreen";

export const metadata: Metadata = { title: "Настройки" };

export default function SettingsPage() {
  return <SettingsScreen />;
}
