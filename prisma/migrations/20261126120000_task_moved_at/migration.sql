-- When a task last changed section. Board columns other than To Do and Backlog
-- show the most recently moved-in task first.
ALTER TABLE "Task" ADD COLUMN "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing tasks have no move history; their last update is the closest guess.
UPDATE "Task" SET "movedAt" = "updatedAt";
