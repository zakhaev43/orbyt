"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { AmountInput } from "@/components/AmountInput";
import AppShell from "@/components/AppShell";
import { Avatar, CurrencyBadge } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { FieldHint, Input, Label } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Account, ApiError, Payee, TransferResult, createTransfer, errorMessage, lookupPayee } from "@/lib/api";
import { formatAccountNumber, formatDateTime } from "@/lib/format";
import { useAccounts, useRefreshMoney } from "@/lib/hooks";
import { formatMoney, minorToInput, parseAmountToMinor } from "@/lib/money";
import { useDebounced } from "@/lib/useDebounced";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

type Step = "details" | "review" | "done";

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "details", label: "Details" },
    { id: "review", label: "Review" },
    { id: "done", label: "Sent" },
  ];
  const current = step === "done" ? steps.length : steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            aria-current={i === current ? "step" : undefined}
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              i < current ? "bg-brand text-brand-ink" : i === current ? "bg-brand-soft text-brand ring-2 ring-brand" : "bg-surface-2 text-ink-muted"
            }`}
          >
            {i < current ? <Icon name="check" size={13} strokeWidth={3} /> : i + 1}
          </span>
          <span className={`text-[13px] font-medium ${i === current ? "text-ink-primary" : "text-ink-muted"}`}>{s.label}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-border sm:w-10" />}
        </li>
      ))}
    </ol>
  );
}

function AccountPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: number | undefined;
  onChange: (id: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label="From account" className="grid gap-2 sm:grid-cols-2">
      {accounts.map((account) => {
        const active = account.id === value;
        return (
          <button
            key={account.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(account.id)}
            className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
              active ? "border-brand bg-brand-soft" : "border-border hover:bg-surface-2"
            }`}
          >
            <CurrencyBadge currency={account.currency} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{account.currency}</div>
              <div className="tabular-nums truncate text-[13px] text-ink-muted">
                {formatMoney(account.balance, account.currency)} available
              </div>
            </div>
            {active && (
              <span className="text-brand">
                <Icon name="check-circle" size={20} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PayeeCard({ payee, note }: { payee: Payee; note?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2/60 p-3 animate-fade-in">
      <Avatar name={payee.holder_name || payee.username} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          {payee.holder_name}
          <span className="text-good" title="Recipient verified">
            <Icon name="check-circle" size={15} />
          </span>
        </div>
        <div className="truncate text-[13px] text-ink-muted">
          @{payee.username} · {payee.currency} · {formatAccountNumber(payee.account_id)}
          {note && <> · {note}</>}
        </div>
      </div>
    </div>
  );
}

function SuccessView({ result, payee, onReset }: { result: TransferResult; payee: Payee; onReset: () => void }) {
  const { transaction } = result;
  return (
    <Card className="mx-auto max-w-lg p-8 text-center animate-rise">
      <div className="mx-auto flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-good-soft text-good">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path className="check-draw" d="M5 12.5 10 17.5 19 7" />
        </svg>
      </div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight">
        {formatMoney(transaction.amount, transaction.currency)} sent
      </h2>
      <p className="mt-1 text-ink-secondary">
        to {payee.holder_name} (@{payee.username})
      </p>

      <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 rounded-xl bg-surface-2/60 p-4 text-left text-sm">
        <dt className="text-ink-muted">Transaction</dt>
        <dd className="text-right font-mono">#{transaction.id}</dd>
        <dt className="text-ink-muted">Date</dt>
        <dd className="text-right">{formatDateTime(transaction.created_at)}</dd>
        {transaction.description && (
          <>
            <dt className="text-ink-muted">Note</dt>
            <dd className="truncate text-right">{transaction.description}</dd>
          </>
        )}
        <dt className="text-ink-muted">New balance</dt>
        <dd className="tabular-nums text-right font-medium">
          {formatMoney(result.from_account.balance, result.from_account.currency)}
        </dd>
      </dl>

      <div className="mt-8 grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={onReset} icon="send">
          Send another
        </Button>
        <ButtonLink href={`/accounts/${result.from_account.id}`} trailingIcon="arrow-right">
          View account
        </ButtonLink>
      </div>
    </Card>
  );
}

function TransferView() {
  useDocumentTitle("Send money");
  const searchParams = useSearchParams();
  const refresh = useRefreshMoney();
  const { data: accounts, isLoading } = useAccounts();

  const [step, setStep] = useState<Step>("details");
  const [fromOverride, setFromOverride] = useState<number | undefined>(() => {
    const from = Number(searchParams.get("from"));
    return Number.isSafeInteger(from) && from > 0 ? from : undefined;
  });
  const [recipientInput, setRecipientInput] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TransferResult | null>(null);
  const [touchedAmount, setTouchedAmount] = useState(false);

  const sendable = (accounts ?? []).filter((a) => a.status === "active");
  const from = sendable.find((a) => a.id === fromOverride) ?? sendable[0];

  const recipientId = Number(recipientInput.replace(/\s/g, ""));
  const recipientValid = Number.isSafeInteger(recipientId) && recipientId > 0;
  const debouncedRecipient = useDebounced(recipientValid ? recipientId : null, 350);
  const payeeQuery = useSWR(
    debouncedRecipient ? ["payee", debouncedRecipient] : null,
    () => lookupPayee(debouncedRecipient!),
    { shouldRetryOnError: false, revalidateOnFocus: false },
  );
  const payee = payeeQuery.data && payeeQuery.data.account_id === recipientId ? payeeQuery.data : undefined;
  const lookingUp = recipientValid && (debouncedRecipient !== recipientId || payeeQuery.isLoading);

  const minor = from ? parseAmountToMinor(amount, from.currency) : null;
  const ownAccount = accounts?.some((a) => a.id === recipientId);

  let recipientProblem: string | null = null;
  if (recipientInput && !recipientValid) recipientProblem = "Account numbers contain digits only.";
  else if (from && recipientId === from.id) recipientProblem = "You can't send money to the same account.";
  else if (payeeQuery.error && debouncedRecipient === recipientId) {
    recipientProblem =
      payeeQuery.error instanceof ApiError && payeeQuery.error.status === 404
        ? "No Swift account with that number."
        : errorMessage(payeeQuery.error, "Couldn't check that account.");
  } else if (payee && !payee.can_receive) recipientProblem = "This account can't receive money right now.";
  else if (payee && from && payee.currency !== from.currency)
    recipientProblem = `This is a ${payee.currency} account. Send from a ${payee.currency} account instead.`;

  let amountProblem: string | null = null;
  if (from && amount && !minor) amountProblem = "Enter a valid amount.";
  else if (from && minor && minor > from.balance) amountProblem = `You only have ${formatMoney(from.balance, from.currency)} available.`;

  const ready = Boolean(from && payee && !recipientProblem && minor && !amountProblem);

  function reset() {
    setStep("details");
    setRecipientInput("");
    setAmount("");
    setNote("");
    setResult(null);
    setSubmitError(null);
    setTouchedAmount(false);
  }

  async function send() {
    if (!from || !minor || !payee) return;
    setSending(true);
    setSubmitError(null);
    try {
      const res = await createTransfer({
        from_account_id: from.id,
        to_account_id: payee.account_id,
        amount: minor,
        currency: from.currency,
        description: note.trim() || undefined,
      });
      setResult(res);
      setStep("done");
      refresh();
    } catch (err) {
      setSubmitError(errorMessage(err, "The transfer didn't go through. No money was moved."));
    } finally {
      setSending(false);
    }
  }

  if (step === "done" && result && payee) {
    return (
      <div className="space-y-8">
        <div className="flex justify-center">
          <Stepper step="done" />
        </div>
        <SuccessView result={result} payee={payee} onReset={reset} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Send money" description="Instant transfers to any Swift account in the same currency." />

      <div className="mx-auto max-w-xl space-y-6">
        <Stepper step={step} />

        {isLoading ? (
          <Card className="space-y-4 p-6">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-28 w-full" />
          </Card>
        ) : !from ? (
          <Card>
            <EmptyState
              icon="wallet"
              title="No account to send from"
              description="You need an active account with money in it before you can send a transfer."
              action={<ButtonLink href="/accounts">Go to accounts</ButtonLink>}
            />
          </Card>
        ) : step === "details" ? (
          <Card className="p-6 animate-rise">
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                setTouchedAmount(true);
                if (ready) setStep("review");
              }}
            >
              <div>
                <Label>From</Label>
                <AccountPicker
                  accounts={sendable}
                  value={from.id}
                  onChange={(id) => {
                    setFromOverride(id);
                    setAmount("");
                  }}
                />
              </div>

              <div>
                <Label htmlFor="recipient">Recipient account number</Label>
                <Input
                  id="recipient"
                  icon="search"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 0000 0042"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  invalid={Boolean(recipientProblem)}
                  trailing={lookingUp ? <span className="px-2.5 text-ink-muted"><Spinner /></span> : undefined}
                />
                <div className="mt-2 min-h-5">
                  {recipientProblem ? (
                    <FieldHint tone="critical">{recipientProblem}</FieldHint>
                  ) : payee ? (
                    <PayeeCard payee={payee} note={ownAccount ? "Your account" : undefined} />
                  ) : (
                    !recipientInput && <FieldHint>They can find it on their account page in Swift.</FieldHint>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <Label htmlFor="amount">Amount</Label>
                  <span className="tabular-nums text-[13px] text-ink-muted">
                    Available {formatMoney(from.balance, from.currency)}
                  </span>
                </div>
                <AmountInput
                  id="amount"
                  value={amount}
                  onChange={(v) => {
                    setAmount(v);
                    setTouchedAmount(true);
                  }}
                  currency={from.currency}
                  invalid={touchedAmount && Boolean(amountProblem)}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-1.5">
                    {[0.25, 0.5, 1].map((fraction) => (
                      <button
                        key={fraction}
                        type="button"
                        disabled={from.balance === 0}
                        onClick={() => {
                          setAmount(minorToInput(Math.floor(from.balance * fraction), from.currency));
                          setTouchedAmount(true);
                        }}
                        className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
                      >
                        {fraction === 1 ? "Max" : `${fraction * 100}%`}
                      </button>
                    ))}
                  </div>
                  {touchedAmount && amountProblem && <FieldHint tone="critical">{amountProblem}</FieldHint>}
                </div>
              </div>

              <div>
                <Label htmlFor="note">Note (optional)</Label>
                <Input
                  id="note"
                  maxLength={140}
                  placeholder="What's it for?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={!ready} trailingIcon="arrow-right">
                Review transfer
              </Button>
            </form>
          </Card>
        ) : (
          payee &&
          minor && (
            <Card className="overflow-hidden animate-rise">
              <div className="border-b border-hairline bg-surface-2/50 px-6 py-8 text-center">
                <div className="text-[13px] font-medium text-ink-muted">You&apos;re sending</div>
                <div className="tabular-nums mt-1 text-4xl font-semibold tracking-tight">
                  {formatMoney(minor, from.currency)}
                </div>
              </div>
              <div className="space-y-5 p-6">
                <PayeeCard payee={payee} note={ownAccount ? "Your account" : undefined} />
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
                  <dt className="text-ink-muted">From</dt>
                  <dd className="text-right">
                    {from.currency} · {formatAccountNumber(from.id)}
                  </dd>
                  {note.trim() && (
                    <>
                      <dt className="text-ink-muted">Note</dt>
                      <dd className="truncate text-right">{note.trim()}</dd>
                    </>
                  )}
                  <dt className="text-ink-muted">Fee</dt>
                  <dd className="text-right text-good">Free</dd>
                  <dt className="text-ink-muted">Arrives</dt>
                  <dd className="text-right">Instantly</dd>
                  <dt className="text-ink-muted">Balance after</dt>
                  <dd className="tabular-nums text-right font-medium">
                    {formatMoney(from.balance - minor, from.currency)}
                  </dd>
                </dl>

                {submitError && <Alert>{submitError}</Alert>}

                <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                  <Button variant="secondary" size="lg" icon="arrow-left" onClick={() => setStep("details")} disabled={sending}>
                    Edit
                  </Button>
                  <Button size="lg" onClick={send} loading={sending} icon="send">
                    Send {formatMoney(minor, from.currency)}
                  </Button>
                </div>
                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
                  <Icon name="lock" size={12} /> Recorded as a balanced, hash-chained ledger transaction.
                </p>
              </div>
            </Card>
          )
        )}
      </div>
    </div>
  );
}

export default function TransferPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <TransferView />
      </Suspense>
    </AppShell>
  );
}
