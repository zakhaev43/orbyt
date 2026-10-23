import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Icon, IconName } from "./Icon";

const controlBase =
  "w-full rounded-xl border bg-surface text-[15px] text-ink-primary placeholder:text-ink-muted outline-none transition-[border-color,box-shadow] duration-150 focus:border-brand focus:ring-4 focus:ring-ring/40 disabled:opacity-60";

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-secondary">
      {children}
    </label>
  );
}

export function Input({
  icon,
  trailing,
  invalid,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  icon?: IconName;
  trailing?: ReactNode;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-muted">
          <Icon name={icon} size={17} />
        </span>
      )}
      <input
        aria-invalid={invalid || undefined}
        className={`${controlBase} h-11 ${icon ? "pl-10" : "pl-3.5"} ${trailing ? "pr-11" : "pr-3.5"} ${
          invalid ? "border-critical focus:border-critical focus:ring-critical/20" : "border-border"
        } ${className}`}
        {...props}
      />
      {trailing && <span className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</span>}
    </div>
  );
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={`${controlBase} h-11 appearance-none border-border pr-10 pl-3.5 ${className}`}
        {...props}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-muted">
        <Icon name="chevron-down" size={16} />
      </span>
    </div>
  );
}

export function FieldHint({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "critical" | "good" }) {
  const color = tone === "critical" ? "text-critical" : tone === "good" ? "text-good" : "text-ink-muted";
  return <p className={`mt-1.5 text-[13px] ${color}`}>{children}</p>;
}
