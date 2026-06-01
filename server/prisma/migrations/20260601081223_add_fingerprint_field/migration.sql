-- AlterTable
ALTER TABLE "Hotspot" ADD COLUMN "fingerprint" TEXT;

-- CreateIndex
CREATE INDEX "Hotspot_fingerprint_idx" ON "Hotspot"("fingerprint");
