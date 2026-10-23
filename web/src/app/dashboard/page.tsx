"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { AccountCard, AccountCardSkeleton } from "@/components/AccountCard";
import { ActivityList } from "@/components/ActivityList";
import { AddMoneyDialog } from "@/components/AddMoneyDialog";
import AppShell from "@/components/AppShell";
import { LedgerStatusPill } from "@/components/LedgerStatus";
import { OpenAccountDialog } from "@/components/OpenAccountDialog";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorBanner, ListSkeleton } from "@/components/ui/Feedback";
import { Icon, IconName } from "@/components/ui/Icon";
import { Account, errorMessage, getCurrentUser } from "@/lib/api";
import { useAccounts, useActivity } from "@/lib/hooks";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function QuickAction({
  icon,
  label,
  onClick,
  href,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const content = (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand transition-transform group-hover:scale-105">
        <Icon name={icon} size={21} />
      </span>
      <span className="whitespace-nowrap text-[13px] font-medium text-ink-secondary group-hover:text-ink-primary">{label}</span>
    </>
  );
  const className = `group flex flex-col items-center gap-2 rounded-2xl p-2 transition-opacity ${
    disabled ? "pointer-events-none opacity-40" : ""
  }`;
  if (href) {
    return (
      <Link href={href} className={className} aria-disabled={disabled}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} disabled={disabled}>
      {content}
    </button>
  );
}

function DashboardView() {
  useDocumentTitle("Home");
  const { data: user } = useSWR("me", getCurrentUser);
  const { data: accounts, error, isLoading, mutate } = useAccounts();
  const { data: activity, isLoading: activityLoading } = useActivity(accounts, 10);
  const [openAccount, setOpenAccount] = useState(false);
  const [topUp, setTopUp] = useState<Account | null>(null);

  const visible = (accounts ?? []).filter((a) => a.status !== "closed");
  const firstActive = visible.find((a) => a.status === "active");
  const firstName = user?.full_name.split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-in">
        <div>
          <p className="text-[15px] text-ink-muted">{greeting()}{firstName ? `, ${firstName}` : ""}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-[28px]">Your money</h1>
        </div>
        <LedgerStatusPill />
      </div>

      {error && <ErrorBanner message={errorMessage(error, "Couldn't load your accounts.")} />}

      <section aria-label="Accounts" className="animate-rise">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AccountCardSkeleton />
            <AccountCardSkeleton />
          </div>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon="wallet"
              title="Open your first account"
              description="Hold balances in USD, EUR, GBP or CAD and send money instantly to anyone on Orbyt."
              action={
                <button
                  onClick={() => setOpenAccount(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink hover:bg-brand-strong"
                >
                  <Icon name="plus" size={16} /> Open an account
                </button>
              }
            />
          </Card>
        ) : (
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {visible.map((account) => (
              <div key={account.id} className="w-[85%] shrink-0 snap-center sm:w-auto">
                <AccountCard account={account} href={`/accounts/${account.id}`} />
              </div>
            ))}
            {visible.length < 4 && (
              <button
                onClick={() => setOpenAccount(true)}
                className="flex h-44 w-[85%] shrink-0 snap-center flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-ink-muted transition-colors hover:border-brand hover:text-brand sm:w-auto"
              >
                <Icon name="plus" size={22} />
                <span className="text-sm font-medium">Add a currency</span>
              </button>
            )}
          </div>
        )}
      </section>

      <section aria-label="Quick actions" className="grid grid-cols-4 gap-2 sm:max-w-md">
        <QuickAction icon="send" label="Send" href="/transfer" disabled={!firstActive} />
        <QuickAction icon="plus" label="Add money" onClick={() => firstActive && setTopUp(firstActive)} disabled={!firstActive} />
        <QuickAction icon="wallet" label="Accounts" href="/accounts" />
        <QuickAction icon="activity" label="Activity" href="/history" />
      </section>

      <Card className="overflow-hidden">
        <CardHeader
          title="Recent activity"
          action={
            <ButtonLink href="/history" variant="ghost" size="sm" trailingIcon="chevron-right">
              See all
            </ButtonLink>
          }
        />
        {isLoading || activityLoading ? (
          <ListSkeleton rows={4} />
        ) : !activity || activity.length === 0 ? (
          <EmptyState
            icon="activity"
            title="No activity yet"
            description="Add money to an account or send your first transfer to see it here."
          />
        ) : (
          <ActivityList
            lines={activity.slice(0, 8).map((item) => ({ ...item, currency: item.account.currency }))}
          />
        )}
      </Card>

      <OpenAccountDialog
        open={openAccount}
        onClose={() => setOpenAccount(false)}
        existing={accounts ?? []}
        onCreated={() => mutate()}
      />
      {topUp && <AddMoneyDialog account={topUp} open onClose={() => setTopUp(null)} />}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}
