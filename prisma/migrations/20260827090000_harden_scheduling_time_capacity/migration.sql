ALTER TABLE "activity_sessions"
  ADD COLUMN "utc_end_offset_minutes" SMALLINT;

UPDATE "activity_sessions"
SET "utc_end_offset_minutes" = (
  EXTRACT(EPOCH FROM (
    ("ends_at" AT TIME ZONE "timezone") -
    ("ends_at" AT TIME ZONE 'UTC')
  )) / 60
)::SMALLINT;

ALTER TABLE "activity_sessions"
  ALTER COLUMN "utc_end_offset_minutes" SET NOT NULL,
  ADD CONSTRAINT "activity_sessions_utc_end_offset_check"
    CHECK ("utc_end_offset_minutes" BETWEEN -840 AND 840);

ALTER TABLE "activity_schedule_templates"
  DROP CONSTRAINT "activity_schedule_templates_generation_window_check",
  ADD CONSTRAINT "activity_schedule_templates_generation_window_check"
    CHECK (
      "generation_end_date" >= "generation_start_date" AND
      "generation_end_date" - "generation_start_date" <= 365
    );

ALTER TABLE "activity_sessions"
  DROP CONSTRAINT "activity_sessions_cutoff_check",
  ADD CONSTRAINT "activity_sessions_cutoff_check"
    CHECK (
      "booking_cutoff_minutes" >= 0 AND
      "booking_cutoff_at" = "starts_at" - ("booking_cutoff_minutes" * INTERVAL '1 minute')
    ),
  DROP CONSTRAINT "activity_sessions_lifecycle_check",
  ADD CONSTRAINT "activity_sessions_lifecycle_check"
    CHECK (
      ("status" = 'SCHEDULED' AND "cancellation_reason" IS NULL AND
        "cancelled_at" IS NULL AND "cancelled_by_user_id" IS NULL AND
        "completed_at" IS NULL) OR
      ("status" = 'CANCELLED' AND "booked_count" = 0 AND
        "cancellation_reason" IS NOT NULL AND BTRIM("cancellation_reason") <> '' AND
        "cancelled_at" IS NOT NULL AND "cancelled_by_user_id" IS NOT NULL AND
        "completed_at" IS NULL) OR
      ("status" = 'COMPLETED' AND "cancellation_reason" IS NULL AND
        "cancelled_at" IS NULL AND "cancelled_by_user_id" IS NULL AND
        "completed_at" IS NOT NULL)
    );
