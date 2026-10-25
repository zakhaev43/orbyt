-- name: LockAuditChain :exec
-- Serialises appends for the rest of the transaction so ids follow chain order.
SELECT pg_advisory_xact_lock(7307245731);

-- name: GetLastAuditHash :one
SELECT hash FROM audit_logs
ORDER BY id DESC
LIMIT 1;

-- name: NextAuditLogID :one
SELECT nextval('audit_logs_id_seq')::bigint;

-- name: CreateAuditLog :one
INSERT INTO audit_logs (
  id, occurred_at, request_id, actor, action, outcome, target_type, target_id,
  method, path, status_code, reason, client_ip, user_agent, details, prev_hash, hash
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
) RETURNING *;

-- name: ListAuditLogs :many
-- Newest first, paged by keyset on id so pages stay stable while new events arrive.
SELECT * FROM audit_logs
WHERE (sqlc.narg('actor')::varchar IS NULL OR actor = sqlc.narg('actor'))
  AND (sqlc.narg('action')::varchar IS NULL OR action = sqlc.narg('action'))
  AND (sqlc.narg('outcome')::varchar IS NULL OR outcome = sqlc.narg('outcome'))
  AND (sqlc.narg('target_type')::varchar IS NULL OR target_type = sqlc.narg('target_type'))
  AND (sqlc.narg('target_id')::varchar IS NULL OR target_id = sqlc.narg('target_id'))
  AND (sqlc.narg('since')::timestamptz IS NULL OR occurred_at >= sqlc.narg('since'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
ORDER BY id DESC
LIMIT sqlc.arg('page_limit');

-- name: ListAuditLogsAfter :many
SELECT * FROM audit_logs
WHERE id > sqlc.arg('after_id')
ORDER BY id
LIMIT sqlc.arg('page_limit');
