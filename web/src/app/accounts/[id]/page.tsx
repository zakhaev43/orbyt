"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { AccountCard, AccountCardSkeleton } from "@/components/AccountCard";
import { ActivityList } from "@/components/ActivityList";
import { AddMoneyDialog } from "@/components/AddMoneyDialog";
import AppShell from "@/components/AppShell";
import { StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Alert, EmptyState, ErrorBanner, ListSkeleton } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { Account, errorMessage, getAccount, getStatement, setAccountStatus } from "@/lib/api";
import { formatAccountNumber, formatDate } from "@/lib/format";
import { useRefreshMoney } from "@/lib/hooks";
import { CURRENCY_NAMES } from "@/lib/money";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

const PAGE_SIZE = 25;

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink-primary"
      aria-label="Copy account number"
    >
      <Icon name={copied ? "check" : "copy"} size={13} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

type PendingAction = "freeze" | "unfreeze" | "close" | null;

function AccountActions({ account, onChanged }: { account: Account; onChanged: (a: Account) => void }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topUp, setTopUp] = useState(false);

  const isActive = account.status === "active";
  const isFrozen = account.status === "frozen";

  async function run(action: Exclude<PendingAction, null>) {
    setBusy(true);
    setError(null);
    try {
      const updated = await setAccountStatus(account.id, action);
      onChanged(updated);
      toast.show({
        tone: "good",
        title:
          action === "freeze" ? "Account frozen" : action === "unfreeze" ? "Account unfrozen" : "Account closed",
      });
      setPending(null);
      if (action === "close") router.push("/accounts");
    } catch (err) {
      setError(errorMessage(err, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  const copy = {
    freeze: {
      title: "Freeze this account?",
      description: "No money can move in or out until you unfreeze it. You can unfreeze at any time.",
      confirm: "Freeze account",
    },
    unfreeze: {
      title: "Unfreeze this account?",
      description: "Transfers and top-ups will work again immediately.",
      confirm: "Unfreeze account",
    },
    close: {
      title: "Close this account?",
      description: "Closing is permanent. The account keeps its history but can never receive or send money again.",
      confirm: "Close account",
    },
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button icon="plus" onClick={() => setTopUp(true)} disabled={!isActive}>
          Add money
        </Button>
        <ButtonLink
          href={`/transfer?from=${account.id}`}
          variant="secondary"
          icon="send"
          className={!isActive || account.balance === 0 ? "pointer-events-none opacity-50" : ""}
          aria-disabled={!isActive || account.balance === 0}
        >
          Send
        </ButtonLink>
        {isFrozen ? (
          <Button variant="soft" icon="snowflake" onClick={() => setPending("unfreeze")}>
            Unfreeze
          </Button>
        ) : (
          <Button variant="secondary" icon="snowflake" onClick={() => setPending("freeze")} disabled={!isActive}>
            Freeze
          </Button>
        )}
        <Button variant="ghost" icon="ban" onClick={() => setPending("close")} disabled={!isActive}>
          Close
        </Button>
      </div>

      {pending && (
        <Dialog
          open
          onClose={() => {
            setPending(null);
            setError(null);
          }}
          title={copy[pending].title}
          description={copy[pending].description}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                variant={pending === "close" ? "danger" : "primary"}
                onClick={() => run(pending)}
                loading={busy}
                disabled={pending === "close" && account.balance !== 0}
              >
                {copy[pending].confirm}
              </Button>
            </>
          }
        >
          {pending === "close" && account.balance !== 0 && (
            <Alert tone="warn">Move the remaining balance to another account before closing.</Alert>
          )}
          {error && <Alert>{error}</Alert>}
        </Dialog>
      )}

      {topUp && <AddMoneyDialog account={account} open onClose={() => setTopUp(false)} />}
    </>
  );
}

function AccountDetailView() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const refresh = useRefreshMoney();

  const {
    data: account,
    error,
    isLoading,
    mutate,
  } = useSWR(Number.isSafeInteger(id) && id > 0 ? ["account", id] : null, () => getAccount(id));

  const statement = useSWRInfinite(
    (index, previous: unknown[] | null) => {
      if (!account) return null;
      if (previous && previous.length < PAGE_SIZE) return null;
      return ["statement", id, account.balance, index + 1];
    },
    (key) => getStatement(id, key[3] as number, PAGE_SIZE),
  );

  useDocumentTitle(account ? `${account.currency} account` : "Account");

  const lines = (statement.data ?? []).flat();
  const hasMore = (statement.data?.[statement.data.length - 1]?.length ?? 0) === PAGE_SIZE;

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Account" back={{ href: "/accounts", label: "Accounts" }} />
        <ErrorBanner message={errorMessage(error, "Couldn't load this account.")} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={
          account ? (
            <span className="flex flex-wrap items-center gap-3">
              {account.currency} account <StatusBadge status={account.status} />
            </span>
          ) : (
            "Account"
          )
        }
        description={account ? CURRENCY_NAMES[account.currency] : undefined}
        back={{ href: "/accounts", label: "Accounts" }}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          {isLoading || !account ? <AccountCardSkeleton /> : <AccountCard account={account} />}
          {account && (
            <AccountActions
              account={account}
              onChanged={async (updated) => {
                await mutate(updated, { revalidate: false });
                await refresh();
              }}
            />
          )}

          {account?.status === "frozen" && (
            <Alert tone="warn" title="This account is frozen">
              Incoming and outgoing payments are blocked until you unfreeze it.
            </Alert>
          )}

          {account && (
            <Card className="p-5">
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
                <dt className="text-ink-muted">Account number</dt>
                <dd className="flex items-center justify-end gap-2 font-mono">
                  {formatAccountNumber(account.id)} <CopyButton value={String(account.id)} />
                </dd>
                <dt className="text-ink-muted">Currency</dt>
                <dd className="text-right">{account.currency}</dd>
                <dt className="text-ink-muted">Opened</dt>
                <dd className="text-right">{formatDate(account.created_at)}</dd>
              </dl>
              <p className="mt-4 border-t border-hairline pt-4 text-[13px] text-ink-muted">
                Share your account number so others can send you {account.currency}.
              </p>
            </Card>
          )}
        </div>

        <Card className="overflow-hidden">
          <CardHeader title="Statement" description="Every ledger entry on this account, with the balance after each." />
          {statement.isLoading || !account ? (
            <ListSkeleton rows={5} />
          ) : lines.length === 0 ? (
            <EmptyState icon="activity" title="No transactions yet" description="Add money or receive a transfer to get started." />
          ) : (
            <>
              <ActivityList lines={lines.map((l) => ({ ...l, currency: account.currency }))} showBalance />
              {hasMore && (
                <div className="border-t border-hairline p-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={statement.isValidating}
                    onClick={() => statement.setSize(statement.size + 1)}
                  >
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function AccountDetailPage() {
  return (
    <AppShell>
      <AccountDetailView />
    </AppShell>
  );
}
