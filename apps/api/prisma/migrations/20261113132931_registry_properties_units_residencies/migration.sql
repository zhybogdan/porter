-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "org_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "residencies" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "org_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "moved_in_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moved_out_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "residencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_org_id_idx" ON "properties"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_id_org_id_key" ON "properties"("id", "org_id");

-- CreateIndex
CREATE INDEX "units_org_id_idx" ON "units"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_property_id_label_key" ON "units"("property_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "units_id_org_id_key" ON "units"("id", "org_id");

-- CreateIndex
CREATE INDEX "residencies_org_id_idx" ON "residencies"("org_id");

-- CreateIndex
CREATE INDEX "residencies_unit_id_idx" ON "residencies"("unit_id");

-- CreateIndex
CREATE INDEX "residencies_user_id_idx" ON "residencies"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_org_id_key" ON "users"("id", "org_id");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_org_id_fkey" FOREIGN KEY ("property_id", "org_id") REFERENCES "properties"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residencies" ADD CONSTRAINT "residencies_unit_id_org_id_fkey" FOREIGN KEY ("unit_id", "org_id") REFERENCES "units"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residencies" ADD CONSTRAINT "residencies_user_id_org_id_fkey" FOREIGN KEY ("user_id", "org_id") REFERENCES "users"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
