"use client";

import useSWR from "swr";
import AdminShell from "@/components/admin/AdminShell";
import { LedgerCard } from "@/components/LedgerCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorBanner, ListSkeleton } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { errorMessage, getAdminStats } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

function MoneySupply() {
  const { data, error } = useSWR("admin-stats", getAdminStats);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Money supply"
        description="Money only enters through treasury top-ups, so what customers hold must equal what the treasury issued."
      />
      {error ? (
        <div className="px-5 pb-5">
          <ErrorBanner message={errorMessage(error, "Couldn't load money supply.")} />
        </div>
      ) : !data ? (
        <ListSkeleton rows={4} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-ink-muted">
              <tr className="border-y border-hairline">
                <th className="px-5 py-2.5 font-medium">Currency</th>
                <th className="px-3 py-2.5 text-right font-medium">Issued by treasury</th>
                <th className="px-3 py-2.5 text-right font-medium">Held by customers</th>
                <th className="px-5 py-2.5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="tabular-nums divide-y divide-hairline">
              {data.currencies.map((c) => {
                const ok = c.deposits.volume === c.balances_held;
                return (
                  <tr key={c.currency}>
                    <td className="px-5 py-3 font-medium">{c.currency}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(c.deposits.volume, c.currency)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(c.balances_held, c.currency)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 text-[13px] font-medium ${ok ? "text-good" : "text-critical"}`}>
                        <Icon name={ok ? "check-circle" : "alert"} size={15} />
                        {ok ? "Reconciled" : `Off by ${formatMoney(Math.abs(c.deposits.volume - c.balances_held), c.currency)}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function HowItWorks() {
  const points = [
    { icon: "layers" as const, title: "Double entry", body: "Every transaction writes a debit and a credit that sum to zero. The database rejects anything else at commit." },
    { icon: "lock" as const, title: "Append-only", body: "Ledger entries can't be edited or deleted; corrections are new transactions." },
    { icon: "shield" as const, title: "Hash-chained", body: "Each entry includes the hash of the one before it, so tampering with history breaks the chain." },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {points.map((p) => (
        <Card key={p.title} className="p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Icon name={p.icon} size={18} />
          </span>
          <h3 className="mt-3 text-sm font-semibold">{p.title}</h3>
          <p className="mt-1 text-[13px] text-ink-muted">{p.body}</p>
        </Card>
      ))}
    </div>
  );
}

function LedgerView() {
  useDocumentTitle("Admin · Ledger");
  return (
    <div className="space-y-6">
      <PageHeader title="Ledger" description="Integrity checks and reconciliation for the whole platform." />
      <LedgerCard />
      <MoneySupply />
      <HowItWorks />
    </div>
  );
}

export default function AdminLedgerPage() {
  return (
    <AdminShell>
      <LedgerView />
    </AdminShell>
  );
}
