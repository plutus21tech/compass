-- Every project gets a Backlog section again. Some projects lost theirs after
-- the 2026-07-31 backfill (a lead deleted it), so add one back, first on the
-- board. Projects that already have a Backlog are left untouched.

CREATE TEMP TABLE "_projects_missing_backlog" AS
SELECT project."id"
FROM "Project" AS project
WHERE NOT EXISTS (
  SELECT 1 FROM "TaskSection" AS section
  WHERE section."projectId" = project."id" AND section."isBacklog" = true
);

-- A section still named "Backlog" (any case/punctuation) becomes the Backlog,
-- keeping its tasks. Only the first per project, for the one-backlog index.
WITH named AS (
  SELECT DISTINCT ON (section."projectId") section."id"
  FROM "TaskSection" AS section
  JOIN "_projects_missing_backlog" AS missing ON missing."id" = section."projectId"
  WHERE regexp_replace(lower(section."name"), '[^a-z0-9]', '', 'g') = 'backlog'
  ORDER BY section."projectId", section."orderIndex", section."createdAt", section."id"
)
UPDATE "TaskSection" AS section
SET
  "name" = 'Backlog',
  "canonicalStatus" = 'TODO'::"TaskStatus",
  "isDefault" = true,
  "isDone" = false,
  "isBacklog" = true,
  "color" = COALESCE(NULLIF(section."color", ''), '#64748b')
FROM named
WHERE section."id" = named."id";

-- Same migration-only id style as 20260731120000.
INSERT INTO "TaskSection" (
  "id", "projectId", "name", "color", "canonicalStatus",
  "isDefault", "isDone", "isBacklog", "orderIndex", "createdAt"
)
SELECT
  'backlog_' || md5(missing."id" || clock_timestamp()::text || random()::text),
  missing."id", 'Backlog', '#64748b', 'TODO'::"TaskStatus",
  true, false, true, 0, CURRENT_TIMESTAMP
FROM "_projects_missing_backlog" AS missing
WHERE NOT EXISTS (
  SELECT 1 FROM "TaskSection" AS section
  WHERE section."projectId" = missing."id" AND section."isBacklog" = true
);

-- Backlog first; the other sections keep their relative order. Only the
-- projects changed here are renumbered.
WITH ordered_sections AS (
  SELECT
    section."id",
    row_number() OVER (
      PARTITION BY section."projectId"
      ORDER BY
        CASE WHEN section."isBacklog" = true THEN 0 ELSE 1 END,
        section."orderIndex" ASC, section."createdAt" ASC, section."id" ASC
    ) - 1 AS new_order_index
  FROM "TaskSection" AS section
  JOIN "_projects_missing_backlog" AS missing ON missing."id" = section."projectId"
)
UPDATE "TaskSection" AS section
SET "orderIndex" = ordered.new_order_index::INTEGER
FROM ordered_sections AS ordered
WHERE section."id" = ordered."id";

DROP TABLE "_projects_missing_backlog";
