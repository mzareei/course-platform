# Class Record — attendance, engagement, and per-class grading

Two tables per class session, on one screen the professor opens from Gradebook:
**Attendance and Engagement**, and **Class Grading**. Attendance and engagement
are deliberately shown apart from the grade — being in the room is not the same
as getting the answers right, and conflating them makes both harder to defend.

Alongside them, the QR code becomes the only way into a live class, because an
attendance table is worthless if a student can reach `/live` without scanning.

## Why the QR gate is part of this work

Today `course-session-join` validates a join code and returns `joined: true`
without writing anything. There is no check-in record at all. Worse, two paths
reach a live class with no scan:

1. `Today.tsx` renders a **Join class** button straight to `/live` whenever the
   session is live.
2. `selectLiveSessionId()` falls back to `firstLiveSessionId()`, so navigating
   to `/live` directly picks up any live session the student is enrolled in.

Removing the button alone leaves path 2 open. And the existing join memory is
`localStorage`, which is empty in private browsing and on a second device — so
the gate has to be **server-side**, keyed on an attendance row, or it is
decorative.

## Data

### `class_attendance`

One row per `(class_session_id, profile_id)`, unique on that pair. Written by
`course-session-join` with `on conflict do nothing`: **the first scan wins and
later scans never move the recorded time.** There is one QR code and one
check-in; the design does not have, and must not grow, a second scan.

| Column | Meaning |
|---|---|
| `checked_in_at` | First scan. Immutable in practice. |
| `source` | `qr` or `instructor` |
| `marked_by_profile_id` | Set when an instructor marked the student present |
| `note` | Why it was marked manually |

### `class_grade_overrides`

Append-only. The newest row for a `(class_session_id, profile_id)` pair is the
effective override; older rows stay as history. `reason` is `not null` and
5–1000 characters — an override without a written reason is not possible at the
database level, not merely discouraged in the UI.

### `class_sessions.late_after_minutes`

`int not null default 5`. Per session, because a class that starts slowly
warrants a different grace period than one that does not.

## Attendance status

Derived on read from `actual_start_at` (stamped when the session first goes
`live`) and `late_after_minutes`. Never stored, so correcting a start time
corrects every status with it.

| Status | Rule |
|---|---|
| **Present** | Checked in within `late_after_minutes` of the start |
| **Late** | Checked in after that |
| **Left early** | Checked in, but no quiz attempt **and** no reflection |
| **Absent** | No attendance row |

`Left early` only means the student stopped producing evidence before the end of
class. It is a prompt to look, not an accusation.

## Table 1 — Attendance and Engagement

Student name · student ID · QR check-in time · attendance status · number of
pulse responses · engagement percentage · last activity.

**Engagement = pulses answered ÷ pulses pushed in that class.** Whether the
answer was right is irrelevant here; correctness lives in the grading table.
When no pulses were pushed the cell reads `—`, never `0%` — a professor who
pushed no questions has not discovered thirty disengaged students.

`Last activity` is the latest of check-in, last pulse answer, quiz submission,
and reflection.

**Mark present** writes an attendance row with `source: 'instructor'` and a
required note. This is the safety valve for the dead phone and the broken
camera; without it, a failed projector locks the whole room out.

## Table 2 — Class Grading

Student name · student ID · pulse questions correct · total graded pulse
questions · final quiz questions correct · total final quiz questions · final
submission status · final class grade.

```
pulse_pct = pulse_correct / graded_pulses_pushed    (unanswered counts wrong)
quiz_pct  = quiz_correct  / quiz_questions
raw       = 0.30 × pulse_pct + 0.70 × quiz_pct
grade     = min(100, raw / MASTERY_THRESHOLD × 100)   MASTERY_THRESHOLD = 0.80
final     = reflection missing ? grade × 0.80 : grade
```

`MASTERY_THRESHOLD` is a named constant, not a count of allowed wrong answers.
The room for error is 20% of however many questions were actually asked — three
wrong out of fifteen and two wrong out of ten both land on 100.

Worked: raw 80% → 100. raw 60% → 75. raw 88% → 100, capped. raw 80% with no
reflection → 80.

Degenerate cases, which are common early in a semester:

- No graded pulses pushed → the quiz carries the full 100%.
- No quiz run → the pulses carry it.
- Neither → **no grade**, rendered `—`. Never 0; a class that graded nothing did
  not fail anybody.

The final submission is the written reflection (`exit_tickets`). It is required
but never graded for quality — its presence or absence is the entire signal.

Every row expands into a breakdown showing each component, its weight, the raw
subtotal, the scaling step, the penalty line, and the result, so a disputed
grade is answered by pointing at the screen.

## Override

The newest `class_grade_overrides` row wins. Rows are never updated or deleted,
so the history of a contested grade survives. The table shows the calculated
grade struck through beside the override, with the reason; the breakdown carries
the full history with actor and timestamp.

The calculated grade is always recomputed from live data — an override replaces
what is *reported*, never what was *computed*.

## Semester gradebook

Explicit **Post to gradebook** per class rather than automatic, so posting is a
decision made once the class has settled. It ensures a `Class grades` category,
a `gradebook_items` row for the session, and upserts `gradebook_scores` with the
effective grade, writing an `audit_log` entry each time. Re-posting after an
override updates in place.

## Surface

New route `/teach/class/:sessionId`, reached from Gradebook's per-class review.
New edge function `course-class-record` with actions `attendance`, `grading`,
`mark_present`, `override`, and `post_to_gradebook`. Grades are computed
**server-side only** — one implementation, not one per surface.

The two tables are separate components with client-side sorting.
`Gradebook.tsx` is already 444 lines and does not absorb this.

## Student-side changes

- `Today.tsx` drops the join button; a live class says to scan the QR code.
- `course-pulse { action: "current" }` returns `checked_in`, and `/live` shows
  the scan prompt when it is false. The server decides, not `localStorage`.
- Three doors lead into a live class, so all three are gated, via the shared
  `_shared/attendance.ts` guard: `course-pulse`'s `answer`,
  `course-activity-attempt`'s `start_attempt`, and `course-exit-ticket`'s
  submit. Gating only the pulse would leave the quiz and the reflection open.

`firstLiveSessionId()` was **kept**, contrary to the first draft of this design.
Deleting it would have made `/live` a dead end for a student whose stored join
was lost, showing "no class right now" when a class is very much running. With
the gate enforced on the server the fallback leaks nothing: it selects which
session to *ask about*, and the answer for a student who never scanned is the
scan prompt. Selection and authorisation are different jobs, and only the second
one belongs on the client's side of a trust boundary.

## Risk

This is the path that once shipped a build where students could not join a live
class at all (CLAUDE.md rule 1, pitfalls #1). The gate must be verified by
signing in as a student and scanning, not by navigating to `/live`. **Mark
present** is the recovery path if the QR fails in front of a live room.
