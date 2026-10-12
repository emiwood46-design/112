"use client";

export function Chip({
  active,
  onClick,
  children,
  className = "",
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition ${
        active ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:border-ink/40"
      } ${className}`}
    >
      {children}
    </button>
  );
}
