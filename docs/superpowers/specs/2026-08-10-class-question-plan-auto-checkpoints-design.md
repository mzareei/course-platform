# Class Question Plan: Auto-Generated Checkpoints

## Relationship to the prior design

`2026-08-08-class-question-plans-and-attendance-design.md` introduced the
Class Question Plan and its manual checkpoint board (topic, optional slide
hint, candidate questions, notes, Ask now), decoupled from any lecture deck.
That board is built and live. Its own rollout order listed four phases; phase
1 (the manual board) is done. This spec is a refinement of phase 4
("platform-deck highlighting and PDF-generation planning form"), scoped down
to what an external deck (a professor's own PowerPoint/PDF/Google Slides)
actually needs: no deck bridge exists to highlight anything automatically, so
the win is removing the manual retyping step, not adding automation that
requires a deck the platform never sees.

## Problem

A professor's own JSON question file already states, per question, which
slide it covers (`covers_up_to_slide`) and a human topic label (`topic`).
Today `course-content-import` deliberately discards both at commit time — the
code comment calls this "the honest state for content with no checkpoint
bridge," reserving `checkpoint_after_slide`/`segment_key` for the stricter,
deck-verified system that drives automatic checkpoint triggering off a
platform-generated deck.

Two consequences, both confirmed in the code:

1. The imported bank's slide coverage disappears after import — visible in
   the import preview, absent from the Question Banks screen.
2. Building a Class Question Plan means retyping information the professor
   already supplied once: topic, slide hint, and manually checking candidate
   questions one at a time out of the full bank list.

## Goal

When a question bank carries per-question slide/topic metadata, its Class
Question Plan should build itself the moment the plan is created. During
class, the professor's only action should be picking the slide they are on
and asking the question — no card-scrolling.

## Data model: two new informal fields

Add to `questions`:

| Column | Type | Meaning |
| --- | --- | --- |
| `suggested_slide_hint` | `integer null` | Carried from the import file's `covers_up_to_slide`. Never validated against a real deck. |
| `suggested_topic` | `text null` | Carried from the import file's `topic`. Free text, professor-authored. |

These are deliberately **separate** from `checkpoint_after_slide` /
`segment_key` / `source_slide_start` / `source_slide_end`, which stay
reserved for deck-verified checkpoints (AI generation, legacy backfill). Nulls
stay possible without penalty. No validation beyond "positive integer or
null" / "trimmed text or null" — same informality already accepted for
`class_question_plan_checkpoints.slide_hint`.

Additive migration in `mzareei.github.io/supabase/migrations/`, no backfill
needed (every existing row gets `null` for both, which is correct: nothing
before this change carried the information).

## Import behavior change

`course-content-import`'s question upsert (`index.ts`, the loop that
currently writes the "checkpoint columns intentionally left unset" comment)
starts writing:

```
suggested_slide_hint: question.covers_up_to_slide,
suggested_topic: question.topic,
```

Both already exist on the frontend's parsed shape
(`NormalizedQuestion.covers_up_to_slide`, `NormalizedQuestion.topic` in
`src/features/import/questionFile.ts`) and already reach
`course-content-import` in the payload — only the write was missing. The
comment explaining why the strict columns stay unset is preserved; a new one
explains why these two are written.

## Question Banks screen: show slide coverage again

`QuestionBankReview.tsx` already renders a "During class · After slide N"
pill when `question.checkpoint_after_slide` is not null. Extend the fallback:
when `checkpoint_after_slide` is null but `suggested_slide_hint` is not,
render the same pill from the informal field. This alone restores the
professor's first observation — imported slide coverage visible again in the
bank they review, edit, and delete from.

`BankQuestion` (`src/api/checkpoints.ts`) gains `suggested_slide_hint` and
`suggested_topic`; `course-question-bank`'s `list_questions` action selects
the two new columns.

## Auto-generating checkpoints on plan creation

`course-class-question-plan`'s `create` action, after inserting the plan row,
groups that bank's active questions by `suggested_slide_hint` and bulk-inserts
one `class_question_plan_checkpoints` row per distinct value, in the same
request:

- **Eligible questions:** `status = 'active'` and `suggested_slide_hint is not
  null`. A question tagged `topic_tags = ['final']` (the import's
  end-of-class-quiz-only marker) is excluded — it was never meant to be asked
  live.
- **`topic`:** the group's most common non-empty `suggested_topic`; if none
  of the group's questions supplied one, falls back to `"Slide {N}"`.
- **`slide_hint`:** the group's slide number.
- **`candidate_question_ids`:** every eligible question in that group.
- **Ordering (`position`):** ascending by slide number.

Questions with no `suggested_slide_hint` are not auto-added to any
checkpoint — including a manually-typed bank, or a bank generated before this
feature existed, whose plan creation produces zero checkpoints, exactly as
today. The professor can still use "Add checkpoint" for anything the
importer didn't capture.

This is one atomic step inside `create`, not a separate action — matches
"automatic, the moment the plan is created." Every resulting checkpoint is a
completely ordinary `PlanCheckpoint` afterward: editable, removable,
reorderable through the existing `update_checkpoint` / `remove_checkpoint` /
`set_candidates` actions, no new state machine.

## Live picker: slide-first

`ClassQuestionPlanBoard`'s live rendering (inside `isLive` in
`RunClass.tsx`) replaces the stacked list of every checkpoint with:

- A single dropdown of **not-yet-asked** checkpoints (`state = 'planned'`),
  labeled `"Slide {slide_hint} — {topic}"`, sorted ascending; checkpoints with
  no `slide_hint` sort last, labeled by topic alone.
- Selecting one shows its candidate question(s) — a `<select>` when there is
  more than one candidate, matching today's behavior — and the existing
  **Ask now** button.
- A collapsed history strip below lists checkpoints already `sent` or
  `skipped`, read-only, so the professor can see what already happened
  without it crowding the live picker.
- "Add checkpoint" remains available (for anything not auto-generated) but
  moves out of the primary flow — a secondary control, not a card in the main
  list.

This is a rendering change to `ClassQuestionPlanBoard.tsx`; no new API calls
beyond what already exists (`getClassQuestionPlan`, `saveCheckpointCandidates`,
`pushPlanQuestion`, `markClassQuestionPlanCheckpointSkipped`).

## Out of scope

- **Multi-bank plans.** A `ClassQuestionPlan` still binds to exactly one
  `question_bank_id`. Combining two separately-imported files into one
  class's live plan is not addressed here — it would require the professor to
  merge them into a single import first. If this becomes a real need, it is a
  separate, larger change to the plan/bank relationship, not part of this
  spec.
- **Real deck-bridge automation.** Nothing here touches
  `checkpoint_after_slide` / `segment_key` or the platform-deck highlighting
  described in the 2026-08-08 spec's phase 4. That remains a distinct,
  unbuilt feature for professors using the generated deck.
- **Quick-question composer and Attendance/Class results tabs.** Phases 2 and
  3 of the 2026-08-08 spec, untouched by this work.

## Verification

- Import a JSON bank with mixed `covers_up_to_slide`/`topic` coverage
  (some questions tagged `final`-only, some sharing a slide number, some with
  no slide number at all). Confirm the Question Banks screen shows the
  correct "After slide N" pills.
- Create a Class Question Plan against that bank. Confirm one checkpoint per
  distinct slide number, correct topic labels, correct candidate grouping,
  `final`-only and slide-less questions excluded.
- Confirm a bank with no `suggested_slide_hint` data anywhere (hand-typed
  bank, or a bank imported before this change) still creates a plan with zero
  checkpoints, unchanged from today.
- Live: start a class, confirm the dropdown lists only unsent checkpoints in
  slide order, Ask now still snapshots the exact question into the pulse
  round, and a sent checkpoint moves into the history strip and drops out of
  the dropdown.
- Confirm editing, removing, and manually adding a checkpoint on an
  auto-generated plan still behaves exactly as it does today.
