-- Content-origin audit — READ ONLY.
--
-- Run in the Supabase SQL editor for project ojmbupftdikwmlqvibwt, signed in as
-- the owner. Every statement here is a SELECT. Nothing is inserted, updated,
-- deleted, or altered. It is safe to run during class.
--
-- Produces the audit report described in docs/audits/2026-08-05-content-origin-audit.md:
--   slug/title, source_kind classification, source_ref, storage path,
--   whether an active release or class session uses it, and its question bank.
--
-- Paste the result of query 1 back into the audit document's "Production
-- inventory" table. Queries 2-5 are the cross-checks.

----------------------------------------------------------------------------- 1
-- The full per-item report.
with release_rollup as (
  select
    r.content_item_id,
    count(*)                                                as release_total,
    count(*) filter (where r.state = 'draft')               as release_draft,
    count(*) filter (
      where r.state in ('released', 'live', 'paused', 'review_only')
         or (r.state = 'scheduled' and coalesce(r.opens_at, now()) <= now())
    )                                                       as release_student_visible,
    count(*) filter (where r.class_session_id is not null)  as release_session_scoped,
    string_agg(distinct coalesce(s.section_code, 'whole course'), ', ')
      filter (
        where r.state in ('released', 'live', 'paused', 'review_only')
           or (r.state = 'scheduled' and coalesce(r.opens_at, now()) <= now())
      )                                                     as visible_to_groups
  from public.content_releases r
  left join public.course_sections s on s.id = r.section_id
  group by r.content_item_id
),
session_rollup as (
  select
    cs.content_item_id,
    count(*)                                                    as sessions_total,
    count(*) filter (where cs.state in ('open', 'live', 'paused', 'continued'))
                                                                as sessions_active,
    max(cs.planned_date)                                        as last_planned_date
  from public.class_sessions cs
  where cs.content_item_id is not null
  group by cs.content_item_id
),
bank_rollup as (
  select
    qb.content_item_id,
    count(*)                                                     as banks_total,
    count(*) filter (where qb.status = 'active')                 as banks_active,
    string_agg(distinct qb.checkpoint_preparation_state, ', ')   as checkpoint_states,
    sum((select count(*) from public.questions q
          where q.question_bank_id = qb.id and q.status = 'active')) as active_questions
  from public.question_banks qb
  where qb.content_item_id is not null
  group by qb.content_item_id
)
select
  ci.slug,
  ci.title,
  ci.content_type,
  ci.source_kind,
  -- Requirement 1 classification. 'other' catches anything the four known
  -- kinds do not cover, including a future constraint widening.
  case ci.source_kind
    when 'storage_object'  then 'storage_object'
    when 'static_path'     then 'static_path'
    when 'external_url'    then 'external_url'
    when 'supabase_record' then 'other (supabase_record)'
    else 'other (' || ci.source_kind || ')'
  end                                              as origin_class,
  ci.source_ref,
  case when ci.source_kind = 'storage_object' then ci.source_ref end
                                                   as storage_path,
  -- A storage_object whose path is not under the expected private prefix is a
  -- finding, not a formatting detail.
  case
    when ci.source_kind <> 'storage_object' then null
    when ci.source_ref like 'courses/' || ci.course_id || '/items/%' then 'expected prefix'
    else 'UNEXPECTED PREFIX'
  end                                              as storage_path_shape,
  coalesce(rr.release_total, 0)                    as releases_total,
  coalesce(rr.release_draft, 0)                    as releases_draft,
  coalesce(rr.release_student_visible, 0)          as releases_student_visible,
  coalesce(rr.release_session_scoped, 0)           as releases_session_scoped,
  rr.visible_to_groups,
  coalesce(sr.sessions_total, 0)                   as class_sessions_using_item,
  coalesce(sr.sessions_active, 0)                  as class_sessions_active_now,
  sr.last_planned_date,
  (coalesce(rr.release_student_visible, 0) > 0
     or coalesce(sr.sessions_active, 0) > 0)       as in_use_by_active_release_or_session,
  coalesce(br.banks_total, 0)                      as question_banks,
  coalesce(br.banks_active, 0)                     as question_banks_active,
  coalesce(br.active_questions, 0)                 as active_questions,
  br.checkpoint_states,
  (coalesce(br.banks_active, 0) > 0)               as has_question_bank,
  ci.generation_job_id is not null                 as ai_generated,
  ci.created_by                                    as created_by_profile_id,
  ci.created_at,
  ci.updated_at
from public.content_items ci
left join release_rollup rr on rr.content_item_id = ci.id
left join session_rollup  sr on sr.content_item_id = ci.id
left join bank_rollup     br on br.content_item_id = ci.id
where ci.course_id = 'tc2007b'
order by ci.content_type, ci.slug;

----------------------------------------------------------------------------- 2
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

----------------------------------------------------------------------------- 3
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

----------------------------------------------------------------------------- 4
-- Question banks whose content item is missing or whose checkpoint preparation
-- never completed. Publishing must preserve every one of these references.
select
  qb.id                as question_bank_id,
  qb.title             as bank_title,
  qb.status,
  qb.checkpoint_preparation_state,
  qb.content_item_id,
  ci.slug              as content_slug,
  (select count(*) from public.questions q
     where q.question_bank_id = qb.id and q.status = 'active') as active_questions
from public.question_banks qb
left join public.content_items ci on ci.id = qb.content_item_id
where qb.course_id = 'tc2007b'
order by (ci.slug is null) desc, qb.checkpoint_preparation_state, ci.slug;

----------------------------------------------------------------------------- 5
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
