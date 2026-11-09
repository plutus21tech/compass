-- Team tags move from the "TeamTag" enum to an HR-managed table, so a new
-- country (starting with Bosnia) needs no deploy.
--
-- Lossless: every column keeps its values. The enum labels are exactly the codes
-- seeded below, so `::text` turns each stored value into the matching code, and
-- the foreign key on "User"."teamTag" is added only after the seed exists.

-- 1. The definitions table.
CREATE TABLE "TeamTagDefinition" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "shortLabel" TEXT,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamTagDefinition_pkey" PRIMARY KEY ("code")
);

-- 2. Seed the eight existing tags with today's labels and display order, plus
-- Bosnia. The two 3E teams are the only ones outside "Plutus21 Internal Team".
INSERT INTO "TeamTagDefinition" ("code", "label", "shortLabel", "isInternal", "sortOrder", "updatedAt") VALUES
    ('PAKISTAN',         'Pakistan Team',     'PK',    true,  10, CURRENT_TIMESTAMP),
    ('MOROCCO',          'Morocco Team',      'MA',    true,  20, CURRENT_TIMESTAMP),
    ('COLOMBIA',         'Colombia Team',     'CO',    true,  30, CURRENT_TIMESTAMP),
    ('INDONESIA',        'Indonesia Team',    'ID',    true,  40, CURRENT_TIMESTAMP),
    ('ECUADOR',          'Ecuador Team',      'EC',    true,  50, CURRENT_TIMESTAMP),
    ('NOBLE',            'Noble Team',        'NB',    true,  60, CURRENT_TIMESTAMP),
    ('BOSNIA',           'Bosnia Team',       'BA',    true,  70, CURRENT_TIMESTAMP),
    ('THREE_E_PAKISTAN', '3E Pakistan Team',  '3E PK', false, 80, CURRENT_TIMESTAMP),
    ('THREE_E_MOROCCO',  '3E Morocco Team',   '3E MA', false, 90, CURRENT_TIMESTAMP);

-- 3. Convert every enum column to text, values preserved.
ALTER TABLE "User" ALTER COLUMN "teamTag" TYPE TEXT USING "teamTag"::text;
ALTER TABLE "PayrollPublicHoliday" ALTER COLUMN "teamTags" TYPE TEXT[] USING "teamTags"::text[];
ALTER TABLE "HandbookPage" ALTER COLUMN "intentionalGapTeams" TYPE TEXT[] USING "intentionalGapTeams"::text[];
ALTER TABLE "HandbookAudience" ALTER COLUMN "team" TYPE TEXT USING "team"::text;

-- 4. Nothing references the enum any more.
DROP TYPE "TeamTag";

-- 5. A user's tag must be a known definition. Restrict, because definitions are
-- archived rather than deleted.
ALTER TABLE "User" ADD CONSTRAINT "User_teamTag_fkey"
    FOREIGN KEY ("teamTag") REFERENCES "TeamTagDefinition"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Bosnia is an internal team, so every handbook variant already written for
-- "Plutus21 Internal" or "Everyone" (it covers all six existing internal teams)
-- reaches Bosnia too -- the same backfill Ecuador got. Country-specific variants
-- are left alone; Bosnia simply has no tailored content until HR writes some.
INSERT INTO "HandbookAudience" ("variantId", "team")
SELECT v."id", 'BOSNIA'
FROM "HandbookVariant" v
WHERE (
  SELECT COUNT(DISTINCT a."team")
  FROM "HandbookAudience" a
  WHERE a."variantId" = v."id"
    AND a."team" IN ('PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA', 'ECUADOR', 'NOBLE')
) = 6
AND NOT EXISTS (
  SELECT 1 FROM "HandbookAudience" a
  WHERE a."variantId" = v."id" AND a."team" = 'BOSNIA'
);
