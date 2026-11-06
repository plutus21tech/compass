-- A saved draft's title, minutes and headline wait here until publish. Additive and nullable.
ALTER TABLE "OnboardingModule" ADD COLUMN "draftDetails" JSONB;
