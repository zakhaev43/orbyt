"use client";

import useSWR, { useSWRConfig } from "swr";
import { Account, listAccounts } from "./api";
import { loadActivity } from "./activity";

export function useAccounts() {
  return useSWR("accounts", listAccounts);
}

export function useActivity(accounts: Account[] | undefined, perAccount = 50) {
  const key = accounts ? ["activity", perAccount, accounts.map((a) => `${a.id}:${a.balance}`).join(",")] : null;
  return useSWR(key, () => loadActivity(accounts!, perAccount));
}

/**
 * Navigates with a full page load whenever the signed-in user changes, so no
 * cached data (profile, role, accounts) survives into the next session.
 */
export function navigateFresh(path: string) {
  window.location.assign(path);
}

/** Revalidates every cache that depends on balances after money moves. */
export function useRefreshMoney() {
  const { mutate } = useSWRConfig();
  return () =>
    mutate(
      (key) =>
        key === "accounts" ||
        (Array.isArray(key) && (key[0] === "activity" || key[0] === "statement" || key[0] === "account")),
    );
}
