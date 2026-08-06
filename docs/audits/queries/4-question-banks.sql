-- Content-origin audit — READ ONLY. Safe to run at any time, including during
-- class. Every statement is a SELECT: nothing is inserted, updated or deleted.
--
-- Run this file on its own in the Supabase SQL editor and send back the result
-- table. Splitting the audit into one file per question means each Run produces
-- exactly one result, so nothing gets lost when only the last table is shown.
--
-- Every question bank, its content item, and how far checkpoint preparation got.

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
