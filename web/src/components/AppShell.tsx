"use client";

import Link from "next/link";
import { ReactNode, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { ToastProvider } from "@/components/ui/Toast";
import { clearSession, subscribeAuth, usernameSnapshot } from "@/lib/auth";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/accounts", label: "Accounts", icon: "wallet" },
  { href: "/transfer", label: "Send", icon: "send" },
  { href: "/history", label: "Activity", icon: "activity" },
  { href: "/profile", label: "Profile", icon: "user" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Sidebar({ pathname, username, onLogout }: { pathname: string; username: string | null; onLogout: () => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-hairline bg-surface lg:flex">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-6 pt-6 pb-8">
        <Logo />
        <span className="text-lg font-semibold tracking-tight">Swift</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-brand-soft text-brand" : "text-ink-secondary hover:bg-surface-2 hover:text-ink-primary"
              }`}
            >
              <Icon name={item.icon} size={19} />
              {item.label}
            </Link>
          );
        })}

        <div className="mt-6 px-1">
          <ButtonLink href="/transfer" icon="send" className="w-full">
            Send money
          </ButtonLink>
        </div>
      </nav>

      <div className="space-y-3 border-t border-hairline p-4">
        <ThemeSwitcher compact />
        {username && (
          <div className="flex items-center gap-3 rounded-xl p-1">
            <Avatar name={username} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">@{username}</div>
              <Link href="/profile" className="text-xs text-ink-muted hover:text-ink-primary">
                View profile
              </Link>
            </div>
            <button
              onClick={onLogout}
              title="Log out"
              aria-label="Log out"
              className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink-primary"
            >
              <Icon name="log-out" size={17} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function MobileTopBar({ username, onLogout }: { username: string | null; onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-surface/85 px-4 py-3 backdrop-blur-lg lg:hidden">
      <Link href="/dashboard" className="flex items-center gap-2">
        <Logo />
        <span className="font-semibold tracking-tight">Swift</span>
      </Link>
      <div className="flex items-center gap-1">
        {username && (
          <Link href="/profile" aria-label="Profile">
            <Avatar name={username} size={32} />
          </Link>
        )}
        <button
          onClick={onLogout}
          aria-label="Log out"
          className="rounded-lg p-2 text-ink-muted hover:bg-surface-2 hover:text-ink-primary"
        >
          <Icon name="log-out" size={18} />
        </button>
      </div>
    </header>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-hairline bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
    >
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
              active ? "text-brand" : "text-ink-muted"
            }`}
          >
            <Icon name={item.icon} size={21} strokeWidth={active ? 2.2 : 1.9} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const username = useSyncExternalStore(subscribeAuth, usernameSnapshot, () => null);

  function logout() {
    clearSession();
    router.push("/login");
  }

  return (
    <AuthGuard>
      <ToastProvider>
        <Sidebar pathname={pathname} username={username} onLogout={logout} />
        <MobileTopBar username={username} onLogout={logout} />
        <main className="flex-1 pb-24 lg:pb-0 lg:pl-64">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10">{children}</div>
        </main>
        <MobileTabBar pathname={pathname} />
      </ToastProvider>
    </AuthGuard>
  );
}
