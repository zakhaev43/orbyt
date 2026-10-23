# Roadmap

Open items for Orbyt, ordered by what to do next. Each item notes
why it matters and roughly how big it is. Re-order freely — this is a
working list, not a commitment.

## Now — security gaps that are actively exploitable today

1. **Ownership checks on `updateAccount`/`deleteAccount`** (`api/account.go`).
   Any authenticated user can currently update any account's balance
   directly (bypassing the ledger entirely) or delete any account by
   guessing an ID. Same fix pattern already used elsewhere (`getAccount`,
   `createTransfer`): load the account, compare `.Owner` to the token's
   username, 401 on mismatch. Small.
2. **Login rate-limiting / lockout.** Nothing currently stops brute-forcing
   `POST /users/login`. Needs a per-username (and/or per-IP) failed-attempt
   counter with backoff — could live in Postgres (a `failed_login_attempts`
   column + `locked_until`) or Redis if one gets added later. Small–medium.
3. **Secrets out of the repo.** `app.env` has a real `TOKEN_SYMMETRIC_KEY`
   and DB credentials committed. Fine for local dev, not fine if this repo
   is ever made public or the key is reused anywhere real. Move to
   `.env.local`-style overrides or a secrets manager before that happens.
   Small.
4. **Idempotency keys on `POST /transfers`.** A retried request today
   (client timeout + retry, double-tap on a slow connection) creates a
   second, real transfer — `TransferTx` has no dedup. Add a client-supplied
   `idempotency_key` on `transferRequest`, a unique constraint on
   `transfers.idempotency_key`, and return the original result on a repeat.
   Medium.

## Next — closes gaps already flagged in `docs/transactions.md`

5. **Least-privilege DB role for the app.** The API connects as `root`,
   which owns every table and bypasses `GRANT`/`REVOKE`. Add a non-superuser
   role, `REVOKE UPDATE, DELETE ON entries FROM app_role`, and switch
   `DB_SOURCE` to connect as it. This is what actually makes the hash chain
   tamper-*proof* instead of just tamper-*evident*. Medium (migration +
   compose/env changes + re-verifying nothing else needed those grants).
6. **Test coverage for what shipped un-tested.** The hash chain
   (`VerifyEntryChain`, chained `CreateEntry`/`SetEntryHash`), and the new
   `GET /users/me` / `GET /transfers` / `GET /ledger/verify` handlers have
   no automated tests — everything was verified manually against a live
   Docker stack this session. `db/sqlc/store_test.go`'s existing concurrent
   `TransferTx` test is a good stress test to confirm the chain stays
   consistent under concurrent retries; it hasn't been run since the hash
   chain was added (no working Go toolchain in the sandbox this was built
   in — needs a real `go test ./...` pass). Medium.
7. **Transfer status field.** `transfers` has no `status` column — every
   transfer is assumed instant and always-succeeds. Needed the moment any
   step becomes async (fraud check, external rail, manual review). Add
   `status` (`pending`/`completed`/`failed`/`reversed`) now while the schema
   change is still cheap, even if every transfer just goes straight to
   `completed` for now. Small.
8. **TLS.** Everything currently runs over plain HTTP, including in
   `docker-compose.yaml`. Needs a reverse proxy (Caddy/Traefik/nginx) or a
   TLS-terminating load balancer in front before this is anywhere near a
   real deployment. Medium.

## Later — real product features, bigger scope

9. **External beneficiaries.** Transfers today can only move money between
   two accounts that already exist in this system. A real transfer app
   needs to send to accounts it doesn't control — a `beneficiaries` table,
   a separate (slower, more scrutinized) transfer path.
10. **Multi-currency / FX.** Accounts are single-currency and transfers
    require exact currency match on both sides. Cross-currency transfers
    need an FX rate source and a conversion step in `TransferTx`.
11. **Velocity limits & step-up auth.** Daily/per-transfer caps, and
    requiring re-authentication (or MFA) for large or unusual transfers.
12. **MFA.** TOTP or push-based second factor on login and/or step-up for
    sensitive actions.
13. **Notifications.** Email/SMS/webhook on transfer completion — currently
    nothing tells either party a transfer happened outside checking the
    app.
14. **KYC/AML screening.** Required for a real money-transfer product,
    irrelevant for a demo — listed for completeness.
15. **Observability.** Structured logging and tracing instead of Gin's bare
    default logger; currently no visibility into transfer failures/retries
    in production.
16. **OpenAPI spec.** No machine-readable API contract exists yet for
    client generation or frontend/backend contract testing.

## Housekeeping (small, do whenever convenient)

- Regenerate the hand-edited `db/sqlc/*.go` files with the real `sqlc` CLI
  once it's available, to confirm they match what codegen would actually
  produce (`db/query/entry.sql` is the source of truth and was kept in
  sync by hand this session).
- Delete `db/mock/store.go` — it references a different module
  (`github.com/zakhaev43/Simple-Bank`, a leftover from before this project
  was forked/renamed) and nothing in the repo imports it.
- Fix `GRPC_SERVER_ADDRESS` in `app.env` — set but nothing reads it; either
  wire up a gRPC server or remove the unused config.
