"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";
import { ToastProvider } from "./Toast";

const NAV = [
  { href: "/wardrobe", label: "Гардероб", icon: HangerIcon },
  { href: "/outfits/editor", label: "Конструктор", icon: MannequinIcon },
  { href: "/outfits", label: "Образы", icon: StackIcon },
  { href: "/settings", label: "Ещё", icon: DotsIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/outfits") return pathname === "/outfits";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ToastProvider>
      <ServiceWorkerRegistrar />
      <div className="flex min-h-dvh flex-col md:flex-row">
        {/* Боковая навигация на десктопе */}
        <nav className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-line bg-surface p-4 md:flex">
          <Link href="/wardrobe" className="mb-6 px-2 text-lg font-semibold tracking-tight">
            Гардероб
          </Link>
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                isActive(pathname, href) ? "bg-bg font-semibold" : "text-muted hover:bg-bg"
              }`}
            >
              <Icon className="size-5" />
              {label === "Ещё" ? "Настройки" : label}
            </Link>
          ))}
        </nav>

        <main className="flex min-w-0 flex-1 flex-col pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>

        {/* Нижняя навигация на телефоне */}
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden">
          <div className="grid h-16 grid-cols-4">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${
                    active ? "font-semibold text-ink" : "text-muted"
                  }`}
                >
                  <Icon className="size-6" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </ToastProvider>
  );
}

type IconProps = { className?: string };
function HangerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="M12 7a2 2 0 1 1 2-2" strokeLinecap="round" />
      <path d="M12 7v1.5L3.5 15a1.5 1.5 0 0 0 .9 2.7h15.2a1.5 1.5 0 0 0 .9-2.7L12 8.5" strokeLinejoin="round" />
    </svg>
  );
}
function MannequinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M8 9.5c0-1.4 1.8-2.5 4-2.5s4 1.1 4 2.5L15 15H9L8 9.5Z" strokeLinejoin="round" />
      <path d="M10 15l-.5 6M14 15l.5 6" strokeLinecap="round" />
    </svg>
  );
}
function StackIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function DotsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
