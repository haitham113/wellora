-- Preserve the newest usable token if historical concurrent issuance created duplicates.
WITH "ranked_active_tokens" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "user_id", "type"
      ORDER BY "created_at" DESC, "id" DESC
    ) AS "active_rank"
  FROM "one_time_tokens"
  WHERE "used_at" IS NULL AND "revoked_at" IS NULL
)
UPDATE "one_time_tokens" AS "token"
SET "revoked_at" = CURRENT_TIMESTAMP
FROM "ranked_active_tokens" AS "ranked"
WHERE "token"."id" = "ranked"."id"
  AND "ranked"."active_rank" > 1;

-- PostgreSQL enforces the single-active-token invariant independently of application code.
CREATE UNIQUE INDEX "one_time_tokens_one_active_per_user_type_key"
ON "one_time_tokens" ("user_id", "type")
WHERE "used_at" IS NULL AND "revoked_at" IS NULL;
