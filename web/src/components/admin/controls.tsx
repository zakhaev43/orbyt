"use client";

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
            o.value === value ? "bg-surface text-ink-primary shadow-soft" : "text-ink-muted hover:text-ink-primary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pager({
  page,
  hasNext,
  onChange,
}: {
  page: number;
  hasNext: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-hairline px-5 py-3 text-sm">
      <span className="text-ink-muted">Page {page}</span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-lg border border-border px-3 py-1.5 font-medium text-ink-secondary transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!hasNext}
          onClick={() => onChange(page + 1)}
          className="rounded-lg border border-border px-3 py-1.5 font-medium text-ink-secondary transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
