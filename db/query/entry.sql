-- name: CreateEntry :one
INSERT INTO entries (
  account_id,
  amount,
  transaction_id
) VALUES (
  $1, $2, $3
) RETURNING *;

-- name: SetEntryHash :one
UPDATE entries
SET prev_hash = $2,
    hash = $3
WHERE id = $1
RETURNING *;

-- name: GetLastEntryHash :one
SELECT hash FROM entries
ORDER BY id DESC
LIMIT 1;

-- name: GetEntry :one
SELECT * FROM entries
WHERE id = $1 LIMIT 1;

-- name: ListEntries :many
SELECT * FROM entries
WHERE account_id = $1
ORDER BY id
LIMIT $2
OFFSET $3;

-- name: ListAllEntries :many
SELECT * FROM entries
ORDER BY id;

-- name: ListAccountStatement :many
SELECT
  s.id,
  s.transaction_id,
  s.amount,
  s.balance_after,
  s.created_at,
  COALESCE(t.kind, 'transfer')::varchar AS kind,
  COALESCE(t.description, '')::varchar AS description,
  COALESCE(cp.account_id, 0)::bigint AS counterparty_account_id,
  COALESCE(ca.owner, '')::varchar AS counterparty_owner,
  COALESCE(ca.kind, '')::varchar AS counterparty_kind
FROM (
  SELECT
    e.id,
    e.transaction_id,
    e.amount,
    e.created_at,
    SUM(e.amount) OVER (ORDER BY e.id)::bigint AS balance_after
  FROM entries e
  WHERE e.account_id = sqlc.arg(account_id)
) s
LEFT JOIN transactions t ON t.id = s.transaction_id
LEFT JOIN LATERAL (
  SELECT o.account_id FROM entries o
  WHERE o.transaction_id = s.transaction_id AND o.id <> s.id
  ORDER BY o.id
  LIMIT 1
) cp ON true
LEFT JOIN accounts ca ON ca.id = cp.account_id
ORDER BY s.id DESC
LIMIT sqlc.arg(page_limit)
OFFSET sqlc.arg(page_offset);
