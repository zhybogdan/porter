-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_replaced_by_key" ON "sessions"("replaced_by");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_by_fkey" FOREIGN KEY ("replaced_by") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express a CHECK constraint.
--
-- Rotation issues the new token and revokes the old one in the same move. A
-- row that points at its successor while still being usable would mean two
-- live tokens out of one rotation, which is the state reuse detection exists
-- to make impossible. The rule lives here so that a service doing one of the
-- two writes and not the other fails loudly instead of leaving a second
-- usable token behind.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_is_revoked"
  CHECK ("replaced_by" IS NULL OR "revoked_at" IS NOT NULL);

-- A rotation chain cannot start at itself: walking one would never end.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_by_not_self"
  CHECK ("replaced_by" IS DISTINCT FROM "id");
