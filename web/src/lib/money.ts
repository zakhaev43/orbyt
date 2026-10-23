// All amounts from the API are integers in minor units (e.g. cents).

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  CAD: "Canadian Dollar",
};

const digitsCache = new Map<string, number>();

export function fractionDigits(currency: string): number {
  let digits = digitsCache.get(currency);
  if (digits === undefined) {
    digits =
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    digitsCache.set(currency, digits);
  }
  return digits;
}

export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** fractionDigits(currency);
}

export function formatMoney(
  minor: number,
  currency: string,
  options: { signed?: boolean; compact?: boolean } = {},
): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    signDisplay: options.signed ? "exceptZero" : "auto",
    notation: options.compact ? "compact" : "standard",
    maximumFractionDigits: options.compact ? 1 : undefined,
  }).format(toMajor(minor, currency));
}

/** Splits a formatted amount so the fraction can be styled separately. */
export function formatMoneyParts(minor: number, currency: string) {
  const parts = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(toMajor(minor, currency));

  let whole = "";
  let fraction = "";
  let inFraction = false;
  for (const part of parts) {
    if (part.type === "decimal") inFraction = true;
    if (inFraction) fraction += part.value;
    else whole += part.value;
  }
  return { whole, fraction };
}

export function currencySymbol(currency: string): string {
  const part = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  })
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? currency;
}

/**
 * Parses user input like "1,234.5" into minor units without going through
 * floating point. Returns null for anything that isn't a valid positive amount
 * with at most the currency's number of decimals.
 */
export function parseAmountToMinor(input: string, currency: string): number | null {
  const digits = fractionDigits(currency);
  const cleaned = input.replace(/[\s,]/g, "");
  const pattern = digits > 0 ? new RegExp(`^(\\d+)(?:\\.(\\d{0,${digits}}))?$`) : /^(\d+)$/;
  const match = cleaned.match(pattern);
  if (!match) return null;

  const whole = match[1];
  const fraction = (match[2] ?? "").padEnd(digits, "0");
  const minor = Number(whole + fraction);
  if (!Number.isSafeInteger(minor) || minor <= 0) return null;
  return minor;
}

/** Formats minor units back into a plain editable string, e.g. 1250 -> "12.50". */
export function minorToInput(minor: number, currency: string): string {
  const digits = fractionDigits(currency);
  if (digits === 0) return String(minor);
  const s = String(minor).padStart(digits + 1, "0");
  return `${s.slice(0, -digits)}.${s.slice(-digits)}`;
}
