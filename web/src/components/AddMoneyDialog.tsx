"use client";

import { useState } from "react";
import { AmountInput } from "@/components/AmountInput";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Alert } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { Account, depositToAccount, errorMessage } from "@/lib/api";
import { useRefreshMoney } from "@/lib/hooks";
import { formatMoney, minorToInput, parseAmountToMinor } from "@/lib/money";

const PRESETS = [2_000, 5_000, 10_000, 50_000];

export function AddMoneyDialog({
  account,
  open,
  onClose,
}: {
  account: Account;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const refresh = useRefreshMoney();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const minor = parseAmountToMinor(amount, account.currency);

  function close() {
    setAmount("");
    setError(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!minor) return;
    setSubmitting(true);
    setError(null);
    try {
      await depositToAccount(account.id, minor);
      await refresh();
      toast.show({ tone: "good", title: `Added ${formatMoney(minor, account.currency)}` });
      close();
    } catch (err) {
      setError(errorMessage(err, "Couldn't add money. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Add money to ${account.currency}`}
      description="Sandbox top-up. Funds come from the Orbyt treasury account and are recorded in the ledger like any other transaction."
    >
      <form onSubmit={submit} className="space-y-4">
        <AmountInput value={amount} onChange={setAmount} currency={account.currency} autoFocus />
        <div className="flex flex-wrap justify-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(minorToInput(preset, account.currency))}
              className="rounded-full border border-border px-3 py-1 text-[13px] font-medium text-ink-secondary transition-colors hover:border-brand hover:text-brand"
            >
              {formatMoney(preset, account.currency)}
            </button>
          ))}
        </div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" disabled={!minor} loading={submitting}>
          {minor ? `Add ${formatMoney(minor, account.currency)}` : "Enter an amount"}
        </Button>
      </form>
    </Dialog>
  );
}
