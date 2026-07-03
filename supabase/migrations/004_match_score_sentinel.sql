-- Allow -1 as the "not scored by AI" sentinel on matches.match_score.
-- The app inserts -1 when a user manually tracks a job the agent hasn't scored,
-- but the original check constraint (0..100) rejects it. Idempotent.

alter table matches drop constraint if exists matches_match_score_check;
alter table matches add constraint matches_match_score_check check (match_score between -1 and 100);
