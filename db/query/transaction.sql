-- name: CreateTransaction :one
-- created_at defaults to now(); only the provisioning tool backdates it.
INSERT INTO transactions (
  kind,
  currency,
  amount,
  description,
  created_at
) VALUES (
  sqlc.arg(kind), sqlc.arg(currency), sqlc.arg(amount), sqlc.arg(description),
  COALESCE(sqlc.narg(created_at)::timestamptz, now())
) RETURNING *;

-- name: GetTransaction :one
SELECT * FROM transactions
WHERE id = $1 LIMIT 1;

-- name: ListUnbalancedTransactions :many
-- Should always be empty: the entries_balanced trigger rejects these at commit.
SELECT transaction_id::bigint AS transaction_id, SUM(amount)::bigint AS total
FROM entries
WHERE transaction_id IS NOT NULL
GROUP BY transaction_id
HAVING SUM(amount) <> 0
ORDER BY transaction_id;
