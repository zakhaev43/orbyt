"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import useSWR from "swr";
import { LedgerStatusPill } from "@/components/LedgerStatus";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/api";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/users", label: "Users" },
];

export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: me, isLoading } = useSWR("me", getCurrentUser);

  if (isLoading || !me) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (me.role !== "admin") {
    return (
      <Card>
        <EmptyState
          icon="lock"
          title="Admins only"
          description="Your account doesn't have access to the admin area."
          action={<ButtonLink href="/dashboard">Back to home</ButtonLink>}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Admin" description="Platform health, activity and customers." action={<LedgerStatusPill />} />
      <nav aria-label="Admin sections" className="flex gap-1 border-b border-hairline">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "border-brand text-ink-primary" : "border-transparent text-ink-muted hover:text-ink-primary"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}

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
