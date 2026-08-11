# Unmanaged Content Items and Force-Delete

## Background

Deployed earlier the same day: real delete actions for class sessions,
question banks, and content items, each refusing outright when the schema
shows real recorded activity (a live-question history, a recorded student
answer, a recorded quiz attempt) rather than silently losing it. Using it in
practice surfaced two gaps:

1. **A content item can be invisible, not just refused.** A bank-only JSON
   import (no accompanying deck) creates a `content_items` row with
   `content_type: "quiz_bank"` and `source_kind: "supabase_record"`. The
   Content Library screen filters its entire list through
   `canReleaseToReview()`, which excludes exactly that shape — the row exists
   in the database but never renders a card, so there is no Delete button to
   click at all. "The course has no content" is what the screen shows even
   though cleanup is exactly what's needed.
2. **The refuse-outright design is too strict for its own stated purpose.**
   The three delete actions exist to clear accumulated test/QA data. Some of
   that test data includes real-looking recorded activity — a pulse question
   actually answered, a quiz actually submitted — because it was created
   while testing the platform itself. Today that data can never be removed
   through these actions. The professor wants a way past that, deliberately
   gated so it can't happen by mistake.

## 1. Unmanaged items section (Content Library)

`ContentLibraryView` currently computes one list, `reviewableItems`, and
returns a plain empty-state if it's empty — regardless of whether other,
non-reviewable items exist.

Add a second list, computed the same way the existing per-item gates already
work:

```
unmanagedItems = library.content_items.filter(item =>
  !canReleaseToReview(item) && item.can_edit !== false && !item.is_shared_with_me
)
```

Render it as its own small section, below the existing reviewable-item cards,
present whenever `unmanagedItems.length > 0` (independent of whether
`reviewableItems` is also empty — the top-level empty-state now only shows
when *both* lists are empty). Each row: title, a Delete button, an inline
error line — no Make available / Sync / Share / Assign controls, since none
of those apply to something with no student-facing form. The confirm dialog
reuses the existing `content.library.deleteConfirm` string and the existing
`releasesByItem` map already computed in this component (keyed by
`content_item_id` across *all* items, not just reviewable ones) to name an
accurate release count — no new data fetch needed.

This is additive only: nothing about the existing reviewable-item cards,
filters, or actions changes.

## 2. Force-delete

### The line: bypasses history, never bypasses "right now"

Force-delete exists to remove one specific class of refusal: a delete
blocked because the target has *past* recorded activity. It must never
weaken a refusal about something happening *right now*:

| Guard | Force bypasses it? |
| --- | --- |
| Session state must be planned/cancelled/closed (never live) | **No** |
| Session has any `pulse_rounds` (recorded live-question history) | **Yes** |
| Bank's plan belongs to a currently live/open/paused/continued session | **No** |
| Bank has recorded `student_responses` | **Yes** |
| Bank's plan-checkpoints were ever actually sent live | **Yes** (same historical-activity class as the row above) |
| Content item is currently released/visible to students | **No** |
| Content item has an *active* question bank attached (the existing DB trigger) | **No** — stays a two-step flow: force-delete the bank first, then the item |
| Content item has recorded `activity_instances` (quiz history) | **Yes** |

The two "No" rows that aren't about historical data (currently-live session,
currently-live bank usage, currently-visible content) are about disrupting
something happening at this moment, a different and unrelated risk that force
must not touch. The active-bank trigger is deliberately left alone rather
than taught a bypass — the existing "delete the bank, then the item" order
already available today is the correct way through it, using bank
force-delete on its own if the bank itself has history.

### What force actually does, per entity

**Class session** (`delete_class_session_atomic`, extended with a
`p_force boolean default false` parameter — the existing 2-arg SQL function
is dropped and replaced, since Postgres treats a different parameter list as
a new overload, not a replacement): when `p_force`, skip the
`pulse_rounds`-exists check and instead explicitly
`delete from pulse_rounds where class_session_id = p_session_id` *before*
deleting `class_question_plans`. This ordering matters: deleting
`class_question_plans` cascades to its checkpoints, and
`pulse_rounds.plan_checkpoint_id` is a real `on delete restrict` — if the
session's own pulse rounds weren't already gone, that restrict would still
fire even though those very rows are about to be removed a step later by the
session's own cascade. Explicitly clearing them first avoids that ordering
trap.

**Question bank** (`delete_question_bank_atomic`, same
drop-and-replace-with-`p_force`): when `p_force`, skip the
live-class-in-use check (that one stays a hard block regardless — see the
table above) but explicitly delete two sets of rows before proceeding, since
both are protected by a real `on delete restrict`, not an app-level check:
`student_responses` for this bank's questions, and any `pulse_rounds` whose
`plan_checkpoint_id` belongs to a checkpoint in a plan built from this bank.
Both are genuinely, permanently destroyed by this branch — this is the
actual data loss the professor is accepting, not a formality.

**Content item** (`deleteContentItem`, gains a `force` input): when `force`,
skip the app-level `activity_instances`-exists check. No explicit
pre-deletion is needed here — `activity_templates → activity_instances →
student_attempts → student_responses` are already `on delete cascade` all
the way down; the check being skipped was an application-level addition, not
a database constraint, so nothing else changes. The release-visibility guard
and the DB trigger are untouched regardless of `force`, per the table above.

### Frontend UX: type "DELETE" to confirm

Same shape on all three screens (`Schedule.tsx`, `QuestionBanks.tsx`,
`ContentLibrary.tsx`):

1. A normal Delete attempt fails. If the failure is specifically the
   "historical activity" kind (recognized by message/code — see below), show
   a **"Delete anyway"** link/button next to the existing error text, instead
   of just the error alone.
2. Clicking it reveals an inline text input plus a distinctly-styled
   (`btn danger` or similar — match whatever destructive-action styling
   already exists in this codebase, don't invent a new one if one exists)
   confirm button, disabled until the typed value case-insensitively equals
   `DELETE`.
3. Submitting calls the same delete function with `force: true`.

**Recognizing "this specific failure, not some other one"**, per file's own
existing error convention (unchanged from the earlier work — do not
introduce stable codes into session/bank's raw-English-message files as part
of this change; that's a separate, larger follow-up already tracked in
`05-status.md`):
- Session: match on the message substring that means "has pulse activity"
  (the existing `"This class has recorded live-question activity..."`
  translation, or a distinguishable fragment of it).
- Bank: match on the message substring that means "has recorded answers or
  live question history" (the existing translated message).
- Content item: match on the stable code
  `content_item_has_activity_history` — already the established mechanism
  (`ApiError.code` / `contentItemDeleteErrorKey`).

None of the OTHER refusal reasons (wrong state, currently live, currently
released, active bank, not found, not owned) should ever show "Delete
anyway" — only the historical-activity ones.

### Confirmation copy

The "Delete anyway" flow's own text must say, plainly, what's being
destroyed — not a generic "are you sure" a second time. Each entity's
type-to-confirm panel names the specific kind of data:

- Session: "This will also permanently delete every recorded pulse-question
  round and answer for this class. There is no undo."
- Bank: "This will also permanently delete every recorded student answer for
  this bank's questions. There is no undo."
- Content item: "This will also permanently delete every recorded
  end-of-class quiz attempt and answer for this item. There is no undo."

Both languages, matching this codebase's existing bilingual-pair convention.

## Out of scope

- Bulk force-delete, or any multi-select — one item at a time, same as the
  original delete work.
- Making session/bank refusal messages bilingual stable codes — already a
  tracked follow-up in `docs/05-status.md`, unrelated to this change.
- Touching `guard_content_item_delete` (the active-bank trigger) in any way.
- Any change to the currently-live/currently-released guards — those never
  gain a force bypass.

## Verification

- A quiz_bank-typed content item (no deck) now appears in a new "unmanaged"
  section with a working Delete button; deleting it succeeds and the section
  updates.
- A normal (non-force) delete on all three entities behaves exactly as
  before this change — no regression to the existing refusal/success paths.
- Force-deleting a session with real pulse-round history succeeds, and its
  pulse_rounds/pulse_answers are genuinely gone afterward.
- Force-deleting a bank with real student_responses succeeds, and those
  response rows are genuinely gone; the bank's questions are also gone.
- Force-deleting a content item with real quiz history succeeds, and its
  activity_templates/instances/attempts/responses are genuinely gone.
- Force-delete on a session/bank/content item still refuses outright when the
  "right now" guards apply (currently live/currently released/active bank) —
  force never unlocks those, confirmed by attempting it directly.
- The "Delete anyway" option never appears for a refusal that isn't the
  historical-activity kind (e.g. attempting to delete a live session shows no
  force option).
- Typing anything other than "DELETE" (case-insensitive) keeps the force
  confirm button disabled.
