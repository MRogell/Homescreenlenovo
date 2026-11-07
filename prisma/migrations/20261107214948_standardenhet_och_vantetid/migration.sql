-- AlterTable
ALTER TABLE "connection" ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "provider_backoff" (
    "provider" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "until" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "provider_backoff_pkey" PRIMARY KEY ("provider")
);
