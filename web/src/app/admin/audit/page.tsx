"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, ReactNode, Suspense, useState } from "react";
import useSWR from "swr";
import { Pager, SegmentedControl } from "@/components/admin/controls";
import AdminShell from "@/components/admin/AdminShell";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorBanner, ListSkeleton, Skeleton } from "@/components/ui/Feedback";
import { Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { AuditEvent, AuditOutcome, errorMessage, listAuditLogs, verifyAuditLog } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

const PAGE_SIZE = 50;

// Mirrors auditedRoutes in api/audit.go.
const ACTIONS: { value: string; label: string; group: string }[] = [
  { value: "auth.login", label: "Sign in", group: "Access" },
  { value: "auth.token_renew", label: "Session refresh", group: "Access" },
  { value: "user.register", label: "Register", group: "Access" },
  { value: "access.denied", label: "Access denied", group: "Access" },
  { value: "transfer.create", label: "Transfer", group: "Money" },
  { value: "account.deposit", label: "Top-up", group: "Money" },
  { value: "account.open", label: "Open account", group: "Accounts" },
  { value: "account.freeze", label: "Freeze account", group: "Accounts" },
  { value: "account.unfreeze", label: "Unfreeze account", group: "Accounts" },
  { value: "account.close", label: "Close account", group: "Accounts" },
  { value: "admin.stats.view", label: "View overview", group: "Admin" },
  { value: "admin.activity.view", label: "View activity", group: "Admin" },
  { value: "admin.transactions.view", label: "View transactions", group: "Admin" },
  { value: "admin.users.view", label: "View users", group: "Admin" },
  { value: "admin.accounts.view", label: "View accounts", group: "Admin" },
  { value: "admin.audit.view", label: "View audit log", group: "Admin" },
  { value: "admin.audit.verify", label: "Verify audit log", group: "Admin" },
];
const ACTION_LABELS = Object.fromEntries(ACTIONS.map((a) => [a.value, a.label]));
const ACTION_GROUPS = [...new Set(ACTIONS.map((a) => a.group))];

const WINDOWS = [
  { value: 24, label: "24 h" },
  { value: 24 * 7, label: "7 days" },
  { value: 24 * 30, label: "30 days" },
  { value: 0, label: "All time" },
];

function OutcomeBadge({ outcome }: { outcome: AuditOutcome }) {
  if (outcome === "denied") {
    return (
      <Badge tone="critical">
        <Icon name="ban" size={12} /> Denied
      </Badge>
    );
  }
  if (outcome === "failure") {
    return (
      <Badge tone="warn">
        <Icon name="alert" size={12} /> Failed
      </Badge>
    );
  }
  return (
    <Badge tone="good">
      <Icon name="check-circle" size={12} /> Success
    </Badge>
  );
}

function IntegrityBanner() {
  const { data, error, isValidating, mutate } = useSWR("audit-verify", verifyAuditLog, { revalidateOnFocus: false });

  let tone = "bg-surface-2 text-ink-secondary";
  let body = <Skeleton className="h-4 w-64" />;
  if (error) {
    tone = "bg-critical-soft text-critical";
    body = <span>{errorMessage(error, "Couldn't verify the audit log.")}</span>;
  } else if (data?.valid) {
    tone = "bg-good-soft text-good";
    body = (
      <span>
        <span className="font-semibold">Chain intact.</span> {data.entries_checked.toLocaleString()} events verified
        {data.head_hash && (
          <>
            {" "}· head #{data.head_id} <code className="font-mono text-xs">{data.head_hash.slice(0, 16)}…</code>
          </>
        )}
      </span>
    );
  } else if (data) {
    tone = "bg-critical-soft text-critical";
    body = (
      <span>
        <span className="font-semibold">Tampering detected.</span> The chain breaks at event #{data.broken_entry_id};
        it or an earlier event was altered, removed or forged.
      </span>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm ${tone}`}>
      <Icon name={data && !data.valid ? "alert" : "shield"} size={18} />
      <div className="min-w-0 flex-1">{body}</div>
      <Button variant="secondary" size="sm" onClick={() => mutate()} loading={isValidating}>
        Verify
      </Button>
    </div>
  );
}

function target(type: string, id: string): string {
  if (!type) return "";
  if (type === "account") return `Account #${id}`;
  if (type === "transaction") return `Transaction #${id}`;
  if (type === "user") return `@${id}`;
  return `${type} ${id.slice(0, 8)}`;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-all text-ink-primary">{children}</dd>
    </>
  );
}

function EventDetails({ e }: { e: AuditEvent }) {
  const details = Object.entries(e.details ?? {});
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 bg-surface-2/50 px-5 py-4 text-[13px]">
      <DetailRow label="When">{new Date(e.occurred_at).toISOString()}</DetailRow>
      <DetailRow label="Request">
        <span className="font-mono">
          {e.method} {e.path}
        </span>{" "}
        → {e.status_code}
      </DetailRow>
      {e.reason && <DetailRow label="Reason">{e.reason}</DetailRow>}
      {details.map(([k, v]) => (
        <DetailRow key={k} label={k.replaceAll("_", " ")}>
          <span className="font-mono">{typeof v === "string" ? v : JSON.stringify(v)}</span>
        </DetailRow>
      ))}
      <DetailRow label="Client">
        {e.client_ip || "unknown"} · {e.user_agent || "no user agent"}
      </DetailRow>
      <DetailRow label="Request ID">
        <span className="font-mono">{e.request_id}</span>
      </DetailRow>
      <DetailRow label="Seal">
        <span className="font-mono text-ink-muted">{e.hash}</span>
      </DetailRow>
    </dl>
  );
}

function AuditView() {
  useDocumentTitle("Admin · Audit log");
  const router = useRouter();
  const params = useSearchParams();

  const [actor, setActor] = useState(params.get("actor") ?? "");
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [windowHours, setWindowHours] = useState(24 * 7);
  const [targetFilter, setTargetFilter] = useState<{ type: string; id: string } | null>(null);
  // Keyset paging: one cursor per page visited, so Previous is exact even as new events arrive.
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [open, setOpen] = useState<number | null>(null);
  const actorQuery = useDebounced(actor.trim(), 300);
  const beforeId = cursors[cursors.length - 1];

  const { data, error, isLoading } = useSWR(
    ["admin-audit", actorQuery, action, outcome, windowHours, targetFilter?.type, targetFilter?.id, beforeId],
    () =>
      listAuditLogs({
        pageSize: PAGE_SIZE,
        beforeId,
        actor: actorQuery,
        action,
        outcome,
        sinceHours: windowHours || undefined,
        targetType: targetFilter?.type,
        targetId: targetFilter?.id,
      }),
  );

  function reset<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setCursors([undefined]);
      setOpen(null);
    };
  }

  function changePage(page: number) {
    setOpen(null);
    if (page > cursors.length && data?.next_before_id) {
      setCursors([...cursors, data.next_before_id]);
    } else if (page < cursors.length) {
      setCursors(cursors.slice(0, -1));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="Who did what, when, and from where. Events are append-only and sealed into a tamper-evident chain."
      />
      <IntegrityBanner />

      <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
        <Input
          icon="user"
          placeholder="Filter by username"
          value={actor}
          onChange={(e) => {
            reset(setActor)(e.target.value);
            if (params.get("actor")) router.replace("/admin/audit");
          }}
        />
        <Select aria-label="Action" value={action} onChange={(e) => reset(setAction)(e.target.value)}>
          <option value="">All actions</option>
          {ACTION_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {ACTIONS.filter((a) => a.group === group).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap gap-3">
        <SegmentedControl
          label="Outcome"
          value={outcome}
          onChange={reset(setOutcome)}
          options={[
            { value: "", label: "All" },
            { value: "success", label: "Success" },
            { value: "failure", label: "Failed" },
            { value: "denied", label: "Denied" },
          ]}
        />
        <SegmentedControl label="Time window" value={windowHours} onChange={reset(setWindowHours)} options={WINDOWS} />
      </div>

      {targetFilter && (
        <div className="flex items-center gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand">
          <Icon name="search" size={16} />
          <span>
            Showing events for <span className="font-semibold">{target(targetFilter.type, targetFilter.id)}</span>
          </span>
          <button
            type="button"
            onClick={() => reset(setTargetFilter)(null)}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium hover:bg-brand/10"
          >
            <Icon name="x" size={14} /> Clear
          </button>
        </div>
      )}

      {error && <ErrorBanner message={errorMessage(error, "Couldn't load the audit log.")} />}

      <Card className="overflow-hidden">
        {isLoading || !data ? (
          <ListSkeleton rows={10} />
        ) : data.items.length === 0 ? (
          <EmptyState icon="file-text" title="No events match" description="Try a wider time window or fewer filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="text-left text-xs text-ink-muted">
                  <tr className="border-b border-hairline">
                    <th className="px-5 py-2.5 font-medium">When</th>
                    <th className="px-3 py-2.5 font-medium">Actor</th>
                    <th className="px-3 py-2.5 font-medium">Action</th>
                    <th className="px-3 py-2.5 font-medium">Target</th>
                    <th className="px-3 py-2.5 font-medium">Outcome</th>
                    <th className="px-5 py-2.5 text-right font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {data.items.map((e) => {
                    const expanded = open === e.id;
                    return (
                      <Fragment key={e.id}>
                        <tr
                          onClick={() => setOpen(expanded ? null : e.id)}
                          aria-expanded={expanded}
                          className={`cursor-pointer transition-colors hover:bg-surface-2/60 ${expanded ? "bg-surface-2/60" : ""}`}
                        >
                          <td className="whitespace-nowrap px-5 py-2.5 text-ink-secondary">
                            <span className="inline-flex items-center gap-2">
                              <Icon
                                name="chevron-right"
                                size={14}
                                className={`text-ink-muted transition-transform ${expanded ? "rotate-90" : ""}`}
                              />
                              {formatDateTime(e.occurred_at)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {e.actor ? (
                              <button
                                type="button"
                                title={`Only show @${e.actor}`}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  reset(setActor)(e.actor);
                                }}
                                className="flex items-center gap-2 hover:text-brand"
                              >
                                <Avatar name={e.actor} size={24} />
                                <span className="truncate font-medium">@{e.actor}</span>
                              </button>
                            ) : (
                              <span className="text-ink-muted">Anonymous</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium">{ACTION_LABELS[e.action] ?? e.action}</div>
                            <div className="font-mono text-[11px] text-ink-muted">{e.action}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            {e.target_type ? (
                              <button
                                type="button"
                                title="Only show events for this target"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  reset(setTargetFilter)({ type: e.target_type, id: e.target_id });
                                }}
                                className="text-ink-secondary hover:text-brand"
                              >
                                {target(e.target_type, e.target_id)}
                              </button>
                            ) : (
                              <span className="text-ink-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <OutcomeBadge outcome={e.outcome} />
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-right font-mono text-xs text-ink-secondary">
                            {e.client_ip}
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={6} className="p-0">
                              <EventDetails e={e} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={cursors.length} hasNext={data.next_before_id !== null} onChange={changePage} />
          </>
        )}
      </Card>
    </div>
  );
}

export default function AdminAuditPage() {
  return (
    <AdminShell>
      <Suspense fallback={<ListSkeleton rows={10} />}>
        <AuditView />
      </Suspense>
    </AdminShell>
  );
}
