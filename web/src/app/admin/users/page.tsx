"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Pager } from "@/components/admin/controls";
import AdminShell from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorBanner, ListSkeleton } from "@/components/ui/Feedback";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { errorMessage, listAdminUsers } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

const PAGE_SIZE = 25;

function UsersView() {
  useDocumentTitle("Admin · Users");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useDebounced(search.trim(), 300);

  const { data, error, isLoading } = useSWR(["admin-users", query, page], () =>
    listAdminUsers({ page, pageSize: PAGE_SIZE, search: query }),
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Users" description="Everyone registered on Orbyt." />
      <Input
        icon="search"
        placeholder="Search by name, username or email"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />

      {error && <ErrorBanner message={errorMessage(error, "Couldn't load users.")} />}

      <Card className="overflow-hidden">
        {isLoading || !data ? (
          <ListSkeleton rows={8} />
        ) : data.length === 0 ? (
          <EmptyState icon="search" title="No users found" description={query ? `Nothing matches "${query}".` : undefined} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="text-left text-xs text-ink-muted">
                  <tr className="border-b border-hairline">
                    <th className="px-5 py-2.5 font-medium">User</th>
                    <th className="px-3 py-2.5 font-medium">Email</th>
                    <th className="px-3 py-2.5 font-medium">Role</th>
                    <th className="px-3 py-2.5 text-right font-medium">Accounts</th>
                    <th className="px-5 py-2.5 text-right font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {data.map((u) => (
                    <tr key={u.username} className="transition-colors hover:bg-surface-2/60">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.full_name || u.username} size={32} />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{u.full_name}</div>
                            <div className="truncate text-xs text-ink-muted">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-ink-secondary">{u.email}</td>
                      <td className="px-3 py-2.5">
                        {u.role === "admin" ? (
                          <Badge tone="brand">
                            <Icon name="shield" size={12} /> Admin
                          </Badge>
                        ) : (
                          <Badge>Customer</Badge>
                        )}
                      </td>
                      <td className="tabular-nums px-3 py-2.5 text-right">
                        {u.accounts > 0 ? (
                          <Link
                            href={`/admin/accounts?owner=${encodeURIComponent(u.username)}`}
                            className="font-medium text-brand hover:underline"
                            title={`View ${u.username}'s accounts`}
                          >
                            {u.accounts}
                          </Link>
                        ) : (
                          <span className="text-ink-muted">0</span>
                        )}
                        {u.frozen_accounts > 0 && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-warn">
                            <Icon name="snowflake" size={11} />
                            {u.frozen_accounts}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-secondary">{formatDate(u.created_at)}</td>
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

export default function AdminUsersPage() {
  return (
    <AdminShell>
        <UsersView />
    </AdminShell>
  );
}
