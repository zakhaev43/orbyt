"use client";

import { useState } from "react";
import { CurrencyBadge } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Alert } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { Account, createAccount, errorMessage } from "@/lib/api";
import { CURRENCIES, CURRENCY_NAMES } from "@/lib/money";

export function OpenAccountDialog({
  open,
  onClose,
  existing,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  existing: Account[];
  onCreated: (account: Account) => void;
}) {
  const toast = useToast();
  const held = new Set(existing.map((a) => a.currency));
  const available = CURRENCIES.filter((c) => !held.has(c));
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currency = selected && available.includes(selected as (typeof CURRENCIES)[number]) ? selected : available[0];

  function close() {
    setSelected(null);
    setError(null);
    onClose();
  }

  async function submit() {
    if (!currency) return;
    setSubmitting(true);
    setError(null);
    try {
      const account = await createAccount(currency);
      toast.show({ tone: "good", title: `${currency} account opened` });
      onCreated(account);
      close();
    } catch (err) {
      setError(errorMessage(err, "Couldn't open the account."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Open a new account"
      description="Hold one account per currency. It's free and ready instantly."
      footer={
        available.length > 0 && (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitting}>
              Open {currency} account
            </Button>
          </>
        )
      }
    >
      {available.length === 0 ? (
        <Alert tone="info">You already hold an account in every supported currency.</Alert>
      ) : (
        <div role="radiogroup" aria-label="Currency" className="grid gap-2">
          {available.map((c) => {
            const active = c === currency;
            return (
              <button
                key={c}
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(c)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  active ? "border-brand bg-brand-soft" : "border-border hover:bg-surface-2"
                }`}
              >
                <CurrencyBadge currency={c} size={36} />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{c}</div>
                  <div className="text-[13px] text-ink-muted">{CURRENCY_NAMES[c]}</div>
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
      )}
      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
    </Dialog>
  );
}
