"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { subscribeAuth, isLoggedInSnapshot } from "@/lib/auth";

const noopSubscribe = () => () => {};

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const loggedIn = useSyncExternalStore(subscribeAuth, isLoggedInSnapshot, () => false);
  // The hydration render uses the server snapshot (logged out), so redirecting
  // before hydration finishes would bounce every deep link to /login.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    if (hydrated && !loggedIn) {
      router.replace("/login");
    }
  }, [hydrated, loggedIn, router]);

  if (!loggedIn) return null;
  return <>{children}</>;
}
