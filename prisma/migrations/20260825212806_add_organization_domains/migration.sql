-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EmployerMembershipRole" AS ENUM ('ADMIN', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProviderMembershipRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateTable
CREATE TABLE "employers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "normalized_slug" VARCHAR(120) NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PENDING',
    "country" CHAR(2) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "default_currency" CHAR(3) NOT NULL,
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(32),
    "website_url" VARCHAR(2048),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_memberships" (
    "id" UUID NOT NULL,
    "employer_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "EmployerMembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employer_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "employer_id" UUID NOT NULL,
    "user_id" UUID,
    "email" VARCHAR(320) NOT NULL,
    "normalized_email" VARCHAR(320) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "employee_number" VARCHAR(80),
    "department" VARCHAR(120),
    "job_title" VARCHAR(120),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" UUID NOT NULL,
    "business_name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "normalized_slug" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PENDING',
    "country" CHAR(2) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(32),
    "website_url" VARCHAR(2048),
    "commission_rate_bps" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_memberships" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ProviderMembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employers_normalized_slug_key" ON "employers"("normalized_slug");

-- CreateIndex
CREATE INDEX "employers_status_name_id_idx" ON "employers"("status", "name", "id");

-- CreateIndex
CREATE INDEX "employers_country_status_idx" ON "employers"("country", "status");

-- CreateIndex
CREATE INDEX "employer_memberships_user_id_status_role_idx" ON "employer_memberships"("user_id", "status", "role");

-- CreateIndex
CREATE INDEX "employer_memberships_employer_id_role_status_idx" ON "employer_memberships"("employer_id", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employer_memberships_employer_id_user_id_key" ON "employer_memberships"("employer_id", "user_id");

-- CreateIndex
CREATE INDEX "employees_employer_id_status_last_name_first_name_id_idx" ON "employees"("employer_id", "status", "last_name", "first_name", "id");

-- CreateIndex
CREATE INDEX "employees_user_id_status_idx" ON "employees"("user_id", "status");

-- CreateIndex
CREATE INDEX "employees_employer_id_department_status_idx" ON "employees"("employer_id", "department", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employer_id_normalized_email_key" ON "employees"("employer_id", "normalized_email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employer_id_user_id_key" ON "employees"("employer_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employer_id_employee_number_key" ON "employees"("employer_id", "employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "providers_normalized_slug_key" ON "providers"("normalized_slug");

-- CreateIndex
CREATE INDEX "providers_status_business_name_id_idx" ON "providers"("status", "business_name", "id");

-- CreateIndex
CREATE INDEX "providers_country_status_idx" ON "providers"("country", "status");

-- CreateIndex
CREATE INDEX "provider_memberships_user_id_status_role_idx" ON "provider_memberships"("user_id", "status", "role");

-- CreateIndex
CREATE INDEX "provider_memberships_provider_id_role_status_idx" ON "provider_memberships"("provider_id", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_memberships_provider_id_user_id_key" ON "provider_memberships"("provider_id", "user_id");

-- AddForeignKey
ALTER TABLE "employer_memberships" ADD CONSTRAINT "employer_memberships_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_memberships" ADD CONSTRAINT "employer_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_memberships" ADD CONSTRAINT "provider_memberships_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_memberships" ADD CONSTRAINT "provider_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
