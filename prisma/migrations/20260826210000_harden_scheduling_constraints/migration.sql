-- Keep a materialized session and its recurrence template in the same activity.
-- Restrictive deletion preserves generation provenance for existing sessions.
ALTER TABLE "activity_sessions"
  DROP CONSTRAINT "activity_sessions_schedule_template_id_fkey";

CREATE UNIQUE INDEX "activity_schedule_templates_id_activity_id_key"
  ON "activity_schedule_templates"("id", "activity_id");

ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_schedule_template_id_activity_id_fkey"
  FOREIGN KEY ("schedule_template_id", "activity_id")
  REFERENCES "activity_schedule_templates"("id", "activity_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
