-- name: CreateTransaction :one
INSERT INTO transactions (
  kind,
  currency,
  amount,
  description
) VALUES (
  $1, $2, $3, $4
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
