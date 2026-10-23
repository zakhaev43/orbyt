"use client";

import { useSyncExternalStore } from "react";
import { Icon, IconName } from "@/components/ui/Icon";
import { ThemePreference, setTheme, subscribeTheme, themeSnapshot } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
];

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot, () => "system" as const);

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-xl bg-surface-2 p-1">
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={active}
            title={option.label}
            onClick={() => setTheme(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              active ? "bg-surface text-ink-primary shadow-soft" : "text-ink-muted hover:text-ink-primary"
            }`}
          >
            <Icon name={option.icon} size={15} />
            {!compact && option.label}
          </button>
        );
      })}
    </div>
  );
}
