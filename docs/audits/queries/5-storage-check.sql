-- Content-origin audit — READ ONLY. Safe to run at any time, including during
-- class. Every statement is a SELECT: nothing is inserted, updated or deleted.
--
-- Run this file on its own in the Supabase SQL editor and send back the result
-- table. Splitting the audit into one file per question means each Run produces
-- exactly one result, so nothing gets lost when only the last table is shown.
--
-- Already run: what the database says vs what the bucket holds.

-- Storage inventory as the database understands it, next to what the bucket
-- actually holds. Run the second half only if storage.objects is readable from
-- the SQL editor; otherwise list the bucket with
--   npx supabase storage ls ss://course-content/courses/tc2007b/items --recursive
select 'content_items' as side, source_ref as path
from public.content_items
where course_id = 'tc2007b' and source_kind = 'storage_object'
union all
select 'storage.objects', name
from storage.objects
where bucket_id = 'course-content'
  and name like 'courses/tc2007b/items/%'
order by path, side;
