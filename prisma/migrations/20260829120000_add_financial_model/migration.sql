-- CreateEnum
CREATE TYPE "AllowanceTransactionType" AS ENUM (
  'INITIAL_ALLOCATION',
  'TOP_UP',
  'BOOKING_DEBIT',
  'CANCELLATION_REFUND',
  'MANUAL_ADJUSTMENT',
  'EXPIRATION'
);

CREATE TYPE "AllowanceReferenceType" AS ENUM (
  'ALLOWANCE_GRANT',
  'BOOKING',
  'MANUAL_ADJUSTMENT',
  'EXPIRATION_POLICY'
);

CREATE TYPE "LedgerActorType" AS ENUM ('USER', 'SYSTEM');

-- The composite key makes the employee/employer tenant boundary available to a foreign key.
CREATE UNIQUE INDEX "employees_id_employer_id_key" ON "employees"("id", "employer_id");

CREATE TABLE "allowance_accounts" (
  "id" UUID NOT NULL,
  "employer_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "current_balance_minor" BIGINT NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "allowance_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "allowance_accounts_currency_iso_shape_check"
    CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "allowance_accounts_balance_nonnegative_check"
    CHECK ("current_balance_minor" >= 0),
  CONSTRAINT "allowance_accounts_version_nonnegative_check"
    CHECK ("version" >= 0)
);

CREATE TABLE "allowance_transactions" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" "AllowanceTransactionType" NOT NULL,
  "amount_delta_minor" BIGINT NOT NULL,
  "resulting_balance_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "reference_type" "AllowanceReferenceType" NOT NULL,
  "reference_id" UUID NOT NULL,
  "metadata" JSONB,
  "actor_type" "LedgerActorType" NOT NULL,
  "actor_user_id" UUID,
  "correlation_id" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "allowance_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "allowance_transactions_sequence_positive_check"
    CHECK ("sequence" > 0),
  CONSTRAINT "allowance_transactions_resulting_balance_check"
    CHECK ("resulting_balance_minor" >= 0),
  CONSTRAINT "allowance_transactions_currency_iso_shape_check"
    CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "allowance_transactions_delta_direction_check"
    CHECK (
      ("type" IN ('INITIAL_ALLOCATION', 'TOP_UP', 'CANCELLATION_REFUND') AND
        "amount_delta_minor" > 0) OR
      ("type" IN ('BOOKING_DEBIT', 'EXPIRATION') AND "amount_delta_minor" < 0) OR
      ("type" = 'MANUAL_ADJUSTMENT' AND "amount_delta_minor" <> 0)
    ),
  CONSTRAINT "allowance_transactions_reference_type_check"
    CHECK (
      ("type" IN ('INITIAL_ALLOCATION', 'TOP_UP') AND
        "reference_type" = 'ALLOWANCE_GRANT') OR
      ("type" IN ('BOOKING_DEBIT', 'CANCELLATION_REFUND') AND
        "reference_type" = 'BOOKING') OR
      ("type" = 'MANUAL_ADJUSTMENT' AND "reference_type" = 'MANUAL_ADJUSTMENT') OR
      ("type" = 'EXPIRATION' AND "reference_type" = 'EXPIRATION_POLICY')
    ),
  CONSTRAINT "allowance_transactions_actor_check"
    CHECK (
      ("actor_type" = 'USER' AND "actor_user_id" IS NOT NULL) OR
      ("actor_type" = 'SYSTEM' AND "actor_user_id" IS NULL)
    ),
  CONSTRAINT "allowance_transactions_manual_actor_check"
    CHECK ("type" <> 'MANUAL_ADJUSTMENT' OR "actor_type" = 'USER'),
  CONSTRAINT "allowance_transactions_correlation_not_blank_check"
    CHECK (BTRIM("correlation_id") <> ''),
  CONSTRAINT "allowance_transactions_metadata_object_check"
    CHECK ("metadata" IS NULL OR JSONB_TYPEOF("metadata") = 'object')
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" UUID NOT NULL,
  "allowance_transaction_id" UUID,
  "before_state" JSONB,
  "after_state" JSONB,
  "correlation_id" VARCHAR(128) NOT NULL,
  "request_metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_labels_not_blank_check"
    CHECK (BTRIM("action") <> '' AND BTRIM("entity_type") <> ''),
  CONSTRAINT "audit_logs_correlation_not_blank_check"
    CHECK (BTRIM("correlation_id") <> ''),
  CONSTRAINT "audit_logs_state_object_check"
    CHECK (
      ("before_state" IS NULL OR JSONB_TYPEOF("before_state") = 'object') AND
      ("after_state" IS NULL OR JSONB_TYPEOF("after_state") = 'object') AND
      ("request_metadata" IS NULL OR JSONB_TYPEOF("request_metadata") = 'object')
    )
);

CREATE UNIQUE INDEX "allowance_accounts_employee_id_key"
  ON "allowance_accounts"("employee_id");
CREATE UNIQUE INDEX "allowance_accounts_employee_id_employer_id_key"
  ON "allowance_accounts"("employee_id", "employer_id");
CREATE INDEX "allowance_accounts_employer_id_employee_id_idx"
  ON "allowance_accounts"("employer_id", "employee_id");

CREATE UNIQUE INDEX "allowance_transactions_account_id_sequence_key"
  ON "allowance_transactions"("account_id", "sequence");
CREATE UNIQUE INDEX "allowance_transactions_reference_key"
  ON "allowance_transactions"("account_id", "type", "reference_type", "reference_id");
CREATE UNIQUE INDEX "allowance_transactions_non_booking_reference_key"
  ON "allowance_transactions"("account_id", "reference_type", "reference_id")
  WHERE "reference_type" <> 'BOOKING';
CREATE UNIQUE INDEX "allowance_transactions_one_initial_allocation_key"
  ON "allowance_transactions"("account_id")
  WHERE "type" = 'INITIAL_ALLOCATION';
CREATE INDEX "allowance_transactions_account_id_created_at_id_idx"
  ON "allowance_transactions"("account_id", "created_at", "id");
CREATE INDEX "allowance_transactions_reference_type_reference_id_idx"
  ON "allowance_transactions"("reference_type", "reference_id");
CREATE INDEX "allowance_transactions_actor_user_id_created_at_idx"
  ON "allowance_transactions"("actor_user_id", "created_at");

CREATE UNIQUE INDEX "audit_logs_allowance_transaction_id_key"
  ON "audit_logs"("allowance_transaction_id");
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx"
  ON "audit_logs"("entity_type", "entity_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx"
  ON "audit_logs"("actor_user_id", "created_at");

ALTER TABLE "allowance_accounts" ADD CONSTRAINT "allowance_accounts_employer_id_fkey"
  FOREIGN KEY ("employer_id") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allowance_accounts" ADD CONSTRAINT "allowance_accounts_employee_id_employer_id_fkey"
  FOREIGN KEY ("employee_id", "employer_id") REFERENCES "employees"("id", "employer_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allowance_transactions" ADD CONSTRAINT "allowance_transactions_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "allowance_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allowance_transactions" ADD CONSTRAINT "allowance_transactions_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_allowance_transaction_id_fkey"
  FOREIGN KEY ("allowance_transaction_id") REFERENCES "allowance_transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A ledger row must describe the currently locked account and its next state. The
-- account is updated only after this append, within the same database transaction.
CREATE FUNCTION enforce_allowance_ledger_append() RETURNS trigger AS $$
DECLARE
  account_currency CHAR(3);
  account_balance BIGINT;
  account_version INTEGER;
BEGIN
  SELECT "currency", "current_balance_minor", "version"
    INTO account_currency, account_balance, account_version
    FROM "allowance_accounts"
    WHERE "id" = NEW."account_id"
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'allowance account does not exist';
  END IF;
  IF NEW."currency" <> account_currency THEN
    RAISE EXCEPTION 'ledger currency does not match account currency';
  END IF;
  IF NEW."sequence" <> account_version + 1 THEN
    RAISE EXCEPTION 'ledger sequence is not the next account version';
  END IF;
  IF NEW."resulting_balance_minor" <> account_balance + NEW."amount_delta_minor" THEN
    RAISE EXCEPTION 'ledger resulting balance is inconsistent';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "allowance_transactions_append_guard"
  BEFORE INSERT ON "allowance_transactions"
  FOR EACH ROW EXECUTE FUNCTION enforce_allowance_ledger_append();

CREATE FUNCTION enforce_allowance_account_update() RETURNS trigger AS $$
BEGIN
  IF NEW."id" <> OLD."id" OR NEW."employer_id" <> OLD."employer_id" OR
     NEW."employee_id" <> OLD."employee_id" OR NEW."currency" <> OLD."currency" THEN
    RAISE EXCEPTION 'allowance account identity and currency are immutable';
  END IF;

  IF NEW."current_balance_minor" <> OLD."current_balance_minor" OR NEW."version" <> OLD."version" THEN
    IF NEW."version" <> OLD."version" + 1 OR NOT EXISTS (
      SELECT 1 FROM "allowance_transactions" entry
      WHERE entry."account_id" = NEW."id"
        AND entry."sequence" = NEW."version"
        AND entry."resulting_balance_minor" = NEW."current_balance_minor"
    ) THEN
      RAISE EXCEPTION 'allowance balance update has no matching ledger append';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "allowance_accounts_update_guard"
  BEFORE UPDATE ON "allowance_accounts"
  FOR EACH ROW EXECUTE FUNCTION enforce_allowance_account_update();

CREATE FUNCTION require_allowance_account_projection() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "allowance_accounts" account
    WHERE account."id" = NEW."account_id"
      AND account."version" = NEW."sequence"
      AND account."current_balance_minor" = NEW."resulting_balance_minor"
  ) THEN
    RAISE EXCEPTION 'ledger append requires its matching account projection update';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "allowance_transactions_projection_required"
  AFTER INSERT ON "allowance_transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_allowance_account_projection();

CREATE FUNCTION require_initial_allowance_allocation() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "allowance_transactions" entry
    WHERE entry."account_id" = NEW."id"
      AND entry."type" = 'INITIAL_ALLOCATION'
      AND entry."sequence" = 1
  ) THEN
    RAISE EXCEPTION 'allowance account requires an initial allocation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "allowance_accounts_initial_allocation_required"
  AFTER INSERT ON "allowance_accounts"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_initial_allowance_allocation();

CREATE FUNCTION reject_financial_record_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "allowance_transactions_immutable"
  BEFORE UPDATE OR DELETE ON "allowance_transactions"
  FOR EACH ROW EXECUTE FUNCTION reject_financial_record_mutation();
CREATE TRIGGER "audit_logs_immutable"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION reject_financial_record_mutation();
CREATE TRIGGER "allowance_accounts_delete_guard"
  BEFORE DELETE ON "allowance_accounts"
  FOR EACH ROW EXECUTE FUNCTION reject_financial_record_mutation();

CREATE FUNCTION validate_manual_adjustment_audit() RETURNS trigger AS $$
DECLARE
  transaction_record "allowance_transactions"%ROWTYPE;
BEGIN
  IF NEW."allowance_transaction_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO transaction_record FROM "allowance_transactions"
    WHERE "id" = NEW."allowance_transaction_id";
  IF NOT FOUND OR transaction_record."type" <> 'MANUAL_ADJUSTMENT' OR
     NEW."action" <> 'ALLOWANCE_MANUAL_ADJUSTMENT' OR
     NEW."entity_type" <> 'ALLOWANCE_TRANSACTION' OR
     NEW."entity_id" <> transaction_record."id" OR
     NEW."actor_user_id" <> transaction_record."actor_user_id" OR
     NEW."correlation_id" <> transaction_record."correlation_id" THEN
    RAISE EXCEPTION 'invalid manual allowance adjustment audit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_manual_adjustment_guard"
  BEFORE INSERT ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION validate_manual_adjustment_audit();

CREATE FUNCTION require_manual_adjustment_audit() RETURNS trigger AS $$
BEGIN
  IF NEW."type" = 'MANUAL_ADJUSTMENT' AND NOT EXISTS (
    SELECT 1 FROM "audit_logs" audit
    WHERE audit."allowance_transaction_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'manual allowance adjustment requires an audit log';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "allowance_transactions_manual_audit_required"
  AFTER INSERT ON "allowance_transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_manual_adjustment_audit();
