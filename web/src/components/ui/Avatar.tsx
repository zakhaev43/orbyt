import { initials } from "@/lib/format";
import { currencySymbol } from "@/lib/money";
import { Icon, IconName } from "./Icon";

// Deterministic hue per name so the same person always gets the same colour.
function hueFor(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360;
  return hash;
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const hue = hueFor(name);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))`,
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function IconAvatar({
  icon,
  tone = "neutral",
  size = 40,
}: {
  icon: IconName;
  tone?: "neutral" | "good" | "brand";
  size?: number;
}) {
  const toneClass =
    tone === "good" ? "bg-good-soft text-good" : tone === "brand" ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-secondary";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${toneClass}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon name={icon} size={size * 0.45} />
    </span>
  );
}

const currencyGradients: Record<string, string> = {
  USD: "from-emerald-500 to-teal-600",
  EUR: "from-blue-500 to-indigo-600",
  GBP: "from-violet-500 to-fuchsia-600",
  CAD: "from-rose-500 to-orange-500",
};

export function currencyGradient(currency: string): string {
  return currencyGradients[currency] ?? "from-slate-500 to-slate-700";
}

export function CurrencyBadge({ currency, size = 40 }: { currency: string; size?: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br font-semibold text-white shadow-soft ${currencyGradient(currency)}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {currencySymbol(currency)}
    </span>
  );
}
