ALTER TABLE "employers"
  ADD CONSTRAINT "employers_normalized_slug_lowercase_check"
    CHECK ("normalized_slug" = LOWER("normalized_slug")),
  ADD CONSTRAINT "employers_country_iso_shape_check"
    CHECK ("country" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "employers_currency_iso_shape_check"
    CHECK ("default_currency" ~ '^[A-Z]{3}$');

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_normalized_email_lowercase_check"
    CHECK ("normalized_email" = LOWER("normalized_email"));

ALTER TABLE "providers"
  ADD CONSTRAINT "providers_normalized_slug_lowercase_check"
    CHECK ("normalized_slug" = LOWER("normalized_slug")),
  ADD CONSTRAINT "providers_country_iso_shape_check"
    CHECK ("country" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "providers_commission_rate_bps_check"
    CHECK ("commission_rate_bps" BETWEEN 0 AND 10000);
