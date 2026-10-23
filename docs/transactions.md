# How a Transaction Happens

This document describes what actually happens, end to end, when money moves
between two accounts in Orbyt, and how the ledger protects itself
against tampering after the fact.

## 1. Data model

Three tables are involved (see `db/migration/`):

- **`accounts`** — one row per (owner, currency) pair. Holds the current
  `balance`. Unique constraint on `(owner, currency)` — a user can only have
  one account per currency.
- **`transfers`** — one row per transfer request: `from_account_id`,
  `to_account_id`, `amount`, `created_at`. This is a record of *intent*
  ("$10 moved from account 2 to account 3"), not the ledger itself.
- **`entries`** — the actual double-entry ledger. Every transfer produces
  **two** entry rows: a negative entry on the sender's account and a
  positive entry on the receiver's account. `entries.amount` can be negative
  or positive; `transfers.amount` is always positive. Since 000005, each
  entry also carries `prev_hash` and `hash` (see [Tamper protection](#4-tamper-protection)).

`accounts.balance` is a derived/cached value — it should always equal the
sum of that account's `entries.amount`. The entries table is the source of
truth; the balance column exists so reads don't have to `SUM()` the ledger
every time.

## 2. Request flow

```
Client                  Gin router              api.Server                 db.Store
  |  POST /transfers        |                        |                          |
  |------------------------>|                         |                          |
  |                    corsMiddleware                 |                          |
  |                    authMiddleware (verify token)   |                          |
  |                         |----createTransfer------>|                          |
  |                         |                        bind + validate JSON body    |
  |                         |                        validAccount(from, currency) |
  |                         |                        check from.owner == caller   |
  |                         |                        validAccount(to, currency)   |
  |                         |                        -----TransferTx(params)----->|
  |                         |                        <----TransferTxResult--------|
  |<------------------200---|<-----------------------|                          |
```

Concretely, `POST /transfers` (`api/transfer.go`):

1. **Auth** — `authMiddleware` (`api/middleware.go`) requires a valid PASETO
   access token in the `Authorization: Bearer <token>` header. The token's
   `username` is attached to the request context as `authorization_payload`.
2. **Bind & validate** — the JSON body is decoded into `transferRequest`
   (`from_account_id`, `to_account_id`, `amount`, `currency`). Gin's
   validator rejects the request (`400`) if any field is missing, `amount`
   isn't `> 0`, or `currency` fails the custom `currency` validator
   (`api/validator.go`, USD/EUR/CAD only).
3. **Validate the source account** — `validAccount` loads the `from`
   account and checks its currency matches the request. Any failure here
   (account not found, currency mismatch) short-circuits with the
   appropriate HTTP status.
4. **Ownership check** — the `from` account's `owner` must equal the
   authenticated username, or the request is rejected with `401`. This is
   what stops user A from moving money out of user B's account.
5. **Validate the destination account** — same currency check as step 3,
   but no ownership check (anyone can receive money into their own account).
6. **`TransferTx`** — the actual movement of money happens here (next
   section). Its result (the new `transfer` row, both `accounts`, and both
   `entries`) is returned as the `200` response body.

## 3. `TransferTx`: how money actually moves

`TransferTx` (`db/sqlc/store.go`) wraps everything in a single SQL
transaction at **`SERIALIZABLE`** isolation — Postgres's strictest level,
which behaves as if transactions ran one at a time even though they run
concurrently. Inside that transaction:

1. **`CreateTransfer`** — insert the `transfers` row recording the intent.
2. **`GetLastEntryHash`** — read the hash of the most recent entry in the
   *entire* ledger (across all accounts), to extend the tamper-evident chain.
3. **Debit the sender** — `CreateEntry` inserts an entry of `-amount` on
   `from_account_id`. Its hash is then computed and written with
   `SetEntryHash` (see below).
4. **Credit the receiver** — `CreateEntry` inserts an entry of `+amount` on
   `to_account_id`, chained from the debit entry's hash the same way.
5. **Update both balances** — `AddAccountBalance` does
   `balance = balance + $amount` on each account (not a read-modify-write in
   application code — the arithmetic happens in the `UPDATE` statement
   itself, so it's atomic at the row level).
   - The two `AddAccountBalance` calls are always issued in a fixed order —
     **lower account ID first** — regardless of which account is the sender.
     This is deliberate: if two transfers happen concurrently between the
     same pair of accounts in opposite directions, both transactions would
     otherwise lock the two rows in opposite order and deadlock. Locking in
     a consistent order prevents that.
6. **Commit.** If any step fails, the whole transaction rolls back — a
   transfer either fully happens or leaves no trace.

### Concurrency and retries

Two transfers touching overlapping accounts at the same time can cause
Postgres to detect a serialization conflict and abort one of them with
error code `40001`. `execTx` catches exactly that error and **retries the
entire transaction from scratch**, up to 10 times, before giving up. This is
why the balance-update arithmetic lives in SQL (`balance = balance +
$amount`) rather than "read balance in Go, add, write back" — the retry
loop re-runs the whole callback, so every read inside it needs to be
re-executed anyway, and doing the addition in SQL avoids a whole class of
lost-update bugs.

## 4. Tamper protection

The ledger (`entries`) is hash-chained: every entry's `hash` is a SHA-256
digest that covers the entry's own data **and** the hash of the entry
immediately before it in insertion order (globally, across all accounts —
not per account). This is the same idea blockchains use for tamper-evidence,
without any of the distributed-consensus machinery a real blockchain needs
— there's a single trusted writer (this application), so a hash chain alone
is enough to make silent edits detectable. A full blockchain solves trust
*between* mutually distrusting parties (e.g. several banks with no shared
authority); that doesn't apply to one bank's own internal ledger, so the
added complexity of consensus and distributed nodes wouldn't buy anything
here.

**How the hash is computed** (`util.ChainHash`, `util/hashchain.go`):

```
hash = SHA256(prev_hash + "|" + entry_id + "|" + account_id + "|" + amount + "|" + created_at_unixnano)
```

- `prev_hash` is the previous ledger entry's `hash` (empty string
  `util.GenesisHash` for the very first entry ever inserted).
- `entry_id`, `account_id`, `amount`, `created_at` are the entry's own,
  DB-assigned values — the hash is computed *after* the row is inserted (so
  it binds to the real, database-assigned `id` and `created_at`, not a
  value the application merely claims), then written back with a
  `SetEntryHash` update in the same transaction, before commit.

**What this catches:** if anyone — a rogue operator, a compromised
credential, a bug that runs a raw `UPDATE entries SET amount = ...` —
modifies, deletes, or reorders any row in the `entries` table after the
fact, that row's stored `hash` no longer matches what `ChainHash` recomputes
from its (now-different) data, **and** every entry inserted after it has a
`prev_hash` that no longer matches the tampered row's original hash. One
tampered row invalidates itself and everything chained after it.

**Verifying the chain:** `GET /ledger/verify` (auth required) walks every
entry in `id` order (`VerifyEntryChain`, `db/sqlc/store.go`), recomputes
each hash from scratch, and returns:

```json
{ "valid": true }
```
or, if entry `17` (or anything at/after it) was tampered with:
```json
{ "valid": false, "broken_entry_id": 17 }
```

This was tested directly: running `UPDATE entries SET amount = -9999 WHERE
id = 1` straight against Postgres (bypassing the API entirely) and then
calling `/ledger/verify` correctly returned `{"valid":false,
"broken_entry_id":1}`.

### Known gap

The hash chain makes tampering **detectable**, but right now it doesn't
make tampering **impossible** — the app currently connects to Postgres as
`root`, which owns the `entries` table and can `UPDATE`/`DELETE` it freely
(table ownership bypasses `GRANT`/`REVOKE`). Closing this requires the app
to connect as a separate, non-superuser role with `UPDATE` and `DELETE`
explicitly revoked on `entries`, so the only way to write to the ledger at
all is through `INSERT` via the application's own transaction logic. That
role separation hasn't been done yet.
