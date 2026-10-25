ALTER TABLE "users" ADD COLUMN "role" varchar NOT NULL DEFAULT 'customer';
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('customer', 'admin', 'system'));

UPDATE "users" SET "role" = 'system' WHERE "username" = '_system';

CREATE INDEX ON "transactions" ("created_at");
