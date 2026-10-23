import { ReactNode } from "react";
import { Icon, IconName } from "./Icon";

type Tone = "critical" | "good" | "warn" | "info";

const toneClasses: Record<Tone, string> = {
  critical: "border-critical/25 bg-critical-soft text-critical",
  good: "border-good/25 bg-good-soft text-good",
  warn: "border-warn/25 bg-warn-soft text-warn",
  info: "border-brand/20 bg-brand-soft text-brand",
};

const toneIcons: Record<Tone, IconName> = {
  critical: "alert",
  good: "check-circle",
  warn: "alert",
  info: "info",
};

export function Alert({
  tone = "critical",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div role={tone === "critical" ? "alert" : "status"} className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm ${toneClasses[tone]}`}>
      <Icon name={toneIcons[tone]} size={17} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return <Alert tone="critical">{message}</Alert>;
}

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-muted">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="mt-4 text-[15px] font-semibold text-ink-primary">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} aria-hidden="true" />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-hairline" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
