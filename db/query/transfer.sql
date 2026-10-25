-- name: CreateTransfer :one
INSERT INTO transfers (
  from_account_id,
  to_account_id,
  amount,
  transaction_id,
  created_at
) VALUES (
  sqlc.arg(from_account_id), sqlc.arg(to_account_id), sqlc.arg(amount), sqlc.arg(transaction_id),
  COALESCE(sqlc.narg(created_at)::timestamptz, now())
) RETURNING *;

-- name: GetTransfer :one
SELECT * FROM transfers
WHERE id = $1 LIMIT 1;

-- name: ListTransfers :many
SELECT * FROM transfers
WHERE
    from_account_id = $1 OR
    to_account_id = $2
ORDER BY id
LIMIT $3
OFFSET $4;
