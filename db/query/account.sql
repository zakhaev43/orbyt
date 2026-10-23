-- name: CreateAccount :one
INSERT INTO accounts (
  owner,
  balance,
  currency
) VALUES (
  $1, 0, $2
) RETURNING *;

-- name: GetAccount :one
SELECT * FROM accounts
WHERE id = $1 LIMIT 1;

-- name: GetAccountForUpdate :one
-- FOR NO KEY UPDATE (not FOR UPDATE) so inserting entries/transfers that
-- reference this row via FK (which take FOR KEY SHARE) isn't blocked.
SELECT * FROM accounts
WHERE id = $1 LIMIT 1
FOR NO KEY UPDATE;

-- name: GetSystemAccount :one
SELECT * FROM accounts
WHERE kind = 'system' AND currency = $1
LIMIT 1;

-- name: ListAccounts :many
SELECT * FROM accounts
WHERE owner = $1
ORDER BY id
LIMIT $2
OFFSET $3;

-- name: AddAccountBalance :one
UPDATE accounts
SET balance = balance + sqlc.arg(amount)
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: UpdateAccountStatus :one
-- Conditional so it can't race a concurrent transfer: the row lock taken by
-- UPDATE makes Postgres re-check status/balance against the latest version.
UPDATE accounts
SET status = sqlc.arg(new_status)
WHERE id = sqlc.arg(id)
  AND owner = sqlc.arg(owner)
  AND kind = 'customer'
  AND status = sqlc.arg(from_status)
  AND (sqlc.arg(new_status)::varchar <> 'closed' OR balance = 0)
RETURNING *;

-- name: ListBalanceMismatches :many
SELECT a.id, a.balance, COALESCE(SUM(e.amount), 0)::bigint AS ledger_balance
FROM accounts a
LEFT JOIN entries e ON e.account_id = a.id
GROUP BY a.id
HAVING a.balance <> COALESCE(SUM(e.amount), 0)
ORDER BY a.id;
