-- name: AdminCountUsers :one
SELECT
  COUNT(*)::bigint AS total,
  COUNT(*) FILTER (WHERE created_at >= sqlc.arg(since))::bigint AS new_since
FROM users
WHERE role <> 'system';

-- name: AdminAccountSummary :many
SELECT
  currency,
  COUNT(*)::bigint AS accounts,
  COUNT(*) FILTER (WHERE status = 'active')::bigint AS active,
  COUNT(*) FILTER (WHERE status = 'frozen')::bigint AS frozen,
  COUNT(*) FILTER (WHERE status = 'closed')::bigint AS closed,
  COALESCE(SUM(balance), 0)::bigint AS balances
FROM accounts
WHERE kind = 'customer'
GROUP BY currency
ORDER BY currency;

-- name: AdminTransactionSummary :many
SELECT
  currency,
  kind,
  COUNT(*)::bigint AS count,
  COALESCE(SUM(amount), 0)::bigint AS volume,
  COUNT(*) FILTER (WHERE created_at >= sqlc.arg(since))::bigint AS count_since,
  COALESCE(SUM(amount) FILTER (WHERE created_at >= sqlc.arg(since)), 0)::bigint AS volume_since
FROM transactions
GROUP BY currency, kind
ORDER BY currency, kind;

-- name: AdminDailyActivity :many
SELECT
  date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
  currency,
  kind,
  COUNT(*)::bigint AS count,
  COALESCE(SUM(amount), 0)::bigint AS volume
FROM transactions
WHERE created_at >= sqlc.arg(since)
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- name: AdminTopSenders :many
SELECT
  a.owner,
  u.full_name,
  a.currency,
  COUNT(*)::bigint AS transfers,
  SUM(t.amount)::bigint AS volume
FROM transfers t
JOIN accounts a ON a.id = t.from_account_id
JOIN users u ON u.username = a.owner
WHERE t.created_at >= sqlc.arg(since)
GROUP BY a.owner, u.full_name, a.currency
ORDER BY volume DESC
LIMIT sqlc.arg(row_limit);

-- name: AdminListTransactions :many
-- Every transaction kind has exactly one debit and one credit entry.
SELECT
  t.id,
  t.kind,
  t.status,
  t.currency,
  t.amount,
  t.description,
  t.created_at,
  d.account_id AS from_account_id,
  da.owner AS from_owner,
  da.kind AS from_kind,
  c.account_id AS to_account_id,
  ca.owner AS to_owner
FROM transactions t
JOIN entries d ON d.transaction_id = t.id AND d.amount < 0
JOIN accounts da ON da.id = d.account_id
JOIN entries c ON c.transaction_id = t.id AND c.amount > 0
JOIN accounts ca ON ca.id = c.account_id
WHERE (sqlc.narg(kind)::varchar IS NULL OR t.kind = sqlc.narg(kind))
  AND (sqlc.narg(currency)::varchar IS NULL OR t.currency = sqlc.narg(currency))
ORDER BY t.id DESC
LIMIT sqlc.arg(page_limit)
OFFSET sqlc.arg(page_offset);

-- name: AdminListUsers :many
SELECT
  u.username,
  u.full_name,
  u.email,
  u.role,
  u.created_at,
  COUNT(a.id)::bigint AS accounts,
  COUNT(a.id) FILTER (WHERE a.status = 'frozen')::bigint AS frozen_accounts
FROM users u
LEFT JOIN accounts a ON a.owner = u.username
WHERE u.role <> 'system'
  AND (
    sqlc.narg(search)::varchar IS NULL
    OR u.username ILIKE '%' || sqlc.narg(search) || '%'
    OR u.full_name ILIKE '%' || sqlc.narg(search) || '%'
    OR u.email ILIKE '%' || sqlc.narg(search) || '%'
  )
GROUP BY u.username
ORDER BY u.created_at DESC
LIMIT sqlc.arg(page_limit)
OFFSET sqlc.arg(page_offset);
