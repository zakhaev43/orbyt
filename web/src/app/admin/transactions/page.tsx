"use client";

import { useState } from "react";
import useSWR from "swr";
import { Pager, SegmentedControl } from "@/components/admin/controls";
import { TransactionTable } from "@/components/admin/TransactionTable";
import AdminShell from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorBanner, ListSkeleton } from "@/components/ui/Feedback";
import { errorMessage, listAdminTransactions } from "@/lib/api";
import { CURRENCIES } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

const PAGE_SIZE = 25;

function TransactionsView() {
  useDocumentTitle("Admin · Transactions");
  const [kind, setKind] = useState("");
  const [currency, setCurrency] = useState("");
  const [page, setPage] = useState(1);

  const { data, error, isLoading } = useSWR(["admin-transactions", kind, currency, page], () =>
    listAdminTransactions({ page, pageSize: PAGE_SIZE, kind, currency }),
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Transactions" description="Every movement of money on the platform, newest first." />
      <div className="flex flex-wrap gap-3">
        <SegmentedControl
          label="Type"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "All" },
            { value: "transfer", label: "Transfers" },
            { value: "deposit", label: "Top-ups" },
          ]}
        />
        <SegmentedControl
          label="Currency"
          value={currency}
          onChange={(v) => {
            setCurrency(v);
            setPage(1);
          }}
          options={[{ value: "", label: "All" }, ...CURRENCIES.map((c) => ({ value: c as string, label: c }))]}
        />
      </div>

      {error && <ErrorBanner message={errorMessage(error, "Couldn't load transactions.")} />}

      <Card className="overflow-hidden">
        {isLoading || !data ? (
          <ListSkeleton rows={8} />
        ) : data.length === 0 ? (
          <EmptyState icon="activity" title="No transactions match" description="Try a different type or currency." />
        ) : (
          <>
            <TransactionTable rows={data} />
            <Pager page={page} hasNext={data.length === PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

export default function AdminTransactionsPage() {
  return (
    <AdminShell>
        <TransactionsView />
    </AdminShell>
  );
}
