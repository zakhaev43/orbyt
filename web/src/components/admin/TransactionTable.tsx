import { Badge } from "@/components/ui/Badge";
import type { AdminTransaction } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export function TransactionTable({ rows }: { rows: AdminTransaction[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-ink-muted">
          <tr className="border-b border-hairline">
            <th className="px-5 py-2.5 font-medium">ID</th>
            <th className="px-3 py-2.5 font-medium">When</th>
            <th className="px-3 py-2.5 font-medium">Type</th>
            <th className="px-3 py-2.5 font-medium">From → To</th>
            <th className="px-3 py-2.5 font-medium">Note</th>
            <th className="px-5 py-2.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((t) => (
            <tr key={t.id} className="transition-colors hover:bg-surface-2/60">
              <td className="tabular-nums px-5 py-2.5 font-mono text-xs text-ink-muted">#{t.id}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-ink-secondary">{formatDateTime(t.created_at)}</td>
              <td className="px-3 py-2.5">
                <Badge tone={t.kind === "deposit" ? "good" : "brand"}>{t.kind === "deposit" ? "Top-up" : "Transfer"}</Badge>
              </td>
              <td className="px-3 py-2.5">
                <span className="text-ink-primary">{t.from_kind === "system" ? "Treasury" : `@${t.from_owner}`}</span>
                <span className="px-1.5 text-ink-muted">→</span>
                <span className="text-ink-primary">@{t.to_owner}</span>
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-ink-muted">{t.description || "—"}</td>
              <td className="tabular-nums whitespace-nowrap px-5 py-2.5 text-right font-medium">
                {formatMoney(t.amount, t.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
