import Link from "next/link";
import { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { Icon, IconName } from "./Icon";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-ink shadow-soft hover:bg-brand-strong active:translate-y-px disabled:bg-brand/50",
  secondary:
    "border border-border bg-surface text-ink-primary shadow-soft hover:bg-surface-2 active:translate-y-px",
  soft: "bg-brand-soft text-brand hover:bg-brand/15 active:translate-y-px",
  ghost: "text-ink-secondary hover:bg-surface-2 hover:text-ink-primary",
  danger: "bg-critical text-white shadow-soft hover:opacity-90 active:translate-y-px",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-xl px-5 text-[15px]",
};

function classes(variant: Variant, size: Size, className: string) {
  return `inline-flex shrink-0 select-none items-center justify-center font-medium transition-[background-color,color,transform,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

type CommonProps = {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  trailingIcon?: IconName;
  children?: ReactNode;
  className?: string;
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & CommonProps & { loading?: boolean }) {
  return (
    <button
      className={classes(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={size === "lg" ? 18 : 16} /> : icon && <Icon name={icon} size={16} />}
      {children}
      {trailingIcon && !loading && <Icon name={trailingIcon} size={16} />}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  className = "",
  children,
  ...props
}: ComponentProps<typeof Link> & CommonProps) {
  return (
    <Link className={classes(variant, size, className)} {...props}>
      {icon && <Icon name={icon} size={16} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} size={16} />}
    </Link>
  );
}

export function IconButton({
  icon,
  label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink-primary ${className}`}
      {...props}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
