DROP TRIGGER IF EXISTS "entries_append_only" ON "entries";
DROP FUNCTION IF EXISTS reject_entry_mutation();
DROP TRIGGER IF EXISTS "entries_balanced" ON "entries";
DROP FUNCTION IF EXISTS assert_transaction_balanced();

DELETE FROM "entries" WHERE "account_id" IN (SELECT "id" FROM "accounts" WHERE "kind" = 'system');
DELETE FROM "accounts" WHERE "kind" = 'system';
DELETE FROM "users" WHERE "username" = '_system';

ALTER TABLE "transfers" DROP COLUMN IF EXISTS "transaction_id";
ALTER TABLE "entries" DROP COLUMN IF EXISTS "transaction_id";
DROP TABLE IF EXISTS "transactions";

ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_no_overdraft";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_kind_check";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_status_check";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "kind";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "status";
