"use client";

import useSWR from "swr";
import AppShell from "@/components/AppShell";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorBanner, Skeleton } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { errorMessage, getCurrentUser, verifyLedger } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAccounts } from "@/lib/hooks";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <span className={`mt-0.5 ${ok ? "text-good" : "text-critical"}`}>
        <Icon name={ok ? "check-circle" : "alert"} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[13px] text-ink-muted">{detail}</div>
      </div>
    </li>
  );
}

function LedgerCard() {
  const { data, error, isValidating, mutate } = useSWR("ledger-verify", verifyLedger, { revalidateOnFocus: false });

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Ledger integrity"
        description="Independent checks run against the whole ledger."
        action={
          <Button variant="secondary" size="sm" onClick={() => mutate()} loading={isValidating}>
            Re-run
          </Button>
        }
      />
      {error ? (
        <div className="px-5 pb-5">
          <ErrorBanner message={errorMessage(error, "Couldn't run the ledger checks.")} />
        </div>
      ) : !data ? (
        <div className="space-y-3 px-5 pb-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          <CheckRow
            ok={data.chain_valid}
            label="Hash chain intact"
            detail={
              data.chain_valid
                ? `${data.entries_checked.toLocaleString()} entries verified, none altered or reordered.`
                : `Chain breaks at entry #${data.broken_entry_id}.`
            }
          />
          <CheckRow
            ok={data.unbalanced_transactions === 0}
            label="Every transaction balances"
            detail={
              data.unbalanced_transactions === 0
                ? "All debits and credits sum to zero."
                : `${data.unbalanced_transactions} transaction(s) don't sum to zero.`
            }
          />
          <CheckRow
            ok={data.balance_mismatches === 0}
            label="Balances match the ledger"
            detail={
              data.balance_mismatches === 0
                ? "Every account balance equals the sum of its entries."
                : `${data.balance_mismatches} account(s) drifted from their entries.`
            }
          />
        </ul>
      )}
    </Card>
  );
}

function ProfileView() {
  useDocumentTitle("Profile");
  const { data: user, error, isLoading } = useSWR("me", getCurrentUser);
  const { data: accounts } = useAccounts();

  return (
    <div className="space-y-8">
      <PageHeader title="Profile" description="Your details and preferences." />

      {error && <ErrorBanner message={errorMessage(error, "Couldn't load your profile.")} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          {isLoading || !user ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Avatar name={user.full_name || user.username} size={64} />
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold">{user.full_name}</div>
                  <div className="text-sm text-ink-muted">@{user.username}</div>
                </div>
              </div>
              <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 border-t border-hairline pt-5 text-sm">
                <dt className="text-ink-muted">Email</dt>
                <dd className="truncate text-right">{user.email}</dd>
                <dt className="text-ink-muted">Member since</dt>
                <dd className="text-right">{formatDate(user.created_at)}</dd>
                <dt className="text-ink-muted">Accounts</dt>
                <dd className="text-right">{accounts ? accounts.filter((a) => a.status !== "closed").length : "—"}</dd>
              </dl>
            </>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-[15px] font-semibold">Appearance</h2>
          <p className="mt-0.5 text-[13px] text-ink-muted">Choose how Orbyt looks on this device.</p>
          <div className="mt-4">
            <ThemeSwitcher />
          </div>
        </Card>
      </div>

      <LedgerCard />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileView />
    </AppShell>
  );
}
