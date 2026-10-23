import Link from "next/link";
import { currencyGradient } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import type { Account } from "@/lib/api";
import { formatAccountNumber } from "@/lib/format";
import { CURRENCY_NAMES, currencySymbol, formatMoneyParts } from "@/lib/money";

export function AccountCard({ account, href }: { account: Account; href?: string }) {
  const { whole, fraction } = formatMoneyParts(account.balance, account.currency);
  const inactive = account.status !== "active";

  const body = (
    <div
      className={`relative isolate flex h-44 flex-col justify-between overflow-hidden rounded-2xl bg-linear-to-br p-5 text-white shadow-card transition-transform duration-200 ${currencyGradient(
        account.currency,
      )} ${href ? "group-hover:-translate-y-0.5 group-hover:shadow-pop" : ""} ${inactive ? "saturate-[0.35]" : ""}`}
    >
      <span
        className="pointer-events-none absolute -right-4 -bottom-10 -z-10 text-[150px] leading-none font-bold text-white/10 select-none"
        aria-hidden="true"
      >
        {currencySymbol(account.currency)}
      </span>
      <span className="pointer-events-none absolute -top-16 -left-10 -z-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />

      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-medium text-white/80">{CURRENCY_NAMES[account.currency] ?? account.currency}</div>
          <div className="mt-0.5 font-mono text-xs tracking-wider text-white/70">{formatAccountNumber(account.id)}</div>
        </div>
        {account.status === "frozen" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium backdrop-blur">
            <Icon name="snowflake" size={12} /> Frozen
          </span>
        )}
        {account.status === "closed" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-xs font-medium">
            <Icon name="ban" size={12} /> Closed
          </span>
        )}
      </div>

      <div>
        <div className="text-xs font-medium tracking-wide text-white/70 uppercase">Balance</div>
        <div className="tabular-nums mt-0.5 text-[28px] leading-tight font-semibold tracking-tight">
          {whole}
          <span className="text-lg text-white/75">{fraction}</span>
        </div>
      </div>
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} className="group block rounded-2xl" aria-label={`${account.currency} account ${account.id}`}>
      {body}
    </Link>
  );
}

export function AccountCardSkeleton() {
  return <div className="skeleton h-44 rounded-2xl" aria-hidden="true" />;
}
