DROP INDEX IF EXISTS "transactions_created_at_idx";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";
ALTER TABLE "users" DROP COLUMN IF EXISTS "role";
