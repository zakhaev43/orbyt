"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import useSWR from "swr";
import AuthGuard from "@/components/AuthGuard";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Avatar } from "@/components/ui/Avatar";
import { Icon, IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { Spinner } from "@/components/ui/Spinner";
import { getCurrentUser } from "@/lib/api";
import { clearSession } from "@/lib/auth";
import { navigateFresh } from "@/lib/hooks";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Overview", icon: "home" },
  { href: "/admin/accounts", label: "Accounts", icon: "wallet" },
  { href: "/admin/transactions", label: "Transactions", icon: "activity" },
  { href: "/admin/users", label: "Users", icon: "user" },
  { href: "/admin/ledger", label: "Ledger", icon: "shield" },
  { href: "/admin/audit", label: "Audit", icon: "file-text" },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function logout() {
  clearSession();
  navigateFresh("/login");
}

function ConsoleBadge() {
  return (
    <span className="rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-violet-200 uppercase ring-1 ring-violet-400/30">
      Admin
    </span>
  );
}

// The sidebar is always dark so the operator console never looks like the customer app.
function Sidebar({ pathname, name, username }: { pathname: string; name: string; username: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-[#0b1020] text-white lg:flex">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "radial-gradient(80% 40% at 0% 0%, rgba(139,92,246,0.35) 0%, transparent 70%)" }}
        aria-hidden="true"
      />
      <Link href="/admin" className="relative flex items-center gap-2.5 px-6 pt-6 pb-1">
        <Logo />
        <span className="text-lg font-semibold tracking-tight">Orbyt</span>
        <ConsoleBadge />
      </Link>
      <p className="relative px-6 pb-7 text-xs text-white/50">Operations console</p>

      <nav className="relative flex flex-1 flex-col gap-1 px-3" aria-label="Admin">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-white/12 text-white" : "text-white/60 hover:bg-white/6 hover:text-white"
              }`}
            >
              <Icon name={item.icon} size={19} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="relative space-y-3 border-t border-white/10 p-4">
        <div className="[&_[role=radiogroup]]:bg-white/8">
          <ThemeSwitcher compact />
        </div>
        <div className="flex items-center gap-3 p-1">
          <Avatar name={name || username} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="truncate text-xs text-white/50">@{username} · view only</div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            aria-label="Log out"
            className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="log-out" size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function MobileTopBar({ name }: { name: string }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-[#0b1020] px-4 py-3 text-white lg:hidden">
      <Link href="/admin" className="flex items-center gap-2">
        <Logo />
        <span className="font-semibold tracking-tight">Orbyt</span>
        <ConsoleBadge />
      </Link>
      <div className="flex items-center gap-1">
        <Avatar name={name} size={30} />
        <button onClick={logout} aria-label="Log out" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
          <Icon name="log-out" size={18} />
        </button>
      </div>
    </header>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Admin"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 bg-[#0b1020] pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-white" : "text-white/50"}`}
          >
            <Icon name={item.icon} size={20} strokeWidth={active ? 2.2 : 1.9} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function FullScreenSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-32 text-ink-muted">
      <Spinner size={24} />
    </div>
  );
}

/** Layout for the operator console. Only admins get past it; customers are sent home. */
function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me } = useSWR("me", getCurrentUser);
  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (me && !isAdmin) router.replace("/dashboard");
  }, [me, isAdmin, router]);

  if (!me || !isAdmin) return <FullScreenSpinner />;

  return (
    <>
      <Sidebar pathname={pathname} name={me.full_name} username={me.username} />
      <MobileTopBar name={me.full_name || me.username} />
      <main className="flex-1 pb-24 lg:pb-0 lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">{children}</div>
      </main>
      <MobileTabBar pathname={pathname} />
    </>
  );
}

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AdminLayout>{children}</AdminLayout>
    </AuthGuard>
  );
}
