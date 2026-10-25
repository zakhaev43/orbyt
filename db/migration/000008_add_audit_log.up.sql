-- Who did what, to what, from where, and whether it worked. The API seals
-- every row into an HMAC chain (see db.SealAuditLog) with a key the database
-- never sees, so rows can't be forged, edited, reordered or removed without
-- the chain failing verification.
CREATE TABLE "audit_logs" (
  "id" bigserial PRIMARY KEY,
  "occurred_at" timestamptz NOT NULL,
  "request_id" varchar NOT NULL,
  "actor" varchar NOT NULL DEFAULT '',
  "action" varchar NOT NULL,
  "outcome" varchar NOT NULL,
  "target_type" varchar NOT NULL DEFAULT '',
  "target_id" varchar NOT NULL DEFAULT '',
  "method" varchar NOT NULL,
  "path" varchar NOT NULL,
  "status_code" int NOT NULL,
  "reason" varchar NOT NULL DEFAULT '',
  "client_ip" varchar NOT NULL DEFAULT '',
  "user_agent" varchar NOT NULL DEFAULT '',
  -- json, not jsonb: the seal covers these exact bytes, and jsonb would
  -- reorder keys and reformat them.
  "details" json NOT NULL DEFAULT '{}',
  "prev_hash" varchar NOT NULL,
  "hash" varchar NOT NULL UNIQUE,
  CONSTRAINT "audit_logs_outcome_check" CHECK ("outcome" IN ('success', 'failure', 'denied'))
);

COMMENT ON COLUMN "audit_logs"."actor" IS 'username as claimed or authenticated; empty when anonymous';

CREATE INDEX ON "audit_logs" ("actor", "id");
CREATE INDEX ON "audit_logs" ("action", "id");
CREATE INDEX ON "audit_logs" ("target_type", "target_id", "id");
CREATE INDEX ON "audit_logs" ("occurred_at");

-- Append-only, with no exceptions: unlike ledger entries, the seal is
-- computed before insert, so nothing ever needs to be filled in afterwards.
CREATE FUNCTION reject_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit log is append-only' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION reject_audit_log_mutation();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT
  EXECUTE FUNCTION reject_audit_log_mutation();
