"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Icon, IconName } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Field";
import { Logo } from "@/components/ui/Logo";
import { isLoggedInSnapshot, subscribeAuth } from "@/lib/auth";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "globe", title: "Four currencies, one app", body: "Hold USD, EUR, GBP and CAD side by side." },
  { icon: "zap", title: "Instant transfers", body: "Money lands the moment you hit send. No fees." },
  { icon: "shield", title: "Provably correct", body: "A double-entry, hash-chained ledger you can audit any time." },
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const router = useRouter();
  const loggedIn = useSyncExternalStore(subscribeAuth, isLoggedInSnapshot, () => false);

  useEffect(() => {
    if (loggedIn) router.replace("/dashboard");
  }, [loggedIn, router]);

  return (
    <div className="grid min-h-screen flex-1 lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative isolate hidden overflow-hidden bg-[#0b1020] p-12 text-white lg:flex lg:flex-col">
        <div
          className="absolute inset-0 -z-10 opacity-90"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 10%, rgba(47,107,255,0.55) 0%, transparent 70%), radial-gradient(50% 50% at 90% 80%, rgba(168,85,247,0.4) 0%, transparent 70%), radial-gradient(40% 40% at 70% 20%, rgba(16,185,129,0.3) 0%, transparent 70%)",
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 -z-10 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
          aria-hidden="true"
        />

        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">Swift</span>
        </div>

        <div className="my-auto max-w-md">
          <h2 className="text-4xl leading-[1.1] font-semibold tracking-tight">
            Money that moves at the speed of now.
          </h2>
          <p className="mt-4 text-lg text-white/70">
            Multi-currency accounts and instant transfers, built on a ledger that always adds up.
          </p>

          <ul className="mt-10 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                  <Icon name={f.icon} size={19} />
                </span>
                <div>
                  <div className="font-medium">{f.title}</div>
                  <div className="text-sm text-white/60">{f.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/40">Sandbox environment · No real money is moved.</p>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <div className="flex items-center gap-2 lg:invisible">
            <Logo />
            <span className="font-semibold tracking-tight">Swift</span>
          </div>
          <ThemeSwitcher compact />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
          <div className="w-full max-w-sm animate-rise">
            <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-[15px] text-ink-secondary">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function PasswordInput(props: Omit<React.ComponentProps<typeof Input>, "type" | "trailing" | "icon">) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      icon="lock"
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="rounded-lg p-2 text-ink-muted hover:text-ink-primary"
        >
          <Icon name={visible ? "eye-off" : "eye"} size={17} />
        </button>
      }
    />
  );
}
