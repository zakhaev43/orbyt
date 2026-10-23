"use client";

import { currencySymbol, fractionDigits } from "@/lib/money";

/** Large, keypad-friendly amount field. The value is the raw decimal string. */
export function AmountInput({
  value,
  onChange,
  currency,
  invalid,
  autoFocus,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  currency: string;
  invalid?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  const digits = fractionDigits(currency);

  function handleChange(raw: string) {
    const normalized = raw.replace(",", ".").replace(/[^\d.]/g, "");
    const [whole, ...rest] = normalized.split(".");
    if (rest.length > 1) return;
    const fraction = rest[0];
    if (fraction !== undefined && (digits === 0 || fraction.length > digits)) return;
    if (whole.length > 10) return;
    onChange(fraction === undefined ? whole : `${whole}.${fraction}`);
  }

  return (
    <div
      className={`flex items-baseline justify-center gap-1 rounded-2xl border bg-surface-2/50 px-4 py-6 transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-4 focus-within:ring-ring/40 ${
        invalid ? "border-critical" : "border-border"
      }`}
    >
      <span className="text-3xl font-semibold text-ink-muted">{currencySymbol(currency)}</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder={digits > 0 ? `0.${"0".repeat(digits)}` : "0"}
        value={value}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        onChange={(e) => handleChange(e.target.value)}
        className="tabular-nums w-full max-w-[12ch] min-w-[3ch] bg-transparent text-center text-5xl font-semibold tracking-tight text-ink-primary outline-none placeholder:text-ink-muted/50"
        style={{ width: `${Math.max(value.length, 4) + 0.5}ch` }}
      />
    </div>
  );
}
