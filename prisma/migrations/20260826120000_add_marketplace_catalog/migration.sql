CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ActivityLocationType" AS ENUM ('ONSITE', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "ActivityMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "normalized_slug" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" SMALLINT NOT NULL DEFAULT 0,
    "search_text" TEXT GENERATED ALWAYS AS (
      LOWER("name" || ' ' || "slug" || ' ' || COALESCE("description", ''))
    ) STORED,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "categories_name_not_blank_check"
      CHECK (BTRIM("name") <> ''),
    CONSTRAINT "categories_normalized_slug_lowercase_check"
      CHECK ("normalized_slug" = LOWER("normalized_slug")),
    CONSTRAINT "categories_display_order_check"
      CHECK ("display_order" BETWEEN 0 AND 32767)
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "normalized_slug" VARCHAR(120) NOT NULL,
    "short_description" VARCHAR(500),
    "full_description" TEXT,
    "price_minor" BIGINT,
    "currency" CHAR(3),
    "duration_minutes" SMALLINT,
    "location_type" "ActivityLocationType",
    "venue_name" VARCHAR(160),
    "address_line_1" VARCHAR(200),
    "address_line_2" VARCHAR(200),
    "city" VARCHAR(120),
    "normalized_city" VARCHAR(120),
    "region" VARCHAR(120),
    "postal_code" VARCHAR(32),
    "country" CHAR(2),
    "online_url" VARCHAR(2048),
    "status" "ActivityStatus" NOT NULL DEFAULT 'DRAFT',
    "min_participants" SMALLINT,
    "max_participants" SMALLINT,
    "cancellation_policy" TEXT,
    "cancellation_window_minutes" INTEGER,
    "booking_cutoff_minutes" INTEGER,
    "search_text" TEXT GENERATED ALWAYS AS (
      LOWER(
        "title" || ' ' ||
        COALESCE("short_description", '') || ' ' ||
        COALESCE("full_description", '') || ' ' ||
        COALESCE("venue_name", '') || ' ' ||
        COALESCE("city", '') || ' ' ||
        COALESCE("region", '')
      )
    ) STORED,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activities_title_not_blank_check"
      CHECK (BTRIM("title") <> ''),
    CONSTRAINT "activities_normalized_slug_lowercase_check"
      CHECK ("normalized_slug" = LOWER("normalized_slug")),
    CONSTRAINT "activities_normalized_city_lowercase_check"
      CHECK (
        ("city" IS NULL AND "normalized_city" IS NULL) OR
        ("city" IS NOT NULL AND BTRIM("city") <> '' AND "normalized_city" IS NOT NULL AND
          "normalized_city" = LOWER("normalized_city"))
      ),
    CONSTRAINT "activities_price_minor_check"
      CHECK ("price_minor" IS NULL OR "price_minor" >= 0),
    CONSTRAINT "activities_currency_iso_shape_check"
      CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "activities_duration_minutes_check"
      CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0),
    CONSTRAINT "activities_country_iso_shape_check"
      CHECK ("country" IS NULL OR "country" ~ '^[A-Z]{2}$'),
    CONSTRAINT "activities_participant_range_check"
      CHECK (
        ("min_participants" IS NULL OR "min_participants" > 0) AND
        ("max_participants" IS NULL OR "max_participants" > 0) AND
        ("min_participants" IS NULL OR "max_participants" IS NULL OR
          "max_participants" >= "min_participants")
      ),
    CONSTRAINT "activities_cancellation_window_check"
      CHECK ("cancellation_window_minutes" IS NULL OR "cancellation_window_minutes" >= 0),
    CONSTRAINT "activities_booking_cutoff_check"
      CHECK ("booking_cutoff_minutes" IS NULL OR "booking_cutoff_minutes" >= 0),
    CONSTRAINT "activities_published_fields_check"
      CHECK (
        "status" <> 'PUBLISHED' OR (
          "short_description" IS NOT NULL AND BTRIM("short_description") <> '' AND
          "full_description" IS NOT NULL AND BTRIM("full_description") <> '' AND
          "price_minor" IS NOT NULL AND
          "currency" IS NOT NULL AND
          "duration_minutes" IS NOT NULL AND
          "location_type" IS NOT NULL AND
          "min_participants" IS NOT NULL AND
          "max_participants" IS NOT NULL AND
          "cancellation_policy" IS NOT NULL AND BTRIM("cancellation_policy") <> '' AND
          "cancellation_window_minutes" IS NOT NULL AND
          "booking_cutoff_minutes" IS NOT NULL AND
          "published_at" IS NOT NULL AND
          (
            ("location_type" = 'ONLINE' AND "online_url" IS NOT NULL AND
              BTRIM("online_url") <> '') OR
            ("location_type" = 'ONSITE' AND "address_line_1" IS NOT NULL AND
              BTRIM("address_line_1") <> '' AND "city" IS NOT NULL AND
              BTRIM("city") <> '' AND "country" IS NOT NULL) OR
            ("location_type" = 'HYBRID' AND "online_url" IS NOT NULL AND
              BTRIM("online_url") <> '' AND "address_line_1" IS NOT NULL AND
              BTRIM("address_line_1") <> '' AND "city" IS NOT NULL AND
              BTRIM("city") <> '' AND "country" IS NOT NULL)
          )
        )
      )
);

-- CreateTable
CREATE TABLE "activity_media" (
    "id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "type" "ActivityMediaType" NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "alt_text" VARCHAR(240),
    "display_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_media_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activity_media_display_order_check"
      CHECK ("display_order" BETWEEN 0 AND 32767)
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_normalized_slug_key" ON "categories"("normalized_slug");
CREATE INDEX "categories_is_active_display_order_name_id_idx"
  ON "categories"("is_active", "display_order", "name", "id");
CREATE INDEX "categories_search_text_trgm_idx"
  ON "categories" USING GIN ("search_text" gin_trgm_ops);

CREATE UNIQUE INDEX "activities_provider_id_normalized_slug_key"
  ON "activities"("provider_id", "normalized_slug");
CREATE INDEX "activities_provider_id_status_created_at_id_idx"
  ON "activities"("provider_id", "status", "created_at", "id");
CREATE INDEX "activities_provider_id_status_price_minor_id_idx"
  ON "activities"("provider_id", "status", "price_minor", "id");
CREATE INDEX "activities_provider_id_status_title_id_idx"
  ON "activities"("provider_id", "status", "title", "id");
CREATE INDEX "activities_provider_id_status_duration_minutes_id_idx"
  ON "activities"("provider_id", "status", "duration_minutes", "id");
CREATE INDEX "activities_status_published_at_id_idx"
  ON "activities"("status", "published_at", "id");
CREATE INDEX "activities_status_currency_price_minor_id_idx"
  ON "activities"("status", "currency", "price_minor", "id");
CREATE INDEX "activities_status_title_id_idx"
  ON "activities"("status", "title", "id");
CREATE INDEX "activities_status_duration_minutes_id_idx"
  ON "activities"("status", "duration_minutes", "id");
CREATE INDEX "activities_status_category_id_published_at_id_idx"
  ON "activities"("status", "category_id", "published_at", "id");
CREATE INDEX "activities_status_provider_id_published_at_id_idx"
  ON "activities"("status", "provider_id", "published_at", "id");
CREATE INDEX "activities_status_location_published_at_id_idx"
  ON "activities"("status", "location_type", "country", "normalized_city", "published_at", "id");
CREATE INDEX "activities_search_text_trgm_idx"
  ON "activities" USING GIN ("search_text" gin_trgm_ops);

CREATE INDEX "activity_media_activity_id_display_order_id_idx"
  ON "activity_media"("activity_id", "display_order", "id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_media" ADD CONSTRAINT "activity_media_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
