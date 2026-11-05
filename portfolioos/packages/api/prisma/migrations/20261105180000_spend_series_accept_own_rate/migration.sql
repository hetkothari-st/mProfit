-- Step-change answer on a recurring payment (personal inflation engine, spec §6.2).
ALTER TABLE "SpendRecurringSeries" ADD COLUMN "acceptOwnRate" BOOLEAN NOT NULL DEFAULT false;
