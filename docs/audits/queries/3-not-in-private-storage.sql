-- Content-origin audit — READ ONLY. Safe to run at any time, including during
-- class. Every statement is a SELECT: nothing is inserted, updated or deleted.
--
-- Run this file on its own in the Supabase SQL editor and send back the result
-- table. Splitting the audit into one file per question means each Run produces
-- exactly one result, so nothing gets lost when only the last table is shown.
--
-- Items that are NOT stored privately — these may still point at a public path.

-- Items that are NOT storage-backed. These are the ones that may still resolve
-- to a public GitHub Pages path or an external host at delivery time.
select
  slug,
  title,
  content_type,
  source_kind,
  source_ref
from public.content_items
where course_id = 'tc2007b'
  and source_kind <> 'storage_object'
order by source_kind, slug;
