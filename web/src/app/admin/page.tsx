"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { AdminFrame, SegmentedControl } from "@/components/admin/AdminFrame";
import { TransactionTable } from "@/components/admin/TransactionTable";
import AppShell from "@/components/AppShell";
import { Sparkline } from "@/components/charts/Sparkline";
import { StackedColumnChart } from "@/components/charts/StackedColumnChart";
import { Avatar, CurrencyBadge } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorBanner, ListSkeleton, Skeleton } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { AdminActivity, errorMessage, getAdminActivity, getAdminStats, listAdminTransactions } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

const RANGES = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

function dayList(since: string, days: number): string[] {
  const start = new Date(`${since}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function useActivitySeries(activity: AdminActivity | undefined) {
  return useMemo(() => {
    if (!activity) return null;
    const days = dayList(activity.since, activity.days);
    const index = new Map(days.map((d, i) => [d, i]));
    const transfers = new Array(days.length).fill(0);
    const deposits = new Array(days.length).fill(0);
    const volumeByCurrency = new Map<string, number[]>();
    const countByCurrency = new Map<string, number>();

    for (const p of activity.points) {
      const i = index.get(p.day);
      if (i === undefined) continue;
      if (p.kind === "transfer") {
        transfers[i] += p.count;
        const volumes = volumeByCurrency.get(p.currency) ?? new Array(days.length).fill(0);
        volumes[i] += p.volume;
        volumeByCurrency.set(p.currency, volumes);
        countByCurrency.set(p.currency, (countByCurrency.get(p.currency) ?? 0) + p.count);
      } else {
        deposits[i] += p.count;
      }
    }
    return { days, transfers, deposits, volumeByCurrency, countByCurrency };
  }, [activity]);
}

function StatTile({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  tone?: "neutral" | "good" | "critical";
}) {
  return (
    <Card className="px-5 py-4">
      <div className="text-[13px] font-medium text-ink-muted">{label}</div>
      <div
        className={`mt-1 text-[28px] leading-tight font-semibold tracking-tight ${
          tone === "good" ? "text-good" : tone === "critical" ? "text-critical" : "text-ink-primary"
        }`}
      >
        {value}
      </div>
      {detail && <div className="mt-1 text-[13px] text-ink-secondary">{detail}</div>}
    </Card>
  );
}

function OverviewView() {
  useDocumentTitle("Admin");
  const [range, setRange] = useState(30);
  const stats = useSWR("admin-stats", getAdminStats);
  const activity = useSWR(["admin-activity", range], () => getAdminActivity(range));
  const recent = useSWR(["admin-recent"], () => listAdminTransactions({ page: 1, pageSize: 8 }));
  const series = useActivitySeries(activity.data);

  const s = stats.data;
  const totals = useMemo(() => {
    if (!s) return null;
    let accounts = 0;
    let frozen = 0;
    let tx30 = 0;
    for (const c of s.currencies) {
      accounts += c.accounts;
      frozen += c.frozen;
      tx30 += c.transfers.count_30d + c.deposits.count_30d;
    }
    return { accounts, frozen, tx30 };
  }, [s]);

  const rangeTotal = series ? series.transfers.reduce((a, b) => a + b, 0) + series.deposits.reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-6">
      {stats.error && <ErrorBanner message={errorMessage(stats.error, "Couldn't load platform stats.")} />}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {!s || !totals ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[108px] rounded-2xl" />)
        ) : (
          <>
            <StatTile
              label="Customers"
              value={s.users.total.toLocaleString()}
              detail={
                <>
                  <span className="font-medium text-good">+{s.users.new_since}</span> in the last 30 days
                </>
              }
            />
            <StatTile
              label="Accounts"
              value={totals.accounts.toLocaleString()}
              detail={
                totals.frozen > 0 ? (
                  <span className="inline-flex items-center gap-1 text-warn">
                    <Icon name="snowflake" size={13} /> {totals.frozen} frozen
                  </span>
                ) : (
                  "None frozen"
                )
              }
            />
            <StatTile label="Transactions · 30 days" value={totals.tx30.toLocaleString()} detail="Transfers and top-ups" />
            <StatTile
              label="Ledger"
              value={s.ledger.valid ? "Healthy" : "Issues found"}
              tone={s.ledger.valid ? "good" : "critical"}
              detail={
                <span className="inline-flex items-center gap-1">
                  <Icon name={s.ledger.valid ? "shield" : "alert"} size={13} />
                  {s.ledger.entries_checked.toLocaleString()} entries verified
                </span>
              }
            />
          </>
        )}
      </section>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">Transactions per day</h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {series ? `${rangeTotal.toLocaleString()} in the last ${range} days, all currencies` : "Loading…"}
            </p>
          </div>
          <SegmentedControl label="Date range" options={RANGES} value={range} onChange={setRange} />
        </div>
        {activity.error ? (
          <ErrorBanner message={errorMessage(activity.error, "Couldn't load activity.")} />
        ) : !series ? (
          <Skeleton className="h-[270px] w-full" />
        ) : (
          <StackedColumnChart
            title={`Transactions per day over the last ${range} days`}
            days={series.days}
            series={[
              { key: "transfer", label: "Transfers", color: "var(--series-1)", values: series.transfers },
              { key: "deposit", label: "Top-ups", color: "var(--series-2)", values: series.deposits },
            ]}
          />
        )}
      </Card>

      <section aria-label="Transfer volume by currency">
        <h2 className="mb-3 text-[15px] font-semibold">Transfer volume · last {range} days</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {!series || !s
            ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[150px] rounded-2xl" />)
            : s.currencies.map((c) => {
                const volumes = series.volumeByCurrency.get(c.currency) ?? new Array(series.days.length).fill(0);
                const total = volumes.reduce((a: number, b: number) => a + b, 0);
                const count = series.countByCurrency.get(c.currency) ?? 0;
                return (
                  <Card key={c.currency} className="px-5 pt-4 pb-3">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-ink-muted">
                      <CurrencyBadge currency={c.currency} size={20} /> {c.currency}
                    </div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight">{formatMoney(total, c.currency, { compact: true })}</div>
                    <div className="text-[13px] text-ink-secondary">
                      {count.toLocaleString()} transfers{count > 0 && <> · avg {formatMoney(Math.round(total / count), c.currency)}</>}
                    </div>
                    <div className="mt-3">
                      <Sparkline
                        days={series.days}
                        values={volumes}
                        label={`${c.currency} daily transfer volume`}
                        format={(v) => formatMoney(v, c.currency)}
                      />
                    </div>
                  </Card>
                );
              })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader title="By currency" description="Customer accounts and money held, all time." />
          {!s ? (
            <ListSkeleton rows={4} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-ink-muted">
                  <tr className="border-y border-hairline">
                    <th className="px-5 py-2.5 font-medium">Currency</th>
                    <th className="px-3 py-2.5 text-right font-medium">Accounts</th>
                    <th className="px-3 py-2.5 text-right font-medium">Held</th>
                    <th className="px-3 py-2.5 text-right font-medium">Topped up</th>
                    <th className="px-5 py-2.5 text-right font-medium">Transferred</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums divide-y divide-hairline">
                  {s.currencies.map((c) => (
                    <tr key={c.currency}>
                      <td className="px-5 py-3 font-medium">{c.currency}</td>
                      <td className="px-3 py-3 text-right">
                        {c.accounts}
                        {c.frozen > 0 && <div className="text-xs whitespace-nowrap text-warn">{c.frozen} frozen</div>}
                      </td>
                      <td className="px-3 py-3 text-right font-medium">{formatMoney(c.balances_held, c.currency)}</td>
                      <td className="px-3 py-3 text-right text-ink-secondary">{formatMoney(c.deposits.volume, c.currency)}</td>
                      <td className="px-5 py-3 text-right text-ink-secondary">
                        {formatMoney(c.transfers.volume, c.currency)}
                        <div className="text-xs text-ink-muted">{c.transfers.count.toLocaleString()} transfers</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Top senders" description="By volume, last 30 days." />
          {!s ? (
            <ListSkeleton rows={5} />
          ) : s.top_senders.length === 0 ? (
            <EmptyState icon="send" title="No transfers yet" />
          ) : (
            <ol className="divide-y divide-hairline border-t border-hairline">
              {s.top_senders.map((t, i) => (
                <li key={`${t.owner}-${t.currency}`} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-4 text-xs font-medium text-ink-muted tabular-nums">{i + 1}</span>
                  <Avatar name={t.full_name || t.owner} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.full_name}</div>
                    <div className="truncate text-xs text-ink-muted">
                      @{t.owner} · {t.transfers} transfers
                    </div>
                  </div>
                  <div className="tabular-nums text-sm font-medium">{formatMoney(t.volume, t.currency)}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Latest transactions"
          action={
            <ButtonLink href="/admin/transactions" variant="ghost" size="sm" trailingIcon="chevron-right">
              View all
            </ButtonLink>
          }
        />
        {!recent.data ? <ListSkeleton rows={4} /> : <TransactionTable rows={recent.data} />}
      </Card>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AppShell>
      <AdminFrame>
        <OverviewView />
      </AdminFrame>
    </AppShell>
  );
}
