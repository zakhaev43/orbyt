import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  saveAccessToken,
} from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

// One refresh at a time: concurrent 401s all wait on the same renewal.
function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_URL}/tokens/renew_access`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { access_token: string };
        saveAccessToken(body.access_token);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const accessToken = getAccessToken();

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  if (res.status === 401 && accessToken && !retried) {
    if (await refreshAccessToken()) {
      return request<T>(path, options, true);
    }
    clearSession();
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.error ?? `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }

  return body as T;
}

export type User = {
  username: string;
  full_name: string;
  email: string;
  created_at: string;
};

export type AccountStatus = "active" | "frozen" | "closed";

export type Account = {
  id: number;
  owner: string;
  balance: number;
  currency: string;
  status: AccountStatus;
  kind: "customer" | "system";
  created_at: string;
};

export type Transaction = {
  id: number;
  kind: "transfer" | "deposit";
  status: string;
  currency: string;
  amount: number;
  description: string;
  created_at: string;
};

export type TransferRecord = {
  id: number;
  transaction_id: number | null;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  created_at: string;
};

export type TransferResult = {
  transaction: Transaction;
  transfer: TransferRecord;
  from_account: Account;
};

export type DepositResult = {
  transaction: Transaction;
  account: Account;
};

export type StatementLine = {
  entry_id: number;
  transaction_id: number | null;
  kind: "transfer" | "deposit";
  description: string;
  amount: number;
  balance_after: number;
  counterparty_account_id?: number;
  counterparty_owner?: string;
  counterparty_is_system: boolean;
  created_at: string;
};

export type Payee = {
  account_id: number;
  currency: string;
  holder_name: string;
  username: string;
  can_receive: boolean;
};

export type LoginResponse = {
  session_id: string;
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
  user: User;
};

export type LedgerVerification = {
  valid: boolean;
  chain_valid: boolean;
  broken_entry_id?: number;
  balance_mismatches: number;
  unbalanced_transactions: number;
  entries_checked: number;
};

export function registerUser(input: {
  username: string;
  password: string;
  full_name: string;
  email: string;
}) {
  return request<User>("/users", { method: "POST", body: JSON.stringify(input) });
}

export function loginUser(input: { username: string; password: string }) {
  return request<LoginResponse>("/users/login", { method: "POST", body: JSON.stringify(input) });
}

export function getCurrentUser() {
  return request<User>("/users/me");
}

export function listAccounts() {
  return request<Account[]>("/accounts?page_id=1&page_size=10");
}

export function getAccount(id: number) {
  return request<Account>(`/accounts/${id}`);
}

export function createAccount(currency: string) {
  return request<Account>("/accounts", { method: "POST", body: JSON.stringify({ currency }) });
}

export function depositToAccount(id: number, amount: number, description?: string) {
  return request<DepositResult>(`/accounts/${id}/deposits`, {
    method: "POST",
    body: JSON.stringify({ amount, description }),
  });
}

export function setAccountStatus(id: number, action: "freeze" | "unfreeze" | "close") {
  return request<Account>(`/accounts/${id}/${action}`, { method: "POST" });
}

export function getStatement(id: number, pageId = 1, pageSize = 50) {
  return request<StatementLine[]>(
    `/accounts/${id}/statement?page_id=${pageId}&page_size=${pageSize}`,
  );
}

export function lookupPayee(accountId: number) {
  return request<Payee>(`/payees/${accountId}`);
}

export function createTransfer(input: {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  currency: string;
  description?: string;
}) {
  return request<TransferResult>("/transfers", { method: "POST", body: JSON.stringify(input) });
}

export function verifyLedger() {
  return request<LedgerVerification>("/ledger/verify");
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}
