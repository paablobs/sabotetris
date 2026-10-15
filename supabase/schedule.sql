-- Run as postgres in the SQL Editor AFTER the migration. Safe to run again.
-- This deletes only expired application data and anonymous guests tracked by
-- Sabotetris after 30 days without a ranked start/submission. Public records stay.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'sabotetris-cleanup';
select cron.schedule('sabotetris-cleanup', '17 3 * * *', 'select public.cleanup_ranked_data()');
