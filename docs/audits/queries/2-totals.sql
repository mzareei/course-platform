-- Content-origin audit — READ ONLY. Safe to run at any time, including during
-- class. Every statement is a SELECT: nothing is inserted, updated or deleted.
--
-- Run this file on its own in the Supabase SQL editor and send back the result
-- table. Splitting the audit into one file per question means each Run produces
-- exactly one result, so nothing gets lost when only the last table is shown.
--
-- How many items of each kind and origin.

-- Origin totals. Compare against the repository-derived expectation in the
-- audit document (23 migrated storage objects + generated//other items).
select
  source_kind,
  content_type,
  count(*) as items
from public.content_items
where course_id = 'tc2007b'
group by source_kind, content_type
order by source_kind, content_type;
