-- Two rules for residencies that schema.prisma cannot express, written by hand.

-- One current residency per resident per unit. Moving in again after moving
-- out is allowed -- the old row keeps its `moved_out_at` and stays as history
-- -- and so is living in two units at once (decided 22.11.2026: a person can
-- own two flats in one complex). What is refused is the same person moved
-- into the same unit twice, which is what two managers pressing "add" at once
-- would otherwise produce.
--
-- Partial, because a plain unique index on (unit_id, user_id) would also
-- forbid the history: one past row and one current row for the same pair are
-- both legitimate.
CREATE UNIQUE INDEX "residencies_unit_id_user_id_current_key"
  ON "residencies" ("unit_id", "user_id")
  WHERE "moved_out_at" IS NULL;

-- Nobody moves out before moving in. A row that says so would put a
-- resident's history in the wrong order, and every later question about who
-- lived where on a given day would read it wrong.
ALTER TABLE "residencies"
  ADD CONSTRAINT "residencies_moved_out_after_in"
  CHECK ("moved_out_at" IS NULL OR "moved_out_at" >= "moved_in_at");
