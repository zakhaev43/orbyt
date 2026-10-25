-- name: CreateUser :one
INSERT INTO users (
  username,
  hashed_password,
  full_name,
  email
) VALUES (
  $1, $2, $3, $4
) RETURNING *;

-- name: GetUser :one
SELECT * FROM users
WHERE username= $1 LIMIT 1;

-- name: SetUserRole :one
UPDATE users
SET role = sqlc.arg(role)
WHERE username = sqlc.arg(username)
RETURNING *;
