-- Account lifecycle. 'system' accounts are internal funding sources (one per
-- currency) and are the only accounts allowed to carry a negative balance.
ALTER TABLE "accounts" ADD COLUMN "status" varchar NOT NULL DEFAULT 'active';
ALTER TABLE "accounts" ADD COLUMN "kind" varchar NOT NULL DEFAULT 'customer';

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_status_check"
  CHECK ("status" IN ('active', 'frozen', 'closed'));
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_kind_check"
  CHECK ("kind" IN ('customer', 'system'));
-- NOT VALID: enforced for every new write, without failing the migration on
-- legacy rows that went negative before overdraft checks existed.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_no_overdraft"
  CHECK ("kind" = 'system' OR "balance" >= 0) NOT VALID;

-- A transaction groups the ledger entries that move money together.
CREATE TABLE "transactions" (
  "id" bigserial PRIMARY KEY,
  "kind" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'completed',
  "currency" varchar NOT NULL,
  "amount" bigint NOT NULL,
  "description" varchar NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  CONSTRAINT "transactions_kind_check" CHECK ("kind" IN ('transfer', 'deposit')),
  CONSTRAINT "transactions_status_check" CHECK ("status" IN ('pending', 'completed', 'failed', 'reversed')),
  CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0)
);

COMMENT ON COLUMN "transactions"."amount" IS 'minor units (e.g. cents), always positive';

ALTER TABLE "entries" ADD COLUMN "transaction_id" bigint REFERENCES "transactions" ("id");
CREATE INDEX ON "entries" ("transaction_id");

ALTER TABLE "transfers" ADD COLUMN "transaction_id" bigint UNIQUE REFERENCES "transactions" ("id");

-- Every new entry and transfer must belong to a transaction. NOT VALID leaves
-- rows written before this migration alone.
ALTER TABLE "entries" ADD CONSTRAINT "entries_transaction_required"
  CHECK ("transaction_id" IS NOT NULL) NOT VALID;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_transaction_required"
  CHECK ("transaction_id" IS NOT NULL) NOT VALID;

-- Double-entry invariant, checked at COMMIT: every transaction has at least
-- two entries, they sum to zero, and they all share one currency.
CREATE FUNCTION assert_transaction_balanced() RETURNS trigger AS $$
DECLARE
  total bigint;
  entry_count int;
  currency_count int;
BEGIN
  SELECT COALESCE(SUM(e.amount), 0), COUNT(*), COUNT(DISTINCT a.currency)
    INTO total, entry_count, currency_count
    FROM entries e
    JOIN accounts a ON a.id = e.account_id
   WHERE e.transaction_id = NEW.transaction_id;

  IF entry_count < 2 OR total <> 0 OR currency_count <> 1 THEN
    RAISE EXCEPTION 'transaction % is unbalanced (entries=%, sum=%, currencies=%)',
      NEW.transaction_id, entry_count, total, currency_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "entries_balanced"
  AFTER INSERT ON "entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.transaction_id IS NOT NULL)
  EXECUTE FUNCTION assert_transaction_balanced();

-- The ledger is append-only: only the hash columns may be filled in after
-- insert (the hash depends on the generated id and created_at).
CREATE FUNCTION reject_entry_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ledger entries are append-only' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ledger entries are append-only' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "entries_append_only"
  BEFORE UPDATE OR DELETE ON "entries"
  FOR EACH ROW
  EXECUTE FUNCTION reject_entry_mutation();

-- Internal owner for system accounts. The password hash is not a valid bcrypt
-- hash and the username fails the API's alphanum check, so it cannot log in.
INSERT INTO "users" ("username", "hashed_password", "full_name", "email")
VALUES ('_system', '!', 'Orbyt Treasury', 'treasury@orbyt.invalid');

INSERT INTO "accounts" ("owner", "balance", "currency", "kind")
VALUES ('_system', 0, 'USD', 'system'),
       ('_system', 0, 'EUR', 'system'),
       ('_system', 0, 'GBP', 'system'),
       ('_system', 0, 'CAD', 'system');
