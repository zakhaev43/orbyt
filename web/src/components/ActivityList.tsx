import { Avatar, IconAvatar } from "@/components/ui/Avatar";
import { activitySubtitle, activityTitle } from "@/lib/activity";
import type { StatementLine } from "@/lib/api";
import { dayKey, formatDayHeading, formatTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

type Line = StatementLine & { currency: string; accountLabel?: string };

function groupByDay(lines: Line[]) {
  const groups: { key: string; heading: string; items: Line[] }[] = [];
  for (const line of lines) {
    const key = dayKey(line.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(line);
    else groups.push({ key, heading: formatDayHeading(line.created_at), items: [line] });
  }
  return groups;
}

function LineAvatar({ line }: { line: Line }) {
  if (line.kind === "deposit" || line.counterparty_is_system) {
    return <IconAvatar icon="plus" tone="good" />;
  }
  if (line.counterparty_owner) return <Avatar name={line.counterparty_owner} />;
  return <IconAvatar icon={line.amount < 0 ? "arrow-up-right" : "arrow-down-left"} />;
}

export function ActivityList({
  lines,
  showBalance = false,
  grouped = true,
}: {
  lines: Line[];
  showBalance?: boolean;
  grouped?: boolean;
}) {
  const groups = grouped ? groupByDay(lines) : [{ key: "all", heading: "", items: lines }];

  return (
    <div>
      {groups.map((group) => (
        <section key={group.key} aria-label={group.heading || undefined}>
          {grouped && (
            <h3 className="px-5 pt-4 pb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
              {group.heading}
            </h3>
          )}
          <ul className="divide-y divide-hairline">
            {group.items.map((line) => {
              const incoming = line.amount > 0;
              return (
                <li
                  key={`${line.entry_id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60"
                >
                  <LineAvatar line={line} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium text-ink-primary">{activityTitle(line)}</div>
                    <div className="truncate text-[13px] text-ink-muted">
                      {activitySubtitle(line)} · {formatTime(line.created_at)}
                      {line.accountLabel && <> · {line.accountLabel}</>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`tabular-nums text-[15px] font-semibold ${incoming ? "text-good" : "text-ink-primary"}`}
                    >
                      {formatMoney(line.amount, line.currency, { signed: true })}
                    </div>
                    {showBalance && (
                      <div className="tabular-nums text-xs text-ink-muted">
                        {formatMoney(line.balance_after, line.currency)}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
