# End-of-class quiz: visible timer, auto-close, and podium

## Decision

The end-of-class quiz gains a visible total countdown, a 30-second floor on
every question, two automatic closing conditions, and a ranking shown to both
the class and the professor.

Six changes, in the order a class meets them:

1. **Question timing is 30s by default, 45s for long questions.** The 20-second
   easy tier is removed. "Long" is measured by reading load — prompt plus
   answer choices — not by the generator's difficulty tag.
2. **The total quiz time is derived from the questions,** not a flat 10 minutes,
   and is shown to the professor as a live countdown inside the End of Class
   box.
3. **The quiz closes itself** when the countdown reaches zero, or when every
   student who checked in today has submitted — whichever comes first.
4. **A submission arriving within 60 seconds of the deadline is accepted** and
   marked `late`, rather than rejected.
5. **Each student sees their place** above the exit ticket: "You finished #7 of
   24." The top 3 also see a medal and a button to reveal their name.
6. **The professor sees a top-3 podium** by student ID, with a control that puts
   it fullscreen on the room's screen.

The existing grading, speed bonus, gradebook posting, reflection flow, and
class-grade calculation are unchanged. No question content, difficulty tag, or
selection logic changes.

## What is deliberately not built

- **The `/projector` route is not touched.** The `2026-08-04-single-screen-
  classroom` decision made Run Class the only teaching display; the room sees a
  fullscreen layer inside Run Class (`ClassroomQuestionLayer`), and nothing
  links to `/projector`. The podium follows the layer pattern that is actually
  in use.
- **`set_phase` stays unwired.** The presentation `phase` field exists on both
  sides and has never been called by anything. Building the podium through it
  would put the celebration on a screen the professor does not open.
- **No new gradebook entry.** Rank is a display of `score_final`, which is
  already computed and already folded into the class grade. Nothing about
  ranking is stored as a grade.

## Timing rule

New shared module `supabase/functions/_shared/question-timing.ts`, imported by
both edge functions so the rule exists once.

```
BASE_SECONDS      = 30
LONG_SECONDS      = 45
LONG_THRESHOLD    = 320   // characters
CUSHION_SECONDS   = 120

readingLoad(q) = max(
  len(q.prompt)    + sum(len(o.option_text)    for o in q.options),
  len(q.prompt_es) + sum(len(o.option_text_es) for o in q.options)   // when present
)

secondsForQuestion(q) = readingLoad(q) > LONG_THRESHOLD ? 45 : 30
```

Spanish is measured too, and the larger of the two wins: Spanish renders 15–20%
longer than English, and a student reading the Spanish version of a borderline
question must not get less time than the rule intends.

**Server stamps, client obeys.** `course-activity-attempt` attaches a `seconds`
field to every question it hands to a phone. `Player.tsx` reads that field
rather than holding a second copy of the rule — the two repos deploy
independently, so a duplicated constant would drift silently.

## Total quiz time

Computed once, at Start, in `course-class-quiz`:

```
totalSeconds = sum(the N longest-timed questions in the eligible pool)
             + CUSHION_SECONDS
             clamped to [60, 3600]
```

where N is `question_count`.

**Worst case, not average, on purpose.** The all-finished trigger means the
countdown is a backstop rather than the normal ending — in a class where
everyone submits, an over-generous total costs nothing at all. An under-generous
one cuts students off mid-question. The asymmetry is entirely one-sided, so the
estimate is sized for the student who happens to draw every long question.

Worst case for a 12-question quiz of all-long questions is 12 × 45 + 120 = 11
minutes; a typical mixed quiz lands near 8.

This requires `bankQuestionCounts` to fetch prompts and options, not just ids.
It runs once per quiz start, so the wider query is acceptable.

Stored in the fields that already exist: `activity_instances.time_limit_seconds`
and `ends_at`. `quizStatus` already returns `ends_at` — the instructor box
simply never displayed it.

## Auto-close

New shared module `supabase/functions/_shared/quiz-close.ts`, called from
`course-class-quiz` (`status`, `current`) and from `course-pulse`'s
`loadCurrentQuiz`. Running it on both polls means the close fires whether or not
the professor's laptop is awake.

```
maybeAutoClose(db, instance):
  if instance.state not in ['open','live','paused']: return unchanged

  present   = count(class_attendance
                    where class_session_id = instance.class_session_id
                      and attendance_date  = today)
  submitted = count(student_attempts
                    where activity_instance_id = instance.id
                      and status in ('submitted','late'))

  if present > 0 and submitted >= present:  close, reason 'everyone'
  if instance.ends_at and now >= ends_at:   close, reason 'time'
```

**The denominator is check-ins, not the roster.** `section_enrollments` includes
every absent student, so "everyone has finished" would be unreachable against
it. `class_attendance` scoped to `classDateFor()` is the same denominator the
pulse questions already use for their completeness check, and for the same
reason (pitfall recorded in 0048: a class resumed on a second day has one
attendance row per day, and counting all of them inflates the room).

A student who checked in but never opened the quiz blocks the `everyone`
trigger. That is correct — the quiz then ends on the timer instead.

**`closed_reason` is derived, not stored.** No migration for it: `status`
recomputes `submitted >= present` and reports `everyone` or `time`. The
professor's box uses it for one line of text; nothing depends on it later.

## Late-submission grace

Today `assertActivityOpen` rejects any submission after `ends_at`, with an
error. A student mid-question when the clock runs out loses every answer they
have given. Nobody has hit this because the deadline was invisible and
generous — a visible, tight, self-closing deadline makes it likely.

The instance still closes exactly at `ends_at`, so student screens move on to
the exit ticket immediately. The exception lives in the submit path only:

```
assertActivityOpenForSubmit(instance, attempt):
  accept when instance is open
  ALSO accept when instance is closed or past ends_at,
       and now <= ends_at + 60s,
       and attempt.started_at < ends_at
  -> the attempt is stored with status 'late'
```

`start_attempt` keeps the strict check: the grace is for finishing work already
begun, never for beginning new work.

**The phone submits into the grace.** `Player.tsx` already knows the instance's
`ends_at` — it arrives in `activity_instance` on `start_attempt` and is
currently ignored. When that deadline passes, the player stops advancing to new
questions and submits what the student has answered, landing inside the 60-second
window.

If the student has answered nothing at all, the player submits nothing and shows
the finished state instead. The server rejects an empty submission ("At least
one response is required"), so auto-submitting a blank attempt would put an
error on the phone of a student who simply never started.

This also makes the `late` status reachable for the first time — it exists in
the `student_attempts` check constraint and in the submit code, but the strict
gate always threw before it could be assigned.

## Ranking

Ranked by `score_final` descending, ties broken by `submitted_at` ascending.

`score_final` already folds in the speed bonus, so a faster correct answer wins
on its own without a separate tiebreak rule. Only attempts with status
`submitted` or `late` are ranked, so the "of 24" is the number who actually
finished — a student who opened the quiz and abandoned it is not ranked last,
they are not ranked at all.

Equal `score_final` values share a place (two students at #2, next student #4).

**Fewer than three, or a tie at the cut.** The podium shows however many ranked
students exist — two submissions produce a two-place podium, not an empty slot.
A tie spanning third place shows every student holding that place, so a podium
may carry four entries. Truncating to exactly three would silently drop a
student who earned the same score as the one shown.

### On the student's phone

`course-pulse`'s `loadCurrentQuiz` gains, when the instance is closed and the
caller has a ranked attempt:

```
my_rank: {
  rank: number,
  of: number,
  is_top3: boolean,
  attempt_id: uuid,       // so the phone can call set_name_reveal
  name_revealed: boolean
} | null
```

Rendered by a new `RankBanner` above the reflection card in `Live.tsx`:
"You finished #7 of 24." Top 3 get 🥇🥈🥉 and the reveal button.

The banner stays on screen after the reflection is submitted, above the class
grade on the "done" screen. A student who writes their paragraph quickly would
otherwise see their place for only a few seconds, and the reveal button would
vanish with it — which is exactly when a top-3 student is deciding whether to
say yes.

### On the professor's screen

New `podium` action on `course-class-quiz`, teacher-only:

```
input:  { class_session_id }          // resolves the latest closed instance
        or { activity_instance_id }
output: { instance_id, entries: [ {
           rank, student_identifier, score_final,
           name_revealed, name        // name is null unless name_revealed
         } ] }                        // top 3
```

The server withholds the name unless that student opted in — it is not sent and
hidden in the client.

## Name reveal

Migration `0053_quiz_name_reveal.sql`:

```sql
alter table public.student_attempts
  add column if not exists name_revealed boolean not null default false;
```

New student action on `course-activity-attempt`:

```
set_name_reveal { attempt_id, revealed: boolean }
```

Refused unless all three hold:
- the attempt belongs to the calling profile,
- the attempt is in the top 3 of its instance,
- the instance is closed.

A phone cannot talk its way onto the podium by calling this directly.

The flag lives on the attempt, not the profile, so consent is per quiz. A new
quiz starts anonymous again — which is the honest reading of "do you want your
name shown for *this*."

Reversible: a student may tap again to hide, and the podium reverts to their
student ID within one poll.

## Files

### Backend — `~/Documents/GitHub/mzareei.github.io`

| File | Change |
|---|---|
| `supabase/migrations/0053_quiz_name_reveal.sql` | new — `name_revealed` column |
| `supabase/functions/_shared/question-timing.ts` | new — the 30/45 rule and the total estimate |
| `supabase/functions/_shared/quiz-close.ts` | new — the shared auto-close check |
| `supabase/functions/course-class-quiz/index.ts` | total from question times; `present` and `closed_reason` in `status`; auto-close; new `podium` action |
| `supabase/functions/course-activity-attempt/index.ts` | per-question `seconds`; submit grace; new `set_name_reveal` action |
| `supabase/functions/course-pulse/index.ts` | auto-close on the student poll; `my_rank` in the quiz block |

Edge functions do not deploy on push — each changed function needs
`npx supabase functions deploy <name>`, and the migration needs
`npx supabase db push`.

### Frontend — `~/Documents/GitHub/course-platform`

| File | Change |
|---|---|
| `src/features/quiz/Player.tsx` | use the server's `seconds`; auto-submit at the instance deadline (see below) |
| `src/features/quiz/Podium.tsx` | new — shared top-3 rendering |
| `src/features/quiz/RankBanner.tsx` | new — the student's place and reveal button |
| `src/features/live/ClassroomPodiumLayer.tsx` | new — fullscreen podium for the room, mirroring `ClassroomQuestionLayer` |
| `src/screens/instructor/EndOfClass.tsx` | countdown, checked-in count, close reason, podium, fullscreen control |
| `src/screens/student/Live.tsx` | `RankBanner` above the reflection |
| `src/api/quiz.ts` | `podium`, `present`, `closed_reason`, `seconds` types |
| `src/api/pulse.ts` | `my_rank` type |
| `src/i18n/strings.ts` | every new string in EN + ES pairs |
| `src/styles/app.css` | podium and rank-banner styles |

## Acceptance criteria

**Timing**

- No question anywhere in the quiz is given fewer than 30 seconds.
- A question whose prompt plus options exceeds the reading threshold, in either
  language, is given 45 seconds.
- The per-question countdown on the phone matches the `seconds` the server sent
  for that question; the client holds no timing constants of its own.

**The total timer**

- The End of Class box shows a `M:SS` countdown that ticks every second and
  re-syncs to the server's `ends_at` on each poll.
- The total is at least the sum of the longest questions the student could draw,
  plus a two-minute cushion.
- The box shows submitted count against the number checked in today, not
  against the roster.

**Auto-close**

- The quiz closes on its own when the countdown reaches zero, with no instructor
  action. The close is driven by whichever poll arrives first — the instructor's
  or any student's — so a reloaded or backgrounded Run Class page does not hold
  the quiz open.
- The quiz closes on its own the moment the last checked-in student submits.
- A student who checked in but never opened the quiz does not prevent the timer
  from closing it.
- The box states which of the two conditions ended the quiz.
- Closing by hand still works at any time.

**Grace**

- A submission sent up to 60 seconds after the deadline is stored, graded, and
  marked `late` — not rejected.
- A student cannot *start* an attempt after the deadline.

**Student ranking**

- After the quiz closes, a student who submitted sees their exact place and the
  number of students ranked, above the exit ticket.
- A student who did not submit sees no rank, and the exit ticket still opens.
- Students placing 1st, 2nd, or 3rd see a medal and a reveal control.
- Tied scores show the same place.

**Podium**

- The End of Class box shows the top 3 by student ID with their scores as soon
  as the quiz closes.
- A control puts the podium fullscreen for the room; leaving fullscreen returns
  to Run Class. The room's screen never changes without the professor pressing
  it.
- A student's real name appears only after that student opts in, and disappears
  again if they opt out.
- The server never sends a name that has not been opted in.

**Everything else**

- Every new string exists in EN and ES; `npm run verify` passes.
- `npm run build` passes.
- Grades, the speed bonus, the class-grade calculation, and the gradebook are
  unchanged by this work.
