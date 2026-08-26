-- Phase 5 stores every instant as TIMESTAMPTZ and snapshots the provider IANA
-- timezone plus the selected UTC offset on each materialized session.

CREATE TYPE "ActivitySessionStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "DstOverlapPolicy" AS ENUM ('EARLIER', 'LATER');
CREATE TYPE "DstGapPolicy" AS ENUM ('SKIP');

CREATE TABLE "activity_schedule_templates" (
    "id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "local_start_time" CHAR(5) NOT NULL,
    "weekdays" INTEGER[] NOT NULL,
    "interval_weeks" SMALLINT NOT NULL DEFAULT 1,
    "generation_start_date" DATE NOT NULL,
    "generation_end_date" DATE NOT NULL,
    "duration_minutes" SMALLINT NOT NULL,
    "capacity" SMALLINT NOT NULL,
    "booking_cutoff_minutes" INTEGER NOT NULL,
    "dst_overlap_policy" "DstOverlapPolicy" NOT NULL DEFAULT 'EARLIER',
    "dst_gap_policy" "DstGapPolicy" NOT NULL DEFAULT 'SKIP',
    "last_generated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "activity_schedule_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activity_schedule_templates_timezone_check"
      CHECK (BTRIM("timezone") <> ''),
    CONSTRAINT "activity_schedule_templates_local_time_check"
      CHECK ("local_start_time" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "activity_schedule_templates_weekdays_check"
      CHECK (
        CARDINALITY("weekdays") BETWEEN 1 AND 7 AND
        "weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]
      ),
    CONSTRAINT "activity_schedule_templates_interval_check"
      CHECK ("interval_weeks" BETWEEN 1 AND 52),
    CONSTRAINT "activity_schedule_templates_generation_window_check"
      CHECK (
        "generation_end_date" >= "generation_start_date" AND
        "generation_end_date" - "generation_start_date" <= 366
      ),
    CONSTRAINT "activity_schedule_templates_duration_check"
      CHECK ("duration_minutes" BETWEEN 1 AND 1440),
    CONSTRAINT "activity_schedule_templates_capacity_check"
      CHECK ("capacity" > 0),
    CONSTRAINT "activity_schedule_templates_cutoff_check"
      CHECK ("booking_cutoff_minutes" >= 0)
);

CREATE TABLE "activity_sessions" (
    "id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "schedule_template_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "utc_offset_minutes" SMALLINT NOT NULL,
    "capacity" SMALLINT NOT NULL,
    "booked_count" SMALLINT NOT NULL DEFAULT 0,
    "booking_cutoff_minutes" INTEGER NOT NULL,
    "booking_cutoff_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "ActivitySessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancellation_reason" VARCHAR(500),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_user_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "activity_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activity_sessions_time_range_check"
      CHECK ("ends_at" > "starts_at" AND "ends_at" <= "starts_at" + INTERVAL '24 hours'),
    CONSTRAINT "activity_sessions_timezone_check"
      CHECK (BTRIM("timezone") <> ''),
    CONSTRAINT "activity_sessions_utc_offset_check"
      CHECK ("utc_offset_minutes" BETWEEN -840 AND 840),
    CONSTRAINT "activity_sessions_capacity_check"
      CHECK ("capacity" > 0 AND "booked_count" BETWEEN 0 AND "capacity"),
    CONSTRAINT "activity_sessions_cutoff_check"
      CHECK ("booking_cutoff_minutes" >= 0 AND "booking_cutoff_at" <= "starts_at"),
    CONSTRAINT "activity_sessions_version_check"
      CHECK ("version" >= 0),
    CONSTRAINT "activity_sessions_lifecycle_check"
      CHECK (
        ("status" = 'SCHEDULED' AND "cancellation_reason" IS NULL AND
          "cancelled_at" IS NULL AND "cancelled_by_user_id" IS NULL AND
          "completed_at" IS NULL) OR
        ("status" = 'CANCELLED' AND "cancellation_reason" IS NOT NULL AND
          BTRIM("cancellation_reason") <> '' AND "cancelled_at" IS NOT NULL AND
          "cancelled_by_user_id" IS NOT NULL AND "completed_at" IS NULL) OR
        ("status" = 'COMPLETED' AND "cancellation_reason" IS NULL AND
          "cancelled_at" IS NULL AND "cancelled_by_user_id" IS NULL AND
          "completed_at" IS NOT NULL)
      )
);

CREATE INDEX "activity_schedule_templates_activity_window_id_idx"
  ON "activity_schedule_templates"("activity_id", "generation_start_date", "generation_end_date", "id");

CREATE UNIQUE INDEX "activity_sessions_activity_id_starts_at_key"
  ON "activity_sessions"("activity_id", "starts_at");
CREATE INDEX "activity_sessions_activity_id_status_starts_at_id_idx"
  ON "activity_sessions"("activity_id", "status", "starts_at", "id");
CREATE INDEX "activity_sessions_status_cutoff_starts_id_idx"
  ON "activity_sessions"("status", "booking_cutoff_at", "starts_at", "id");
CREATE INDEX "activity_sessions_schedule_template_id_starts_at_id_idx"
  ON "activity_sessions"("schedule_template_id", "starts_at", "id");
CREATE INDEX "activity_sessions_cancelled_by_user_id_cancelled_at_idx"
  ON "activity_sessions"("cancelled_by_user_id", "cancelled_at");

ALTER TABLE "activity_schedule_templates" ADD CONSTRAINT "activity_schedule_templates_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_schedule_template_id_fkey"
  FOREIGN KEY ("schedule_template_id") REFERENCES "activity_schedule_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_cancelled_by_user_id_fkey"
  FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
