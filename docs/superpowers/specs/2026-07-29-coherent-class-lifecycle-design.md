# Coherent Class Lifecycle Design

**Date:** 2026-07-29  
**Status:** Approved for implementation  
**Scope:** Instructor scheduling and teaching, slide-aware pulse questions,
student joining, content classification, and the student live flow.

## Problem

The platform has the backend pieces for a complete class, but several screens
expose implementation details rather than the way a professor teaches:

- Content says a legacy quiz is available even though student screens
  deliberately filter it out because it has no standalone player.
- Reflections are correctly attached to a live class session, but the Content
  screen makes the quiz look like an independent activity that should carry a
  reflection.
- Home says no class is scheduled without linking to the class-day form, which
  is buried below roster management on People.
- Run Class controls pulse questions, the final quiz, and reflections, while
  the lecture deck is a separate screen.
- Existing decks still link to retired Home, Mission, Quiz, and Exit pages.
- During-lecture questions are drawn from the entire lecture bank, so they may
  test concepts students have not seen.
- View as student renders Today inside the instructor shell instead of showing
  the real student experience.
- Student live-session discovery is inferred from content releases. A class
  session and a content release are different concepts and must not depend on
  one another.

The result compiles and its endpoints work, but the professor cannot understand
or operate the lifecycle reliably.

## Product Decisions

1. Quizzes are live-only. A professor starts the final quiz during a scheduled
   class, and reflection follows automatically when the quiz closes.
2. Question banks are professor-only teaching infrastructure. They are never
   released or opened by students.
3. A typical 40-slide lecture contains approximately four formative
   checkpoints placed at concept boundaries.
4. Checkpoint questions are generated before class from material students have
   already seen. The platform never calls a model live during a lecture.
5. The final quiz covers the whole lecture and remains sequential, with
   20/30/45-second per-question timing by difficulty.
6. Students scan once per class. Their open phone then follows pulse questions,
   the final quiz, reflection, and completion automatically.
7. The existing edge-function authorization, polling, activity engine, grading,
   private storage, and `/content?t=…` delivery chain remain.
8. Every new user-facing string is English and Spanish, all student controls
   remain phone-first with 44px tap targets, and the instructor cockpit remains
   usable by keyboard and with reduced motion.

## Instructor Information Architecture

The instructor navigation becomes:

`Home · Classes · Content · Gradebook · People · Admin`

### Home

Home shows today's class first and the next scheduled classes below it. When
nothing is scheduled, the empty state contains the primary action **Schedule a
class**, linking directly to Classes.

### Classes

Classes owns course groups and class days. These controls move out of People.

Adding a class asks for:

- date;
- group;
- lecture;
- an optional student-facing title, prefilled from the lecture.

Selecting a lecture associates its question bank and deck with the class. A
class can still be saved without a lecture, but Run Class then explains what is
missing and offers **Choose a lecture** before live teaching can begin.

Each class row offers **Run this class** for planned or active sessions and
**Review results** after the session closes.

### Content

Content has three groups:

1. **Materials** — lectures, missions, case files, and resources that have a
   real viewer. Only these receive Make available / Take it back controls.
2. **Question banks** — professor-only readiness: lecture association, total
   questions, difficulty balance, checkpoint coverage, and validation errors.
   There is no availability state.
3. **Generate from PDF** — the existing pipeline. Approval places the deck in
   Materials and the bank in Question banks.

Legacy `activity + supabase_record` content, Teacher Insights, and Review Coach
do not appear as releasable materials.

### People

People becomes roster-only: add one person, CSV import, roster state, removal,
and external access.

## Slide Segments and Question Metadata

The generation pipeline divides a lecture into ordered concept segments. A
segment normally spans 3–10 slides and ends at a pedagogically meaningful
boundary, not a fixed slide interval.

Every generated question stores:

- stable question ID and generation key;
- source slide IDs;
- source slide start and end positions;
- concept-segment key;
- checkpoint position after which it is eligible;
- difficulty;
- English and Spanish prompt, options, and explanation.

Each checkpoint must have at least two valid candidate questions. The professor
may disable a checkpoint or regenerate its candidates during review, but never
authors a question.

Checkpoint selection is constrained to that segment. It cannot draw from later
segments. The final quiz may draw from the whole bank, stratified across both
difficulty and concept segments.

For existing decks and banks, a one-time conversion extracts slide text,
creates concept segments, maps or regenerates questions, validates the result,
and writes a new private deck object. It does not edit the frozen public
first-generation applications.

## Deck Checkpoints

The deterministic deck assembler inserts a checkpoint section after each
selected concept segment. A checkpoint contains identifiers and presentation
layout, not a correct answer embedded in public markup.

Existing and generated decks keep:

- slide navigation and counter;
- overview and fullscreen;
- English / Spanish;
- light / dark mode.

They remove:

- old Home;
- old Mission;
- old Quiz;
- old Exit.

The deck remains a same-origin iframe served only through `/content?t=…`.
Neither `srcdoc` nor `blob:` is allowed.

## Deck-to-App Protocol

The deck and Run Class communicate with `postMessage`. Messages have a version,
type, session identifier, content slug, slide position, and checkpoint key.
Both sides validate the exact origin, protocol version, and payload shape.

Deck-to-parent messages:

- `deck.ready`
- `deck.slide_changed`
- `deck.checkpoint_entered`
- `deck.checkpoint_skipped`

Parent-to-deck messages:

- `checkpoint.question_ready`
- `checkpoint.question_sent`
- `checkpoint.results_updated`
- `checkpoint.answer_revealed`
- `checkpoint.resume`

The protocol is presentation state only. Opening, answering, revealing, and
closing a pulse round still go through authenticated edge functions.

## Run Class Cockpit

Run Class is a desktop/projector layout:

- the deck occupies the main area;
- a narrower control panel shows join count and the action appropriate to the
  current moment;
- class title, group, state, student-preview link, and End class remain visible.

Before the session is live, **Start class** is the primary action. Starting
makes the session joinable and displays its QR.

The same session QR appears on the title slide and at every checkpoint so a
late-arriving student can join without interrupting the lecture.

During ordinary slides, the panel shows the current segment and next checkpoint.
No action is required.

At a checkpoint:

1. The mapped question and source range appear automatically.
2. Space or **Send to students** opens the pulse round.
3. Right Arrow or **Skip** resumes the deck without sending.
4. While open, the panel shows answered/enrolled and distribution.
5. Space or **Show answer** reveals the correct response.
6. Right Arrow or **Continue lecture** closes the round and resumes the deck.

Only one pulse round can be active. The professor may ask a different prepared
candidate for the same checkpoint before sending.

At the end of the deck, the panel offers the final quiz. Closing the quiz opens
reflection automatically. Incoming reflections appear in the panel. Ending the
class closes any remaining round or quiz and preserves the reflection grace
window.

If deck messaging fails, the panel exposes the current slide and checkpoint
controls manually. Teaching must not depend on an animation or iframe event.

## QR Joining and Authentication

The QR encodes `/join/<join-code>` for the class session.

- A signed-in, enrolled student is admitted to the session and redirected to
  `/live`.
- A signed-out student stores the join destination, authenticates, and returns
  to the same join route.
- A signed-in but unenrolled user receives a specific access explanation.
- An invalid, cancelled, or closed code explains that the class cannot be
  joined and links back to Today.

The join code identifies a class, not a question. Later checkpoints require no
new scan.

## Student Information Architecture

### Today

Today is session-driven. It shows the current or next scheduled class. When the
session is live, **Join class** is the single primary action.

### Review

Review is release-driven. It contains only released lectures, missions, case
files, and resources with a functioning viewer. It never shows standalone quiz
cards, question banks, Teacher Insights, or Review Coach.

### Live

Live continues to poll one endpoint and renders one state at a time:

`waiting → pulse → waiting → pulse → final quiz → reflection → done`

A reload recovers the server's current state. Pulse answer order remains
student-specific and stable across re-renders.

### View as Student

View as student renders the complete student shell, including Today, Review,
Grades, and student bottom navigation. It can open in a separate tab so the
instructor does not lose Run Class. It includes an explicit **Exit student
preview** control.

## API and Data Boundaries

`course-auth-context` returns student sessions separately from content
releases. Frontend code must not infer a live class from a release row.

The backend gains actions for:

- starting a planned class session and returning its join state;
- resolving and joining a session by join code;
- listing checkpoint coverage for a question bank;
- drawing a question for an exact checkpoint;
- returning the active checkpoint/pulse/quiz/reflection state;
- associating a lecture and bank with a class day.

The existing pulse endpoint continues to snapshot question text and options
when a round opens. The backend validates that the selected question belongs to
the session lecture and requested checkpoint.

Exact request and response field names must be copied from the implemented edge
functions into the frontend types. Missing fields must fail visibly during
development rather than rendering a silent dash.

## Failure Handling

- **No valid checkpoint candidate:** show No question ready to the professor,
  allow Skip, and leave student screens unchanged.
- **Send fails:** keep the deck at the checkpoint with Retry and Skip. Never
  advance automatically.
- **Network interruption:** retain the last valid UI state and retry polling.
- **Deck bridge fails:** use manual checkpoint controls in the side panel.
- **No bank:** allow deck presentation, but disable checkpoints and final quiz
  with a specific explanation and a link to Content.
- **Student joins late:** return the current round, quiz, reflection, or waiting
  state immediately.
- **Duplicate or stale events:** make checkpoint and pulse actions idempotent;
  one session cannot have two open pulse rounds.

Errors render beside the control that caused them.

## Verification

### Automated

- Unit tests for concept-segment boundaries and checkpoint eligibility.
- Validation that no checkpoint question cites a later slide.
- Difficulty and segment stratification tests for the final quiz.
- Protocol tests for message version, origin, payload validation, and duplicate
  events.
- Route tests for signed-in join, signed-out return-to-join, invalid code,
  cancelled class, and unenrolled user.
- A verifier proving live-only records never receive release controls.
- A verifier proving deck output contains no legacy navigation URLs.
- Existing i18n, gated-content, app-shell, CSV, typecheck, and build checks.

### Browser

Exercise the real lifecycle from empty state:

1. Create a group.
2. Schedule a class and choose its lecture.
3. Start it from Home.
4. Scan the real QR from a student browser.
5. Confirm first-time sign-in returns to that class.
6. Advance through at least two deck checkpoints.
7. Answer, reveal, and resume each checkpoint.
8. Skip one checkpoint.
9. Run and close the final quiz.
10. Submit reflection.
11. End the class.
12. Confirm Gradebook and Per class review.
13. Confirm Review shows the released lecture and no standalone quiz.
14. Confirm View as student uses the real student shell.

Final verification must include the professor's signed-in Chrome session and a
separate real student browser or phone. Direct navigation to internal routes is
not accepted as evidence.

## Delivery Order

The feature is one vertical lifecycle but should land in independently
testable increments:

1. Correct content classification and session-driven student discovery.
2. Dedicated Classes screen and faithful student preview.
3. QR join and authentication return.
4. Slide/question metadata and checkpoint generation.
5. Deck bridge and embedded checkpoints.
6. Unified Run Class cockpit.
7. Existing-content conversion and end-to-end dress rehearsal.

No increment may reintroduce public teaching content or bypass the gated
delivery chain.

## Out of Scope

- Student-authored or professor-authored quiz questions.
- Live model calls during class.
- A general-purpose semester course builder.
- Replacing the existing activity engine or gradebook.
- Realtime transport; polling remains the supported mechanism.
- Editing the frozen first-generation applications.
