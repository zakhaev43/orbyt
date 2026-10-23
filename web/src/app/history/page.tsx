"use client";

import { useMemo, useState } from "react";
import { ActivityList } from "@/components/ActivityList";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorBanner, ListSkeleton } from "@/components/ui/Feedback";
import { Input } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { activitySubtitle, activityTitle } from "@/lib/activity";
import { errorMessage } from "@/lib/api";
import { useAccounts, useActivity } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

type Filter = "all" | "in" | "out" | "topups";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in", label: "Money in" },
  { id: "out", label: "Money out" },
  { id: "topups", label: "Top-ups" },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active ? "bg-ink-primary text-page" : "bg-surface-2 text-ink-secondary hover:text-ink-primary"
      }`}
    >
      {children}
    </button>
  );
}

function HistoryView() {
  useDocumentTitle("Activity");
  const { data: accounts, error: accountsError, isLoading: loadingAccounts } = useAccounts();
  const { data: activity, error: activityError, isLoading: loadingActivity } = useActivity(accounts);

  const [filter, setFilter] = useState<Filter>("all");
  const [accountId, setAccountId] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (activity ?? []).filter((item) => {
      if (accountId !== "all" && item.account.id !== accountId) return false;
      const topUp = item.kind === "deposit" || item.counterparty_is_system;
      if (filter === "topups" && !topUp) return false;
      if (filter === "in" && (item.amount < 0 || topUp)) return false;
      if (filter === "out" && item.amount > 0) return false;
      if (q) {
        const haystack = `${activityTitle(item)} ${activitySubtitle(item)} ${item.description}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [activity, filter, accountId, query]);

  const totals = useMemo(() => {
    const byCurrency = new Map<string, { in: number; out: number }>();
    for (const item of filtered) {
      const t = byCurrency.get(item.account.currency) ?? { in: 0, out: 0 };
      if (item.amount > 0) t.in += item.amount;
      else t.out += -item.amount;
      byCurrency.set(item.account.currency, t);
    }
    return Array.from(byCurrency.entries());
  }, [filtered]);

  const error = accountsError ?? activityError;
  const loading = loadingAccounts || loadingActivity;
  const multipleAccounts = (accounts?.length ?? 0) > 1;

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Every movement across all of your accounts." />

      {error && <ErrorBanner message={errorMessage(error, "Couldn't load your activity.")} />}

      <div className="space-y-3">
        <Input icon="search" placeholder="Search by name or note" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
          {multipleAccounts && <span className="mx-1 w-px shrink-0 bg-border" aria-hidden="true" />}
          {multipleAccounts && (
            <>
              <Chip active={accountId === "all"} onClick={() => setAccountId("all")}>
                All accounts
              </Chip>
              {accounts!.map((a) => (
                <Chip key={a.id} active={accountId === a.id} onClick={() => setAccountId(a.id)}>
                  {a.currency}
                </Chip>
              ))}
            </>
          )}
        </div>
      </div>

      {totals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {totals.map(([currency, t]) => (
            <Card key={currency} className="px-4 py-3">
              <div className="text-xs font-medium text-ink-muted uppercase">{currency}</div>
              <div className="tabular-nums mt-1 flex items-baseline gap-4 text-sm">
                <span className="font-semibold text-good">+{formatMoney(t.in, currency)}</span>
                <span className="font-semibold text-ink-primary">−{formatMoney(t.out, currency)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={activity && activity.length > 0 ? "search" : "activity"}
            title={activity && activity.length > 0 ? "Nothing matches" : "No activity yet"}
            description={
              activity && activity.length > 0
                ? "Try a different filter or search term."
                : "Your transfers and top-ups will appear here."
            }
          />
        ) : (
          <ActivityList
            lines={filtered.map((item) => ({
              ...item,
              currency: item.account.currency,
              accountLabel: multipleAccounts ? item.account.currency : undefined,
            }))}
          />
        )}
      </Card>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <AppShell>
      <HistoryView />
    </AppShell>
  );
}
