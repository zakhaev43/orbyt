"use client";

import useSWR from "swr";
import { Icon } from "@/components/ui/Icon";
import { verifyLedger } from "@/lib/api";

export function LedgerStatusPill() {
  const { data } = useSWR("ledger-verify", verifyLedger, { revalidateOnFocus: false });

  if (!data) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-muted">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Verifying ledger…
      </span>
    );
  }

  return data.valid ? (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 text-xs font-medium text-good"
      title={`${data.entries_checked.toLocaleString()} ledger entries verified`}
    >
      <Icon name="shield" size={13} /> Ledger verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-critical-soft px-2.5 py-1 text-xs font-medium text-critical">
      <Icon name="alert" size={13} /> Ledger check failed
    </span>
  );
}
