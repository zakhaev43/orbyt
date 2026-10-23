"use client";

import { useState } from "react";
import { AccountCard, AccountCardSkeleton } from "@/components/AccountCard";
import AppShell from "@/components/AppShell";
import { OpenAccountDialog } from "@/components/OpenAccountDialog";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorBanner } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { errorMessage } from "@/lib/api";
import { useAccounts } from "@/lib/hooks";
import { CURRENCIES } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

function AccountsView() {
  useDocumentTitle("Accounts");
  const { data: accounts, error, isLoading, mutate } = useAccounts();
  const [open, setOpen] = useState(false);

  const current = (accounts ?? []).filter((a) => a.status !== "closed");
  const closed = (accounts ?? []).filter((a) => a.status === "closed");
  const canOpenMore = (accounts?.length ?? 0) < CURRENCIES.length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Accounts"
        description="One account per currency, each backed by its own ledger history."
        action={
          canOpenMore && (
            <Button icon="plus" onClick={() => setOpen(true)}>
              Open account
            </Button>
          )
        }
      />

      {error && <ErrorBanner message={errorMessage(error, "Couldn't load your accounts.")} />}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AccountCardSkeleton />
          <AccountCardSkeleton />
          <AccountCardSkeleton />
        </div>
      ) : current.length === 0 && closed.length === 0 ? (
        <Card>
          <EmptyState
            icon="wallet"
            title="No accounts yet"
            description="Open an account in any supported currency to start holding and sending money."
            action={
              <Button icon="plus" onClick={() => setOpen(true)}>
                Open your first account
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-rise">
          {current.map((account) => (
            <AccountCard key={account.id} account={account} href={`/accounts/${account.id}`} />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-muted">Closed accounts</h2>
          <div className="grid gap-4 opacity-75 sm:grid-cols-2 lg:grid-cols-3">
            {closed.map((account) => (
              <AccountCard key={account.id} account={account} href={`/accounts/${account.id}`} />
            ))}
          </div>
        </section>
      )}

      <OpenAccountDialog open={open} onClose={() => setOpen(false)} existing={accounts ?? []} onCreated={() => mutate()} />
    </div>
  );
}

export default function AccountsPage() {
  return (
    <AppShell>
      <AccountsView />
    </AppShell>
  );
}
