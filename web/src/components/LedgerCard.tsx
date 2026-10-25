"use client";

import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorBanner, Skeleton } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { errorMessage, verifyLedger } from "@/lib/api";

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

export function LedgerCard() {
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
