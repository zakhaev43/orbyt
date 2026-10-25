"use client";

import useSWR from "swr";
import AppShell from "@/components/AppShell";
import { LedgerCard } from "@/components/LedgerCard";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { ErrorBanner, Skeleton } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { errorMessage, getCurrentUser } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAccounts } from "@/lib/hooks";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

function ProfileView() {
  useDocumentTitle("Profile");
  const { data: user, error, isLoading } = useSWR("me", getCurrentUser);
  const { data: accounts } = useAccounts();

  return (
    <div className="space-y-8">
      <PageHeader title="Profile" description="Your details and preferences." />

      {error && <ErrorBanner message={errorMessage(error, "Couldn't load your profile.")} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          {isLoading || !user ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Avatar name={user.full_name || user.username} size={64} />
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold">{user.full_name}</div>
                  <div className="text-sm text-ink-muted">@{user.username}</div>
                </div>
              </div>
              <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 border-t border-hairline pt-5 text-sm">
                <dt className="text-ink-muted">Email</dt>
                <dd className="truncate text-right">{user.email}</dd>
                <dt className="text-ink-muted">Member since</dt>
                <dd className="text-right">{formatDate(user.created_at)}</dd>
                <dt className="text-ink-muted">Accounts</dt>
                <dd className="text-right">{accounts ? accounts.filter((a) => a.status !== "closed").length : "—"}</dd>
              </dl>
            </>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-[15px] font-semibold">Appearance</h2>
          <p className="mt-0.5 text-[13px] text-ink-muted">Choose how Orbyt looks on this device.</p>
          <div className="mt-4">
            <ThemeSwitcher />
          </div>
        </Card>
      </div>

      <LedgerCard />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileView />
    </AppShell>
  );
}
