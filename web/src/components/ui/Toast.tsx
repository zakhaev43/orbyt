"use client";

import { ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

type ToastTone = "good" | "critical" | "info";
type Toast = { id: number; tone: ToastTone; title: string; description?: string };

type ToastApi = { show: (toast: Omit<Toast, "id">) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-2xl border border-hairline bg-surface px-4 py-3 shadow-pop"
          >
            <span
              className={`mt-0.5 ${t.tone === "good" ? "text-good" : t.tone === "critical" ? "text-critical" : "text-brand"}`}
            >
              <Icon name={t.tone === "good" ? "check-circle" : t.tone === "critical" ? "alert" : "info"} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink-primary">{t.title}</div>
              {t.description && <div className="mt-0.5 text-[13px] text-ink-secondary">{t.description}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 rounded-md p-1 text-ink-muted hover:text-ink-primary"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
