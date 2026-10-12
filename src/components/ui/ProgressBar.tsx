export function ProgressBar({ value, label }: { value?: number; label?: string }) {
  const indeterminate = value === undefined;
  return (
    <div className="w-full">
      {label && <div className="mb-1.5 text-sm text-muted">{label}</div>}
      <div className="h-2 w-full overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full bg-accent transition-[width] duration-300 ${
            indeterminate ? "w-1/3 animate-pulse" : ""
          }`}
          style={indeterminate ? undefined : { width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}
