-- Content-origin audit — READ ONLY. Safe to run at any time, including during
-- class. Every statement is a SELECT: nothing is inserted, updated or deleted.
--
-- Run this file on its own in the Supabase SQL editor and send back the result
-- table. Splitting the audit into one file per question means each Run produces
-- exactly one result, so nothing gets lost when only the last table is shown.
--
-- Every content item: what it is, where it comes from, whether students can
-- open it right now, and whether it has a question bank.
--
-- Deliberately narrow. The first draft returned 25 columns, which is correct
-- and unreadable — 27 rows of it cannot be pasted back into a conversation.
-- Everything dropped here is recoverable from the other four files.

select
  ci.slug,
  ci.title,
  ci.content_type,

  -- Origin, in the four classes the audit asks for.
  case ci.source_kind
    when 'storage_object'  then 'private storage'
    when 'static_path'     then 'PUBLIC PATH'
    when 'external_url'    then 'external url'
    when 'supabase_record' then 'database record'
    else 'other: ' || ci.source_kind
  end as origin,

  -- Can a student open it today? A release is student-visible when it is
  -- released/live/paused/review_only, or scheduled with opens_at already past.
  case when exists (
    select 1 from public.content_releases r
     where r.content_item_id = ci.id
       and (r.state in ('released', 'live', 'paused', 'review_only')
            or (r.state = 'scheduled' and coalesce(r.opens_at, now()) <= now()))
  ) then 'YES' else 'no' end as students_can_open,

  -- Which groups, or whole course. Null when nothing is visible.
  (select string_agg(distinct coalesce(s.section_code, 'whole course'), ', ')
     from public.content_releases r
     left join public.course_sections s on s.id = r.section_id
    where r.content_item_id = ci.id
      and (r.state in ('released', 'live', 'paused', 'review_only')
           or (r.state = 'scheduled' and coalesce(r.opens_at, now()) <= now()))
  ) as visible_to,

  -- Attached to a class day that has not finished.
  (select count(*) from public.class_sessions cs
    where cs.content_item_id = ci.id
      and cs.state in ('open', 'live', 'paused', 'continued')
  ) as in_an_open_class,

  -- Question bank, and how far checkpoint preparation got.
  (select count(*) from public.question_banks qb
    where qb.content_item_id = ci.id and qb.status = 'active'
  ) as active_banks,
  (select sum((select count(*) from public.questions q
                where q.question_bank_id = qb.id and q.status = 'active'))
     from public.question_banks qb
    where qb.content_item_id = ci.id and qb.status = 'active'
  ) as active_questions,
  (select string_agg(distinct qb.checkpoint_preparation_state, ', ')
     from public.question_banks qb
    where qb.content_item_id = ci.id
  ) as checkpoints,

  -- Who the database currently thinks made it. Expected to be empty for the
  -- migrated items: register_item never set it. That is why ownership has to
  -- be assigned rather than recovered.
  case when ci.created_by is null then 'nobody recorded' else 'recorded' end as author,
  case when ci.generation_job_id is null then 'hand-authored' else 'AI-generated' end as made_by

from public.content_items ci
where ci.course_id = 'tc2007b'
order by ci.content_type, ci.slug;
