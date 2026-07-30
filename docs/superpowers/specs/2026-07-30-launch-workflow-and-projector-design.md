# Launch workflow and projector design

**Approved:** 2026-07-30  
**Product owner:** Mahdi Zareei  
**Status:** Approved for implementation planning

## Goal

Finish the remaining launch-critical teaching workflows without replacing the
class lifecycle that is already deployed and verified.

The work has five outcomes:

1. A planned class can be edited and assigned a lecture after creation.
2. Groups can be edited rather than recreated after a mistake.
3. The classroom projector never exposes private instructor information.
4. The final quiz has safe, motivating progress and a consent-based podium.
5. Every class produces one understandable grade, and instructors can keep
   private notes about a student for that class.

## Product principles

- The ordinary material workflow is **assign → teach → end class → review**.
- A class session, not a content-release row, is the center of live teaching.
- Existing pulse, quiz, reflection, and session records remain authoritative.
- The projector is a public classroom surface even though it requires an
  instructor session to open.
- A private value must not be sent to the projector and merely hidden with CSS.
- Pulse questions can improve a class grade but can never reduce it.
- No score can exceed 100%.
- The professor never authors quiz questions.
- All interface copy is English and Spanish.
- All writes continue to go through role-gated edge functions.

## Scope and delivery order

The design is split into deployable increments:

1. Planned-class editing, lecture assignment, automatic post-class Review
   release, group editing, and private student notes.
2. Server-synchronized projector and controller views.
3. Anonymous quiz progress, consent-based podium, combined class grading, and
   the 30/45-second timing rule.
4. Production rehearsal across instructor controller, projector, and student
   entry points.

Each increment must pass the full repository verification suite and remain
usable if later increments have not shipped yet.

## 1. Planned classes and lecture assignment

### Editable fields

Classes shows an **Edit** action for a session that has never started. The edit
form supports:

- planned date;
- group;
- student-facing class title; and
- lecture, including attaching, replacing, or removing it.

The server, not only the interface, refuses these changes once
`actual_start_at` is non-null or the session state is no longer pre-class.
Changing historical lecture identity would invalidate checkpoint, quiz,
reflection, and grade meaning.

Saving is audited with the complete before/after values. The response uses the
same session shape returned by `list_sessions`; the frontend must not invent a
second interface for it.

### Assignment from Content

Each lecture card includes **Assign to a class**. It opens only editable planned
sessions and shows their date, group, current lecture, and title. Selecting a
session uses the same server action as editing from Classes.

The card lists:

- planned sessions using the lecture;
- groups that can already review it; and
- whether a whole-course early release exists.

Classes is the primary scheduling surface. Content is a convenient second entry
point, not a different association mechanism.

## 2. Review availability

### Normal lifecycle

Assigning a lecture does not reveal it before class. Ending the class
automatically makes that lecture available in Review to active students in the
session's group.

If Group A and Group B receive the same lecture on different dates, each group
gets Review access only after its own class ends.

The final session transition and the group-scoped release are one idempotent
server operation:

- retrying cannot create duplicate releases;
- an already-effective group or whole-course release is accepted;
- the audit log records the session, lecture, group, actor, and resulting
  release; and
- a release failure cannot leave the session reported as successfully closed
  without an actionable error.

### Manual override

The ambiguous **Make available** wording becomes:

- **Make available now** for exceptional early or whole-course access; and
- **Remove from Review** to hide material after release.

Examples for the manual override are pre-reading, material not taught in a live
session, an absent student's access, and temporary removal of incorrect or
outdated content.

The normal class flow does not require either manual action.

## 3. Group editing and membership

Classes → Groups adds:

- **Edit**, for group code, name, meeting pattern/description, and campus;
- **Manage members**, which opens People filtered to that group; and
- the existing retire/reactivate action.

The existing `save_section` backend path is reused. Because it rewrites the row,
the client must send every persisted field and must use the actual returned
shape.

Group membership changes remain in the roster domain. The filtered People view
supports assigning or moving students without turning the Groups table into a
second roster implementation.

The interface distinguishes the stable group code from the rotating join code
on each class session.

## 4. Projector and private controller

### Routes and roles

Run Class becomes the private controller. It contains an **Open projector
view** action and a QR code that opens the controller route for the same session
on a phone or tablet.

Both routes require an instructor-capable authenticated account:

- `/teach/run/:sessionId` — private read/write controller;
- `/teach/run/:sessionId/projector` — read-only classroom display.

Students cannot open either route. The projector route receives only a
projector-safe response shape; private fields are excluded server-side.

If the instructor scans the controller QR while signed out, authentication
returns to the exact validated controller path.

### Projector content

The projector may show:

- lecture deck and slide position;
- student join QR and code;
- pulse prompt and answer choices;
- live submitted/eligible counts;
- correct answer and explanation only after an explicit **Reveal to class**;
- anonymous final-quiz progress;
- the consent-aware podium after an explicit **Show podium** action; and
- safe transition messages for quiz, reflection, and class completion.

The projector never receives or shows:

- unrevealed correctness;
- real student names except consented podium winners after reveal;
- individual answer selections;
- scores or percentages;
- private reflections;
- private student notes; or
- instructor-only diagnostics.

### Controller content

The controller shows:

- previous/next slide and current slide/checkpoint;
- prepared pulse prompt, correct choice, and explanation;
- send, reveal, close, skip, retry, and continue actions;
- real response counts and private results;
- quiz start/close controls and real student progress;
- final scores after submission;
- reflection arrivals;
- projector connection state; and
- the two-step end-class action.

### Synchronization

Existing session, pulse, and quiz records remain the source of truth. A small
presentation-state record stores only:

- session id;
- monotonically increasing revision;
- requested slide;
- last projector-acknowledged slide;
- current classroom phase;
- current checkpoint key/slide when relevant;
- projector last-seen time; and
- controller last-seen time.

The controller writes a new revision when it requests navigation or a
presentation phase. The projector applies only revisions newer than the last
one it acknowledged. Delayed requests therefore cannot accidentally move a
deck backward.

When the projector reaches an authored checkpoint, it reports the checkpoint
identity. The controller then receives **Question ready** and uses the existing
checkpoint-secured pulse functions to draw and send from that exact boundary.

Reloading either device reconstructs state from the server. A short-lived deck
token refresh retains the last acknowledged slide and continues to use
`/content?t=...`, never `srcdoc` or `blob:`.

### Failure behavior

- If the projector disconnects, it stays on its last working slide.
- The controller reports the stale last-seen time and offers retry of the
  latest command.
- Repeated navigation and phase requests are idempotent by revision.
- A projector reconnect applies the newest state rather than replaying every
  missed command.
- Pulse reveal and close retain their existing server-authoritative recovery.
- Private controller failure never converts the projector into a write surface.

## 5. Final-quiz progress

### Progress heartbeats

The student player sends a small heartbeat:

- when the attempt starts;
- after every question transition;
- after reconnect/recovery; and
- on submission.

It contains only attempt identity, answered count, total count, current
position, and timestamp. It does not duplicate selected answers or correctness.
Heartbeat failure never blocks answering or final submission.

The private controller receives real student names and:

- not started, in progress, or submitted;
- answered/total;
- last-seen time and a stale-connection indicator; and
- final score only after submission.

### Anonymous classroom identities

Every participant receives a deterministic, session-specific scientist alias
and a science-themed avatar. Examples include **Curious Curie**, **Cosmic
Galileo**, and **Brilliant Ada**.

The student's phone displays their own alias. The projector receives the alias
and avatar but not the profile id used to derive them.

The projector shows:

- started and completed counts;
- an overall class completion meter;
- anonymous answered/total progress bars;
- an individual completion animation; and
- a class celebration when all students who started have submitted.

It does not identify students who have not started.

## 6. Consent-based podium

After the quiz is closed and final class scores are available, the controller
enables **Show podium**. Nothing is revealed automatically.

The podium shows first, second, and third on a three-level presentation. Public
ranking uses:

1. combined class score;
2. end-of-class quiz correctness; and
3. completion time only as the final tie-breaker.

No public score or percentage appears.

Each student has a preference: **Show my name if I reach the podium**. It
defaults to off.

- opted in: show the student's preferred name, falling back to full name;
- not opted in or unset: show the scientist alias.

Consent is read at reveal time. The instructor cannot override an individual
student's private default. If nobody opts in, the full podium remains
anonymous.

## 7. One combined grade per class

Each class session creates one gradebook item. Pulse participation and the
end-of-class quiz do not create two independently weighted class grades.

Let:

- `Q` = the number of questions actually assigned in the final quiz;
- `F` = correct final-quiz answers; and
- `P` = correct in-lecture pulse answers for that student and session.

Then:

```text
combined_correct = min(Q, F + P)
session_percent = roundToOneDecimal(100 × combined_correct / Q)
```

The stored calculation keeps one decimal place, matching the existing quiz
summary.

Examples for `Q = 12`:

| Final correct | Correct pulses | Combined grade |
|---:|---:|---:|
| 10 | 2 | 100% |
| 8 | 3 | 91.7% |
| 12 | 4 | 100% |
| 9 | 0 | 75% |

Rules:

- a correct pulse recovers one missed final question;
- wrong, skipped, or unanswered pulses never lower the grade;
- merely answering remains engagement analytics but adds no grade credit;
- skipped instructor checkpoints do not change the denominator;
- the cap is always 100%;
- timing/speed bonuses do not alter the academic grade;
- reflection remains recorded but does not alter this score; and
- new sessions stop adding a separately weighted pulse participation grade,
  preventing double counting.

The server recalculates each submitted student's session grade on quiz close.
Repeated calculation is idempotent. Historical sessions and already-posted
grades are not rewritten.

## 8. Question timing

The 20-second end-of-class question tier is removed.

Every end-of-class question receives either 30 or 45 seconds from a
deterministic reading-load classifier:

- 30 seconds for a concise prompt with concise choices;
- 45 seconds for a long prompt, long choices, multi-paragraph scenario, or code.

The classifier measures prompt plus all displayed choices in both English and
Spanish and uses the larger reading load. It therefore gives every student the
same budget regardless of language.

It assigns 45 seconds when either language has more than 60 total words, a
prompt longer than 35 words, any choice longer than 15 words, multiple
paragraphs, or code/preformatted content. Otherwise it assigns 30 seconds.
These thresholds are centralized in one pure function and locked by boundary
tests. Existing and future banks use the same classifier; the model does not
choose the time.

In-lecture pulse questions retain their longer classroom response window. The
professor may reveal earlier when the room is ready.

## 9. Private per-class student notes

Gradebook → Per class adds **Notes** beside every student. An instructor can
append a note tied to:

- course;
- class session;
- student profile;
- author profile;
- timestamp;
- free-text observation; and
- optional needs-follow-up state.

Notes are append-only. A follow-up may be marked resolved, recording resolver
and time without deleting or overwriting the original note.

The same records appear chronologically in an instructor-only student profile,
making observations reviewable across the semester.

Initial access is limited to platform owners and instructors for the course.
Student, projector, ordinary quiz-status, reflection, and student-export
responses never include notes. Every create and resolve action is audited.

Note text is stored as written and is not machine translated. Surrounding
interface copy is bilingual.

## 10. Authorization and privacy verification

Automated verifiers must prove both presence and absence:

- students cannot edit sessions, groups, releases, grades, notes, presentation
  state, or podium state;
- teaching assistants do not receive private notes unless a later policy
  explicitly adds that access;
- started sessions cannot change lecture identity;
- projector responses do not contain correctness before reveal;
- projector responses never contain private names outside consented podium
  winners;
- projector responses never contain answers, scores, reflections, or notes;
- progress heartbeats cannot be written for another student's attempt; and
- podium consent belongs only to the student whose profile is changing.

Privacy must be enforced in the server response shape, not only by frontend
rendering.

## 11. Production test matrix

Testing uses the real entry points:

### Management

1. Create a planned class without a lecture.
2. Attach a lecture later from Classes.
3. Replace it from Content and confirm both screens agree.
4. Start the class and confirm further lecture edits are refused by the UI and
   server.
5. End the class and confirm only that group receives the lecture in Review.
6. Verify early whole-course release and later removal.
7. Edit group code/name/details, then move a student through the filtered People
   view.
8. Add and resolve a private student note; confirm it appears in the class and
   profile views and nowhere student-facing.

### Classroom

1. Use separate signed-in controller, projector, and student browser sessions.
2. Navigate slides remotely and recover both devices after reload.
3. Reach a checkpoint; verify the projector shows prompt/choices but no
   correctness.
4. Send, answer, reveal explicitly, close, and continue.
5. Assert the projector DOM and network response never contain private values.

### Quiz and grade

1. Start the final quiz with multiple students.
2. Verify 30/45-second classification at threshold boundaries in both
   languages.
3. Verify aliases match each student's phone and no real names leak.
4. Interrupt one student heartbeat without interrupting their quiz submission.
5. Close the quiz; verify combined-grade examples, the 100% cap, and
   idempotent recalculation.
6. Reveal the podium explicitly with one opted-in and one anonymous winner.
7. Confirm the projector shows no scores and the controller shows complete
   private results.

### Layout and language

- controller at 375×812 and 430×932;
- projector at 1440×900 and the classroom's actual resolution;
- English and Spanish across every new state;
- no horizontal overflow;
- correct `/content?t=...` deck delivery; and
- student Today → Join class, never a typed internal student route.

## 12. Documentation and rollout

Each increment updates:

- `docs/04-decisions.md` for product and architecture decisions;
- `docs/05-status.md` with only evidence actually verified;
- `docs/06-runbook.md` with the new classroom rehearsal;
- `docs/07-pitfalls.md` for newly discovered failure modes; and
- `docs/HANDOFF-PROMPT.md` when the operational workflow changes materially.

Frontend pushes deploy through Cloudflare Pages. Backend migrations and edge
functions are deployed explicitly from the backend repository. No increment is
called complete until the Cloudflare deployment, Supabase deployment, and
production browser rehearsal are all recorded.
