import { Account, StatementLine, getStatement } from "./api";

export type ActivityItem = StatementLine & { account: Account };

export type ActivityGroup = { key: string; heading: string; items: ActivityItem[] };

/** Merges the statements of several accounts into one newest-first feed. */
export async function loadActivity(accounts: Account[], perAccount = 50): Promise<ActivityItem[]> {
  const statements = await Promise.all(
    accounts.map(async (account) =>
      (await getStatement(account.id, 1, perAccount)).map((line) => ({ ...line, account })),
    ),
  );
  return statements.flat().sort((a, b) => b.created_at.localeCompare(a.created_at) || b.entry_id - a.entry_id);
}

export function activityTitle(item: StatementLine): string {
  if (item.kind === "deposit" || item.counterparty_is_system) {
    return item.description || "Top-up";
  }
  const who = item.counterparty_owner ? `@${item.counterparty_owner}` : `account #${item.counterparty_account_id}`;
  return item.amount < 0 ? `To ${who}` : `From ${who}`;
}

export function activitySubtitle(item: StatementLine): string {
  if (item.kind === "deposit" || item.counterparty_is_system) return "Added money";
  if (item.description) return item.description;
  return item.amount < 0 ? "Sent" : "Received";
}
