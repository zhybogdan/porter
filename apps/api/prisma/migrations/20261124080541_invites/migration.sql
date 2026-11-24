-- CreateTable
CREATE TABLE "invites" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "org_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "unit_id" UUID,
    "invited_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invites_code_hash_key" ON "invites"("code_hash");

-- CreateIndex
CREATE INDEX "invites_org_id_idx" ON "invites"("org_id");

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_org_id_fkey" FOREIGN KEY ("invited_by", "org_id") REFERENCES "users"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_unit_id_org_id_fkey" FOREIGN KEY ("unit_id", "org_id") REFERENCES "units"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express a CHECK constraint.

-- No invite makes a manager. A manager who can mint managers can hand the
-- whole organization to whoever holds a code, and a code is a string that
-- travels by chat. Managers come from the seed or from whoever runs the
-- installation, not from this endpoint.
ALTER TABLE "invites" ADD CONSTRAINT "invites_role_not_manager"
  CHECK ("role" <> 'manager');

-- A unit only on a resident's invite. A technician moved into a flat on
-- accept would be a residency nobody asked for, and would let them see the
-- building as a resident does.
ALTER TABLE "invites" ADD CONSTRAINT "invites_unit_only_for_resident"
  CHECK ("unit_id" IS NULL OR "role" = 'resident');

-- The same rule `users.email` holds, for the same reason: accept copies this
-- address into `users`, and a mixed-case one would be refused there only
-- after the code had been spent.
ALTER TABLE "invites" ADD CONSTRAINT "invites_email_lowercase"
  CHECK ("email" = lower("email"));
