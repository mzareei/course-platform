# Disable PDF Generation, Delete Class Sessions/Question Banks/Content Items

## Goal

Two independent changes, bundled because they're both instructor-facing cleanup:

1. Hide the "Generate from a PDF" entry point — no backend teardown, purely a
   frontend gate, reversible later.
2. Add real delete actions for three entities that currently have none
   anywhere in the stack (frontend, API, or edge function): class sessions
   ("class days"), question banks, and content items ("materials"). This is
   for clearing accumulated test/QA data, so deletion is a genuine hard
   `DELETE`, not an archive/soft-hide — but it must refuse, with a clear
   message, whenever the schema's own foreign keys show the target has real
   recorded activity (a student's answer, a question actually asked live in
   class), rather than silently losing academic data.

## Background: why nothing here is soft-delete

`question_banks.status` already has an unused `'archived'` value, and
`content_items` already carries a `BEFORE DELETE` trigger
(`guard_content_item_delete`, migration `0032_content_ownership_and_versions.sql`)
whose own error message says *"Archive them before deleting it."* — i.e. the
schema was originally designed assuming archive-first. This spec doesn't
build archiving. The professor confirmed the actual need is clearing test/QA
clutter, where hard deletion is correct and archiving would just leave
clutter renamed. The existing trigger stays exactly as-is (a genuine safety
net for content items with an active bank); this spec surfaces its error
message through the UI instead of working around it.

## 1. Disable "Generate from a PDF"

`src/screens/instructor/Content.tsx` has a four-tab switcher
(`"library" | "banks" | "generate" | "import"`). The "Generate" tab link
(currently ~lines 127-130) and the `tab === "generate"` render branch
(~lines 142-143) are the *only* reachable path to `GenerationBriefForm`,
`uploadPdf`, and `createJob` — confirmed by a repo-wide grep, nothing else
references those symbols. Remove the tab link and make the body switch treat
`"generate"` the same as an unknown/removed value (render nothing, or fall
through to the library tab) so stale state or a stale URL can't reach it
either.

Everything else — the AI generation edge functions
(`course-generation`, `course-generation-worker`), migrations, and the
`Import` tab (`ImportPanel`, `course-content-import`) — is untouched. No data
migration, no deploy of the backend repo needed for this half.

## 2. Delete a class session

**Where:** the class days list (`src/components/Schedule.tsx`, rendered from
`Classes.tsx`). A Delete action next to the existing Edit/Run/Cancel actions.

**Allowed states:** `planned`, `cancelled`, `closed` only. Refused for
`open`, `live`, `paused`, `continued` — an in-progress class must never be
deletable out from under itself. This is an explicit state check in the
backend action, independent of any FK-driven failure.

**What the schema already does on a `class_sessions` delete** (from the
actual migrations, not assumed):

| Table | Behavior |
| --- | --- |
| `pulse_rounds` | cascades — deleted |
| `class_student_notes` | cascades — deleted |
| `class_presentation_state` | cascades — deleted |
| `content_releases` | `set null` — row survives, unlinked |
| `activity_instances` | `set null` — row survives, unlinked |
| `participation_events` | `set null` — row survives, unlinked |
| `exit_tickets` | `set null` — row survives, unlinked |
| `class_sessions.continued_from_session_id` (self-referencing) | `set null` |
| `class_question_plans` | **no action — blocks the delete** unless handled first |

**Backend:** one new atomic operation (SQL function, matching the codebase's
existing convention for multi-step class-session/plan operations like
`close_class_session_with_review` and `push_class_question_plan_round`) that,
inside one transaction:

1. Re-checks the caller's section permission and the session's current
   state (`planned`/`cancelled`/`closed` only) with the row locked.
2. Deletes any `class_question_plans` row for this session (this cascades to
   its `class_question_plan_checkpoints` and `class_question_plan_candidates`
   automatically, per the existing `0034` schema).
3. Deletes the `class_sessions` row itself, which triggers the cascades and
   nulls listed above.
4. Writes an `audit_log` entry (`target_type: 'class_session'`, matching the
   existing pattern from `0027_class_management_composition_fixes.sql`).

Step 2's checkpoint cascade can itself hit
`pulse_rounds.plan_checkpoint_id on delete restrict` — if any checkpoint from
this session's plan was ever actually used to push a live question, deleting
it is blocked by Postgres, the whole transaction rolls back, and the edge
function must translate that into a stable, bilingual error
(e.g. "this class has live question history and can't be deleted") rather
than a raw Postgres exception. Same translate-not-bypass treatment as the
`class_question_plan_checkpoint_locked` pattern already used elsewhere in
this codebase.

**Frontend:** a new `deleteSession` export next to `cancelSession` in
`src/api/schedule.ts`, a Delete button on `Schedule.tsx` gated to the same
three states, and a confirmation dialog naming what's actually attached to
*that* session (e.g. "This deletes the class day, its N pulse rounds, and N
student notes. N participation record(s) will be unlinked, not deleted.") —
the counts come back from the same call or a preceding read, matching how
"End the class" already confirms and names consequences before acting.

## 3. Delete a question bank

**Where:** the Question Banks screen (`src/components/QuestionBanks.tsx`), a
Delete action per bank card.

**What the schema already does on a `question_banks` delete:**

| Table | Behavior |
| --- | --- |
| `questions` | cascades — deleted (and each question's `question_options` cascades in turn) |
| `generation_jobs.question_bank_id` | `set null` — row survives, unlinked |
| `pulse_rounds.question_id` | `set null` — row survives, unlinked |
| `class_question_plans.question_bank_id` | **no action — blocks the delete** unless handled first |
| `class_question_plan_candidates.question_bank_id` / `.question_id` | **no action — blocks the delete** unless handled first |

**The real protection, already in the schema, left alone:**
`student_responses.question_id references questions(id) on delete restrict`
(and the same for `student_responses.selected_option_id` against
`question_options`). If any student has ever answered a question in this
bank, Postgres refuses the cascade delete outright. This is the correct,
already-present guard against destroying real grade data — the new code
must catch this restrict violation and translate it, not work around it.

**Backend:** one new atomic SQL function, same shape as the session delete:

1. Re-check ownership/edit permission on the bank.
2. Delete any `class_question_plans` rows referencing this bank (cascades to
   their checkpoints/candidates, same as above — and the same
   `pulse_rounds.plan_checkpoint_id restrict` can fire here too, meaning "this
   bank was actually used to ask a live question" also blocks deletion, not
   just "a student answered it").
3. Delete the `question_banks` row.
4. Audit log entry (`target_type: 'question_bank'`).

New edge-function action on `course-question-bank`, e.g. `delete_bank`. New
frontend export in `src/api/checkpoints.ts`, a Delete button on
`QuestionBanks.tsx`, confirmation naming the question count (already
available from the existing bank summary the screen already loads) before
deleting — the same information the screen already shows via
`content.banks.total`.

## 4. Delete a content item ("material")

**Where:** the Content Library screen (`src/components/ContentLibrary.tsx`),
a Delete action per item.

**What the schema already does on a `content_items` delete:**

| Table | Behavior |
| --- | --- |
| `content_releases` | cascades — deleted (a student's Review-screen entry for this item disappears with it) |
| `activity_templates` | cascades — deleted |
| `content_shares` | cascades — deleted |
| `content_versions` | cascades — deleted |
| `question_banks.content_item_id` | `set null` — row survives, unlinked |
| `portfolio_entries.content_item_id` | `set null` — row survives, unlinked |
| `exit_tickets.content_item_id` | `set null` — row survives, unlinked |
| `generation_jobs.content_item_id` | `set null` — row survives, unlinked |
| `class_sessions.content_item_id` | `set null` — row survives, unlinked |
| `content_items.forked_from_content_item_id` (self-referencing) | `set null` |

**The existing guard, left alone:** `guard_content_item_delete` (trigger,
migration `0032`) refuses the delete outright while an *active* question
bank still points at the item. Practically: to delete a material that still
has a bank, the professor deletes the bank first (section 3), then the
material — exactly the order the trigger's own message already prescribes.
No new bank-archiving path is being built to route around this.

**One more guard not covered by the existing DB trigger:** the trigger only
checks for an active question *bank* — it says nothing about whether the
item is currently *released* to students. Deleting a content item that
students can currently open would yank it out from under them with no
warning. Add an application-level check (mirroring the class-session
live-state guard in section 2): refuse the delete if the item has any
`content_releases` row in a currently-available state (the exact state
name(s) — this codebase's release state machine has `draft` /
`scheduled` / an "available now" state / `closed` and similar, per
`course-release-management`'s `update_state` — must be confirmed against
the real enum during implementation planning, not guessed here).

**Backend:** no new SQL function needed for the NO-ACTION-blocker problem —
unlike sessions/banks, nothing has a plain "no action" FK against
`content_items`, so a single-table delete works once the two guards above
pass. New edge-function action on `course-content-library`, e.g.
`delete_content_item`:

1. Ownership/edit permission check (same rule `save_content_item` already
   uses).
2. Refuse if any `content_releases` row for this item is currently
   available to students (new guard, see above).
3. `DELETE FROM content_items WHERE id = ...`.
4. Catch the trigger's raised exception (and, generally, Postgres restrict
   code `23503`) and translate to a stable bilingual error telling the
   professor to delete the active bank first, instead of surfacing the raw
   Postgres message.
5. Audit log entry (`target_type: 'content_item'`) — only on success.

**Storage is explicitly out of scope.** The deck HTML object in Supabase
Storage is not FK-linked to `content_items` and this action does not attempt
to remove it. An orphaned storage object is harmless clutter; storage
deletion adds real risk (wrong-path guesses, no undo) for a problem that
doesn't need solving here.

**Frontend:** new `deleteContentItem` export in `src/api/content.ts`, a
Delete button on `ContentLibrary.tsx`, confirmation naming what's attached
(release count, whether it has a bank at all — if it does, the confirm
dialog should say so and that the bank needs deleting first, rather than
letting the professor discover that from a raw error after clicking
delete).

## Shared conventions across sections 2-4

- **Permissions:** identical to each entity's existing edit permission (owner
  or `platform_owner`; section-scoped instructor rules where applicable) —
  no new permission concept.
- **Errors:** every new restrict-violation / trigger-exception is caught in
  the edge function and mapped to a stable, bilingual error code — never a
  raw Postgres message reaching the professor. Matches this codebase's
  existing pattern throughout (`class_question_plan_checkpoint_locked`,
  `class_question_plan_question_bank_not_active`, etc.).
- **Audit logging:** every successful delete writes one `audit_log` row,
  matching the existing `target_type`/`action`/`metadata` shape used
  elsewhere (`course-content-import`, class session state changes).
- **Confirmation UX:** every delete button opens a confirm step naming
  concrete consequences before acting — no bare "Are you sure?" — matching
  "End the class" and the roster-removal confirm already in this app.
- **State/usage guards are refusals, not silent data loss:** nothing in this
  spec ever cascades away a `student_responses` row, a `pulse_round` that was
  actually pushed live, or deletes a live-in-progress class session. Where
  the schema already blocks that (restrict FKs, the content-item trigger),
  the new code surfaces the block clearly; where the schema doesn't block it
  by itself (a live session's state), the new code adds an explicit check.

## Out of scope

- Bulk/multi-select delete (confirmed: one-at-a-time is enough for now).
- Archiving/soft-delete for any of the three entities.
- Storage object cleanup for deleted content items.
- Any change to the AI generation pipeline itself beyond hiding its frontend
  entry point (functions, migrations, and the Import tab are untouched).

## Verification

- Confirm the Generate tab is gone from Content.tsx and reaching
  `tab=generate` via manually-set state renders nothing generation-related;
  confirm Import still works unchanged.
- Delete a class session with no pulse rounds/notes/plan — succeeds, row
  gone, related `set null` rows (a release, a participation event) survive
  unlinked.
- Delete a class session with a plan but no sent checkpoints — succeeds, plan
  and its checkpoints/candidates gone too.
- Attempt to delete a class session with a checkpoint that was actually sent
  (a real `pulse_round.plan_checkpoint_id` pointing at it) — refused with a
  clear message, nothing partially deleted.
- Attempt to delete a `live`/`open`/`paused`/`continued` session — refused
  before touching the database.
- Delete a question bank with no student responses and no live-sent
  checkpoints — succeeds, questions/options gone.
- Attempt to delete a bank with at least one `student_responses` row against
  one of its questions — refused with a clear message.
- Attempt to delete a content item that still has an active bank — refused,
  message names the bank and says to delete it first; delete the bank, then
  the item — succeeds.
- Attempt to delete a content item that is currently released/available to
  students — refused before touching the database, same treatment as the
  live-session guard.
- Delete a content item with no bank and no current release — succeeds.
- Every new error path returns a translated string, verified against
  `tools/verify-i18n.mjs`.
