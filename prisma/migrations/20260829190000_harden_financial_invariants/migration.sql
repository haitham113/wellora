-- Keep currency semantics identical at HTTP, service, and persistence boundaries.
CREATE FUNCTION is_iso_4217_currency(code TEXT) RETURNS BOOLEAN AS $$
  SELECT code = ANY (ARRAY[
    'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD',
    'BIF','BMD','BND','BOB','BOV','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHE','CHF',
    'CHW','CLF','CLP','CNY','COP','COU','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP',
    'ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL',
    'HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF',
    'KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD',
    'MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MXV','MYR','MZN','NAD','NGN','NIO','NOK',
    'NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF',
    'SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SLL','SOS','SRD','SSP','STN','SVC','SYP',
    'SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','USN','UYI',
    'UYU','UYW','UZS','VED','VES','VND','VUV','WST','XAF','XAG','XAU','XBA','XBB','XBC','XBD',
    'XCD','XDR','XOF','XPD','XPF','XPT','XSU','XTS','XUA','XXX','YER','ZAR','ZMW','ZWL'
  ]::TEXT[]);
$$ LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE;

ALTER TABLE "employers"
  DROP CONSTRAINT "employers_currency_iso_shape_check",
  ADD CONSTRAINT "employers_currency_iso_4217_check"
    CHECK (is_iso_4217_currency("default_currency"));

ALTER TABLE "activities"
  DROP CONSTRAINT "activities_currency_iso_shape_check",
  ADD CONSTRAINT "activities_currency_iso_4217_check"
    CHECK ("currency" IS NULL OR is_iso_4217_currency("currency"));

ALTER TABLE "allowance_accounts"
  DROP CONSTRAINT "allowance_accounts_currency_iso_shape_check",
  ADD CONSTRAINT "allowance_accounts_currency_iso_4217_check"
    CHECK (is_iso_4217_currency("currency"));

ALTER TABLE "allowance_transactions"
  DROP CONSTRAINT "allowance_transactions_currency_iso_shape_check",
  ADD CONSTRAINT "allowance_transactions_currency_iso_4217_check"
    CHECK (is_iso_4217_currency("currency"));

-- A refund is a reversal of a known debit, never an independent credit.
CREATE FUNCTION enforce_cancellation_refund() RETURNS trigger AS $$
DECLARE
  debit_delta BIGINT;
  debit_currency CHAR(3);
BEGIN
  IF NEW."type" <> 'CANCELLATION_REFUND' THEN
    RETURN NEW;
  END IF;

  SELECT debit."amount_delta_minor", debit."currency"
    INTO debit_delta, debit_currency
    FROM "allowance_transactions" debit
    WHERE debit."account_id" = NEW."account_id"
      AND debit."type" = 'BOOKING_DEBIT'
      AND debit."reference_type" = 'BOOKING'
      AND debit."reference_id" = NEW."reference_id"
      AND debit."sequence" < NEW."sequence";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation refund requires a preceding booking debit';
  END IF;
  IF NEW."currency" <> debit_currency THEN
    RAISE EXCEPTION 'cancellation refund currency does not match booking debit';
  END IF;
  IF NEW."amount_delta_minor" > -debit_delta THEN
    RAISE EXCEPTION 'cancellation refund exceeds booking debit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "allowance_transactions_refund_guard"
  BEFORE INSERT ON "allowance_transactions"
  FOR EACH ROW EXECUTE FUNCTION enforce_cancellation_refund();

-- A linked row alone is not a sufficient audit. Validate its content and actor.
CREATE OR REPLACE FUNCTION validate_manual_adjustment_audit() RETURNS trigger AS $$
DECLARE
  transaction_record "allowance_transactions"%ROWTYPE;
  account_employer_id UUID;
  expected_before_balance TEXT;
  expected_after_balance TEXT;
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
    RAISE EXCEPTION 'invalid manual allowance adjustment audit linkage';
  END IF;

  SELECT account."employer_id" INTO account_employer_id
    FROM "allowance_accounts" account
    WHERE account."id" = transaction_record."account_id";
  expected_before_balance := (
    transaction_record."resulting_balance_minor" - transaction_record."amount_delta_minor"
  )::TEXT;
  expected_after_balance := transaction_record."resulting_balance_minor"::TEXT;

  IF NEW."before_state" IS NULL OR NEW."after_state" IS NULL OR
     NEW."request_metadata" IS NULL OR
     NEW."before_state" ->> 'balanceMinor' IS DISTINCT FROM expected_before_balance OR
     NEW."after_state" ->> 'balanceMinor' IS DISTINCT FROM expected_after_balance OR
     NEW."before_state" ->> 'currency' IS DISTINCT FROM transaction_record."currency"::TEXT OR
     NEW."after_state" ->> 'currency' IS DISTINCT FROM transaction_record."currency"::TEXT OR
     NULLIF(BTRIM(NEW."request_metadata" ->> 'reason'), '') IS NULL OR
     NEW."request_metadata" ->> 'reason' IS DISTINCT FROM transaction_record."metadata" ->> 'reason' THEN
    RAISE EXCEPTION 'manual allowance adjustment audit state is incomplete or inconsistent';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "users" actor
    WHERE actor."id" = NEW."actor_user_id"
      AND actor."status" = 'ACTIVE'
      AND (
        actor."platform_role" = 'PLATFORM_ADMIN' OR EXISTS (
          SELECT 1
          FROM "employer_memberships" membership
          JOIN "employers" employer ON employer."id" = membership."employer_id"
          WHERE membership."employer_id" = account_employer_id
            AND membership."user_id" = actor."id"
            AND membership."role" = 'ADMIN'
            AND membership."status" = 'ACTIVE'
            AND employer."status" = 'ACTIVE'
        )
      )
  ) THEN
    RAISE EXCEPTION 'manual allowance adjustment audit actor is not authorized';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
