import { ReactNode } from "react";
import type { AccountStatus } from "@/lib/api";
import { Icon } from "./Icon";

type Tone = "neutral" | "good" | "warn" | "critical" | "brand";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-secondary",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  critical: "bg-critical-soft text-critical",
  brand: "bg-brand-soft text-brand",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: AccountStatus }) {
  if (status === "frozen") {
    return (
      <Badge tone="warn">
        <Icon name="snowflake" size={12} /> Frozen
      </Badge>
    );
  }
  if (status === "closed") {
    return (
      <Badge tone="neutral">
        <Icon name="ban" size={12} /> Closed
      </Badge>
    );
  }
  return (
    <Badge tone="good">
      <span className="h-1.5 w-1.5 rounded-full bg-current" /> Active
    </Badge>
  );
}
