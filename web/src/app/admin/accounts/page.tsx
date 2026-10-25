"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { Pager, SegmentedControl } from "@/components/admin/controls";
import AdminShell from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar, CurrencyBadge } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorBanner, ListSkeleton } from "@/components/ui/Feedback";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { errorMessage, listAdminAccounts } from "@/lib/api";
import { formatAccountNumber, formatDate, formatDateTime } from "@/lib/format";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { useDebounced } from "@/lib/useDebounced";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

const PAGE_SIZE = 25;

function AccountsView() {
  useDocumentTitle("Admin · Accounts");
  const router = useRouter();
  const owner = useSearchParams().get("owner") ?? "";

  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"newest" | "balance">("balance");
  const [page, setPage] = useState(1);
  const query = useDebounced(search.trim(), 300);

  const { data, error, isLoading } = useSWR(["admin-accounts", owner, query, currency, status, sort, page], () =>
    listAdminAccounts({ page, pageSize: PAGE_SIZE, owner, search: query, currency, status, sort }),
  );

  function resetPage<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Accounts" description="Every customer account and its balance." />
      {owner && (
        <div className="flex items-center gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand">
          <Icon name="user" size={16} />
          <span>
            Showing accounts held by <span className="font-semibold">@{owner}</span>
          </span>
          <button
            type="button"
            onClick={() => router.push("/admin/accounts")}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium hover:bg-brand/10"
          >
            <Icon name="x" size={14} /> Clear
          </button>
        </div>
      )}

      {!owner && (
        <Input
          icon="search"
          placeholder="Search by holder name, username or account number"
          value={search}
          onChange={(e) => resetPage(setSearch)(e.target.value)}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <SegmentedControl
          label="Status"
          value={status}
          onChange={resetPage(setStatus)}
          options={[
            { value: "", label: "All" },
            { value: "active", label: "Active" },
            { value: "frozen", label: "Frozen" },
            { value: "closed", label: "Closed" },
          ]}
        />
        <SegmentedControl
          label="Currency"
          value={currency}
          onChange={resetPage(setCurrency)}
          options={[{ value: "", label: "All" }, ...CURRENCIES.map((c) => ({ value: c as string, label: c }))]}
        />
        <SegmentedControl
          label="Sort"
          value={sort}
          onChange={resetPage(setSort)}
          options={[
            { value: "balance", label: "Largest balance" },
            { value: "newest", label: "Newest" },
          ]}
        />
      </div>

      {error && <ErrorBanner message={errorMessage(error, "Couldn't load accounts.")} />}

      <Card className="overflow-hidden">
        {isLoading || !data ? (
          <ListSkeleton rows={8} />
        ) : data.length === 0 ? (
          <EmptyState icon="wallet" title="No accounts match" description="Try a different filter or search." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-ink-muted">
                  <tr className="border-b border-hairline">
                    <th className="px-5 py-2.5 font-medium">Account</th>
                    <th className="px-3 py-2.5 font-medium">Holder</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium">Entries</th>
                    <th className="px-3 py-2.5 font-medium">Last activity</th>
                    <th className="px-5 py-2.5 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {data.map((a) => (
                    <tr key={a.id} className="transition-colors hover:bg-surface-2/60">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <CurrencyBadge currency={a.currency} size={28} />
                          <div>
                            <div className="font-mono text-[13px]">{formatAccountNumber(a.id)}</div>
                            <div className="text-xs text-ink-muted">
                              {a.currency} · opened {formatDate(a.created_at)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/admin/accounts?owner=${encodeURIComponent(a.owner)}`} className="group flex items-center gap-2.5">
                          <Avatar name={a.full_name || a.owner} size={28} />
                          <div className="min-w-0">
                            <div className="truncate font-medium group-hover:text-brand">{a.full_name}</div>
                            <div className="truncate text-xs text-ink-muted">@{a.owner}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="tabular-nums px-3 py-2.5 text-right text-ink-secondary">{a.entries.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-secondary">
                        {a.entries > 0 ? formatDateTime(a.last_activity) : <span className="text-ink-muted">None yet</span>}
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-5 py-2.5 text-right font-semibold">
                        {formatMoney(a.balance, a.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} hasNext={data.length === PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

export default function AdminAccountsPage() {
  return (
    <AdminShell>
        <Suspense fallback={<ListSkeleton rows={8} />}>
          <AccountsView />
        </Suspense>
    </AdminShell>
  );
}
