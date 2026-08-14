# Status

**Last updated:** 2026-08-13

### Audit batches 2–4: teaching workflow + student experience (2026-08-13, late evening)

Continuation of the same audit (`docs/audits/2026-08-13-full-platform-audit.md`).
Shipped in this frontend push plus backend `96bd622`:

- **Plan questions before class** (B1): `ClassQuestionPlanBoard` now renders in
  Run Class's pre-live column too; Ask now stays disabled until live. The
  board's previously-dead `!isLive` branches are now the live UI.
- **Imported banks stop crying wolf** (B4): `bankReadiness` no longer judges a
  flexible bank with zero `source_pdf_pages` by PDF mappings — only a bank that
  HAS pages with a broken mapping is invalid. Verifier updated with both cases.
- **Content library**: numeric-collated title sort + search box (B2). **People**:
  search by name/email/ID with a no-matches state (B5). Both lists were
  creation-ordered with no way to find anything.
- **Future-dated classes need a second press to start** (B7) — the guard that
  would have prevented the accidental Aug 19 live class. **Plan-board actions
  confirm** ("Plan created / Checkpoint saved / Question sent", B10).
- **Gradebook nudges about closed-but-unposted classes** (B6) — needed
  `class_session_id` in `course-gradebook-summary`'s items (deployed).
- Student side: real `<form>`s so the phone keyboard's Go key signs in, PIN and
  date inputs styled (C1) with forgot-PIN and first-time hints; Live shows a
  loading state before its first poll (C3); Grades gets retry + a friendly
  instructor-preview state (C4); sessions sorted by date client-side (C5);
  attendance pills use real theme tokens and survive dark mode (C6); sign-in
  errors are `role="alert"` (C7); keys on the two 3-second-polling lists (C8).
- `ConfirmButton` (two-press, self-disarming) replaces `window.confirm` for
  People remove / PIN reset (B12 — 14 more `window.confirm` sites remain, see
  audit). Stale Home-card copy fixed (B11).
- **Deliberately not done:** moving Reset-the-course off Classes (its placement
  is a recorded decision in the code comment); Gradebook per-class default
  (self-healed once the Aug 19 class was rewound); projector route stays
  unlinked (deferred by the professor's own choice — reachable at
  `/teach/run/:sessionId/projector` as a fallback); backend stable-code error
  refactor, verify-i18n scope extension, dead-code purge, and
  `course-gradebook-summary`'s legacy weighted-category surface (frozen, not
  removed) — all still open in the audit's D section.

### Full-platform audit acted on: cut-short classes, Spanish errors, four closed doors (2026-08-13, evening)

The complete audit is `docs/audits/2026-08-13-full-platform-audit.md` — read it
before starting new improvement work; most of its B/C/D items are still open.
What shipped tonight (backend `af1db17`, frontend this commit), all approved by
the professor:

- **The accidentally-live Aug 19 class ("Week02 Class 01 – Authentication") was
  rewound to planned** through the real UI (pause → Reset this class day). Its
  one test question was cleared; nothing student-visible remains.
- **A class cut short no longer misgrades or mislabels anyone.** When a session
  never really ran its quiz — nobody submitted an attempt and nobody answered a
  single question; a merely *opened* attempt does not count (`be9b744` — on Aug
  12 two students opened it in the last seconds, which the first cut of this
  rule wrongly took as proof the quiz ran) — the quiz stops being a 12-question
  zero, the missing reflection stops costing 20% (`submissionRequired` in
  `_shared/class-grade.ts`, session-level `loadEndOfClassRan`), and attendance
  stops calling the whole room "left early". Both tables show it; the
  exit-ticket pill reads "Not required". Verified on Aug 12's live record:
  22 present / 5 late / 1 absent (was 0 present / 25 left early), pulse-only
  grades, no penalty.
- **Backend errors reach users in their language.** The old
  `e instanceof Error ? e.message : t(…)` fallback was dead code (ApiError
  extends Error), so every refusal was English. New `apiErrorText` in
  `src/i18n/index.ts` is the one way to render a caught error: known codes get
  their bilingual sentence, Spanish UI leads with Spanish and keeps the backend
  sentence in parentheses. Applied across ~26 files; `t()` no longer throws on
  an unknown key (white-screen guard).
- **Timezone bug:** Teach Home computed "today" in UTC, so the today's-class
  card vanished after 6 PM in Monterrey. Now `localDateKey()` (shared with
  student Today).
- **Security:** `reset_student_pin` is now scoped to the actor's own sections
  (was: any instructor could clear and re-claim any student's PIN in any
  group); `course-generation-worker` fails closed and
  `GENERATION_WORKER_SECRET` is actually set (was: unset, so the
  Anthropic-spending worker accepted the public anon key — verified 403 now);
  `course-test-signin` and the seven legacy no-auth/static-PIN endpoints
  (`quiz-start-attempt`, `quiz-submit-attempt`, `course-submit-reflection`,
  `course-submit-portfolio`, three `*-summary`) are deleted from production.
  The old public-site quiz/reflection/portfolio pages lose their backend; they
  were superseded by the platform. Unknown roster-management actions now 400.
- **Correction to the entries below:** test sign-in is OFF (`config.testSignIn`
  is `false` and the endpoint is now deleted). Older paragraphs claiming it is
  still on are historical.

### Instructor email works now — custom SMTP is live (2026-08-13)

**The 2/hour email ceiling is gone.** An invited professor for group 402
activated his invitation and then could not sign in: every code request came
back as the rate-limit message. Nothing was wrong with the code. The invitation
email itself had consumed the built-in mailer's tiny hourly allowance, so his
own sign-in code had nothing left to send with.

Fixed in the Supabase dashboard, not in code:

- **Custom SMTP enabled** — `smtp.gmail.com:465`, sender and username
  `mah.zareei@gmail.com`, authenticated with a Google **app password** named
  "Mahdi Teaching Platform". The professor's personal Gmail, deliberately: a
  tec.mx sender is impossible (`DMARC p=reject`, and Tec disables app passwords
  in their own tenant), and Gmail needs no DNS domain.
- **Rate limit for sending emails raised to 300/hour** (Authentication → Rate
  Limits). Enabling custom SMTP alone only lifts it to 30 — the manual raise is
  the step that actually matters.

Verified against production the way `06-runbook.md` demands, not with a single
optimistic send: **eight OTP requests to eight distinct addresses inside 30
seconds, all HTTP 200.** Under the old ceiling the second one would have been a
429. Plus-addressed variants of the professor's own Gmail were used so every
message reached a real inbox and nothing bounced.

Two consequences worth knowing:

- Sign-in mail now arrives **from a gmail.com address**, not tec.mx. Supabase
  warns that a personal mail service is not a transactional one; deliverability
  is adequate for a handful of instructors and QA accounts, not for mailing a
  whole cohort. Brevo remains the upgrade path if that day comes.
- The test burst created eight throwaway auth users
  (`mah.zareei+cptest1..8@gmail.com`). They hold no profile and RLS denies the
  anon key everything, so they can reach nothing — but they are litter and
  should be deleted from Authentication → Users.

This changes nothing for students: they sign in with student ID + PIN and no
mail is sent on their path at all.

### The first real class, and the five things it broke

The professor taught the first live session with students on 2026-08-11/12 and
reported six problems. Five were defects and are fixed, deployed, and recorded
as pitfalls #73–#76. The sixth is a feature and is planned, not built.

| What he saw | Cause | State |
|---|---|---|
| Every student hit a rate limit on Sign in | Supabase's built-in email ceiling — a configuration limit, not a bug | Fixed twice over: students no longer use email at all (ID + PIN), and custom SMTP now lifts the ceiling for instructors — see above |
| "This class is for another group", cleared by reloading | The join ran before anything had claimed a first-ever profile (#76) | Fixed, deployed |
| "The class is live" but no way in | Today had no route back for a student who had already scanned | Fixed, deployed |
| Fullscreen closed itself mid-lecture | The deck iframe reloaded every 9 minutes to refresh a token it no longer needed (#75) | Fixed, deployed |
| Last checkpoint's question waiting with "Continue" | Nothing retired a revealed poll on an imported deck (#73, #74) | Fixed, deployed |
| Wanted to pause a class, not end it | Never built; the backend already supports it | **Built and verified** — see below |

### Pause, resume, and attendance by day — shipped 2026-08-12

Run Class has **Pause the class** beside End the class, and **Resume the class**
on the pre-live panel. Pause is deliberately the plainer button and has no
confirm step: it is reversible in one click and creates nothing, while ending
posts every grade and publishes the lecture. Giving them equal weight is what
pushes a professor who has run out of time toward the irreversible one. A
verifier fails if pause ever gains danger styling or a confirm step.

Pausing closes any open question first — while paused nobody can reveal it.
Students stop being told a paused class is live; their class screen says paused
and keeps polling, so resuming drops them back into the questions with nothing
to tap. A running class now outranks a paused one when both exist on one day,
which happens as soon as a resumed half shares a date with a new lecture.

**Attendance is a day; engagement and grading stay per class** (the professor's
own split). `class_attendance` gained `attendance_date` and moved its unique
constraint to `(class_session_id, profile_id, attendance_date)` — migrations
0048 and 0049, deliberately two, see pitfall #77. Students rescan on the day a
class resumes; that scan is what records presence for that day. The class record
shows the days only when there is more than one.

Verified against production in a throwaway class, deleted afterwards:

- Pausing a class with a question open on a student's phone → session `paused`,
  the question closed rather than stranded, the student still checked in.
- While paused: **zero** student-visible releases and **zero** posted grades, so
  the lecture is not in Review and nobody is graded.
- Resuming → `live`, and a new poll was accepted. That last part is the real
  proof: `course-pulse` refuses any push unless the session is exactly `live`.
- Three scans in a row → one attendance row, arrival time unchanged. The new
  per-day constraint is in force and first-scan-wins still holds.

**Not yet observed:** a scan on a genuinely later day producing a second row.
That needs an actual second day. The schema guarantees it (the old two-column
unique is dropped, both migrations confirmed on the remote ledger), but it has
not been watched happen. Worth checking the first time a class is really
resumed.

**All four code fixes were verified against production on 2026-08-12**, in a
throwaway class ("ZZ SANDBOX") created in empty group 502 and deleted afterwards.
Never against a real class — see the note on half-finished sessions below.

- *First-ever sign-in joins.* A student added to the roster and never signed in
  (`status = 'invited'`, no `auth_user_id`) called `course-session-join` **with no
  `course-auth-context` call first** — the exact QR-scan sequence that failed —
  and got HTTP 200, `joined: true`. Their profile went `invited → active` by
  itself. The same student using group 401's join code still got 403 *"You are
  not enrolled in the group for this class"*, so the guard is intact and the
  message is now only shown when it is true.
- *Return to class.* Verified through the real entry point as a student: Today →
  button → the live question screen. `student_sessions[].checked_in` was `true`
  for the scanned class and `false` for the next one.
- *A revealed question retires itself.* Measured, with both surfaces sampled by
  one probe: `21:39:07` cockpit and student both showing the revealed question →
  `21:40:42` the student's three-minute window expires → `21:41:16` the cockpit
  lets go on its own, with no click. The panel only reaches `idle` after
  `closePulse` resolves, so the round was genuinely closed.
- *Fullscreen survives the token refresh.* With `document.fullscreenElement`
  stubbed to the deck iframe (the one value the code reads; the timer, mint and
  apply decision are all real), the deck was **not reloaded once** across the
  540-second refresh deadline. Dropping the stub and firing `fullscreenchange`
  applied the held token exactly once — which also proves the mint had fired and
  was being held rather than the timer being throttled. The replacement URL still
  carried its slide hash.

**A method note worth keeping.** The first attempt at the retire test reported
success while proving nothing: the probe read the panel for buttons labelled
"Continue with the class" and "Reveal" when the real labels are **"Continue
lecture"** and **"Show the answer"**, and it mapped an expired student token to
"no question on screen" instead of failing. Both made a broken cockpit look
healthy. A verification probe needs its own negative check — assert the labels it
greps for exist, and make an auth failure loud.

### Sign-in: solved — student ID + a PIN the student chooses

**This is the answer, and it is live.** Students sign in with their student ID
and a six-digit PIN they set themselves. No email is sent at any point, so the
2/hour ceiling that locked out the first real class cannot apply, and nothing
depends on Tec's IT.

- **First class:** scan the QR, choose a PIN. Claiming only works while a class
  is **live** — that is what puts the student in the room, and it is the single
  guard against taking a classmate's account.
- **Every class after:** student ID + PIN, anywhere, no QR needed.
- **Forgotten PIN:** *Reset PIN* on People. Clears the PIN and nothing else —
  attendance, answers, quiz attempts, reflections and grades all survive.

Guards: five wrong PINs locks the account for fifteen minutes (see pitfall #78 —
the first implementation of this silently did nothing); an unknown student ID
returns the *identical* error to a wrong PIN, so the endpoint cannot be used to
discover which IDs exist; PINs are bcrypt-hashed and compared inside Postgres,
so neither the PIN nor its hash ever leaves the database.

Verified end to end against production in a throwaway class: QR → set PIN →
straight into the live class; then signed out and back in with student ID + PIN
alone; lowercase IDs accepted; and the correct PIN correctly refused while
locked out.

**Honest limits.** This is as strong as a paper exam password, not as strong as
real identity verification. A student who gives away their PIN has given away
their account. The residual risk is the first claim — whoever claims a student
ID first sets its PIN — bounded by having to be in the room during a live class,
and detectable and reversible when it happens. That is the right standard for
coursework; it is not the standard a bank needs.

**Still to do: turn off test sign-in.** `config.testSignIn` is still `true` and
`COURSE_TEST_SIGNIN_UNTIL` is still set, which means the old no-secret door is
open beside the new one. It should close once students have set their PINs.

### Superseded: email is a dead end, Microsoft is built and waiting on Tec

Investigated to the end on 2026-08-12. **Emailed codes cannot be made to work
here**, and it took four confirmed walls to be sure — none of them ours:

1. Supabase's built-in mailer is capped at **2 emails/hour** project-wide, and
   the field is locked until custom SMTP is configured.
2. `tec.mx` publishes `DMARC p=reject` with `SPF -all`. **No third party may
   ever send as a tec.mx address.** Brevo refuses the sender outright.
3. Tec's tenant has **app passwords disabled**, so their mailbox cannot be used
   as a relay either.
4. Tec **blocks app registration** in their tenant (401 in both portals).

So the route taken is **Sign in with Microsoft** — students authenticate against
Tec's own identity system, no mail is sent, and the impersonation hole closes
properly (today's "secret" is the student's email address, which the whole class
knows; there it is their Tec password and MFA).

Built, deployed behind `config.microsoftSignIn`, and **currently off**. The app
registration lives in the professor's personal Azure directory; the Supabase
Azure provider is enabled and configured. The one thing outstanding is **Tec's
admin approving the app** — signing in reaches Microsoft's "Approval required"
screen, and a request has been drafted through Microsoft's own flow. Flipping
the flag to `true` is the only remaining step. Full detail, including fallbacks
if Tec refuses, in `docs/06-runbook.md`.

**Test sign-in therefore stays on for now**, and remains the open security
issue: anyone who knows a rostered address can sign in as that student and open
their grades. It closes the moment a real student signs in through Microsoft.

**The email ceiling is still open, and it is the one that will bite next.** No
code change can raise it: the project uses Supabase's built-in mailer, capped at
a couple of messages per hour for the whole project. `docs/06-runbook.md` →
*"Sending sign-in emails to a whole class"* has the provider comparison (Brevo,
because Resend needs a DNS domain we do not control), the dashboard steps, and
the verification that must happen **before** a class rather than during one.
The sign-in screen now explains the failure in both languages instead of
printing Supabase's raw English, but that is legibility, not capacity.

**Test sign-in is still on**, deliberately. The professor's decision: close it
only once a real student inbox has received a real code, so a class is not
stranded if email is not ready. The exact steps and their trigger are in the
same runbook section. While it is on, anyone who knows a rostered address can
sign in as that student, and grades hang off that account.

**Pause/resume is planned, not built:**
`docs/superpowers/plans/2026-08-12-pause-resume-and-day-attendance.md`. It needs
a migration, because `class_attendance` is keyed one row per student per class
and the professor's rule is that **attendance is per day while engagement and
grading stay per class** — a lecture paused today and finished next week is one
grade and two days in a room. Design:
`docs/superpowers/specs/2026-08-12-first-class-session-fixes-design.md`.

### A pulse question is spent for that class's quiz

`_shared/asked-questions.ts` (new) + `course-class-quiz` + `course-activity-attempt`,
deployed 2026-08-11. Professor's rule: a question the room already answered on
their phones must not reappear in the same class's end-of-class quiz.

Both sides of the quiz had to change together, and that is the part worth
remembering. `course-class-quiz` sizes the instance (`question_count`) when the
instructor presses **Start the quiz**; `course-activity-attempt` picks the actual
rows per attempt. Filtering in only one of them would have handed students a quiz
whose progress indicator outlived its questions — "3 of 10" that ends at 5.

`askedQuestionIds` reads `pulse_rounds` for the session, in any state: a round
opened and closed early was still put in front of the room. `withoutAsked` falls
back to the unfiltered pool when the subtraction would leave nothing — a short
bank whose every question was used as a pulse check must still produce a quiz.

Scope is one class session on purpose. The same question stays available to a
different group and to next semester; "already asked" is a fact about this room
today, not about the question.

Consequence worth knowing: quiz size is now `min(bank − asked, 12)`, so it moves
with how many pulse checks actually get sent. Week 1 Class 2 (15-question bank,
5 planned pulses) yields 10 if all five are sent, 12 if none are.

**Not yet exercised at runtime** — the filter needs real `pulse_rounds`, so it is
reviewed and type-checked but unproven until a class is actually run.

### Week 1 for Group 401 imported (2026-08-11)

Two classes created for 401 with externally authored decks and banks:

| | Aug 12 | Aug 13 |
|---|---|---|
| Lecture | `security-mindset-and-the-cia-triad` | `legal-aspect-of-cybersecurity` |
| Deck | 54 slides | 41 slides |
| Bank | 20 | 15 |
| Pulse checkpoints | 7 (slides 17/22/27/35/42/48/53) | 5 (slides 4/7/15/21/38) |

Every pulse check is a question **slide inserted into the deck**, carrying the
same four options as its bank question, so the projector and the phones show the
same thing. The plans were created through `course-class-question-plan`'s
`create` action while both sessions were still `planned` — `editableSessionStates`
allows it, but `RunClass` only renders `ClassQuestionPlanBoard` when
`isLive`, so there is no way to plan a class before teaching it from the UI.
**Worth fixing**: pre-class is exactly when a professor wants to plan.

Also found while doing this: `ClassQuestionPlan.final_quiz_question_count` in
`src/api/classQuestionPlans.ts` has **no backing column and no backend code
anywhere**. It is a dead field; quiz length comes from `course-class-quiz`'s own
`defaultQuestionCount = 12`, and `EndOfClass` never sends a count.

### Roster import — encoding fixed, example file added

Two changes to the CSV import on the People screen, both from the professor
importing group 401 (26 students) for the first time:

- **Accents no longer break.** Excel's plain CSV export is Windows-1252, and the
  importer was reading every file as UTF-8, so `María` previewed and would have
  imported as `Mar<?>a`. `decodeCsv` now sniffs UTF-16 BOM → strict UTF-8 →
  Windows-1252. Seven checks in `verify-csv-roster` cover it. See pitfalls #72.
- **The instructions show an example.** A collapsible table with a header row
  and three sample rows, plus the three things that were not written down
  anywhere: header names are flexible, the group must match a group code that
  already exists, and `role` is only needed for non-students.

The columns were and remain: full name, student id (optional), institutional
email, group — with an optional `role`.

### One grade per class — weighted categories removed

Migrations `0043` + `0044` and four edge functions are deployed. This closed a
real defect: students were shown **43.7%** where their class grade was **73.96**.

Two functions had each been creating their own gradebook category and posting to
it — `course-class-quiz` posted the raw quiz score into `Quizzes` (weight 30%),
`course-class-record` posted the real composite into `Class grades` (weight
**0%**). Weighting the composite by zero meant the number on a student's phone
was the raw quiz score alone: the one figure that ignores the mastery threshold,
the pulse questions and the exit ticket. See pitfalls #59.

What changed:

- **Weighted categories are gone.** No weights tab, no category weight column,
  no weighted total. A class is one grade; the course total is their **plain
  average**. `Quizzes` and its per-lecture items are deleted (`0043`).
- **`course-class-quiz` no longer creates a gradebook item.** With no item
  carrying the quiz template, `course-activity-attempt`'s `syncGradebookScore`
  finds nothing and posts nothing. The class record is the only writer of a
  grade.
- **`gradebook_items.class_session_id`** now links a class grade to its class
  explicitly, instead of the item being found by rebuilding its title string.
  `0044` asserts every class-grade item is linked and fails the push otherwise.
- **The formula moved to `_shared/class-grade.ts`.** `course-class-record`
  (whole roster) and `course-student-progress` (one student, batched across
  classes) both call `computeGrade`, so the professor and the student can never
  read different numbers for the same class. See pitfalls #60.
- **Students now see the breakdown.** My Grades lists every posted class with
  class questions right, quiz questions right, exit-ticket status and the class
  grade, each row opening into the same arithmetic the professor sees — plus the
  instructor's written reason when a grade was changed.

Posting stays a deliberate act: a class appears on My Grades only once the
professor posts it from the class record.

### Class record shipped: QR-only check-in, attendance/engagement, per-class grading

Migration `0041` and five edge functions are deployed. Design:
`docs/superpowers/specs/2026-08-11-class-record-attendance-and-grading-design.md`.

**The QR code is now the only way into a live class.** Scanning writes a
`class_attendance` row (first scan wins; a re-scan never moves the arrival
time), and that row is what `course-pulse`, `course-activity-attempt` and
`course-exit-ticket` all check before letting a student take part. The **Join
class** button is gone from Today. `/live` renders a scan prompt when the server
says the caller has not checked in.

**`/teach/class/:sessionId`** — reached from the Gradebook per-class picker —
carries the two tables:

- **Attendance and engagement**: check-in time, Present / Late / Left early /
  Absent (late threshold is `class_sessions.late_after_minutes`, default 5),
  pulse response count, engagement % (answered ÷ pushed), last activity. A
  **Mark present** control writes an instructor-sourced row with a required
  note — the recovery path when a phone dies or the projector QR fails.
- **Class grading**: pulse correct/total, quiz correct/total, submission status,
  final grade. 30% pulses + 70% quiz, scaled against `MASTERY_THRESHOLD = 0.8`
  and capped at 100; a missing reflection costs 20%. Every row expands into the
  arithmetic. Overrides are append-only in `class_grade_overrides` with a
  database-enforced written reason, and never alter the calculated number.

**Post to the gradebook** is explicit per class: it ensures a `Class grades`
category and a `gradebook_items` row for the session, then upserts
`gradebook_scores` (`score_raw` = calculated, `score_final` = effective).

Two consequences worth knowing before the next class:

- **Past sessions show everyone Absent.** There are no historical attendance
  rows to backfill from — the data never existed.
- **A class that is live right now locks students out until they re-scan.**

**Not verified by an agent:** everything instructor-facing here needs the
professor signed in (see the standing constraint below). The student-side gate
is testable end to end; the two tables are not.

### Cleanup deletes deployed; unmanaged items + force-delete added and deployed on top

Both batches described below are now fully deployed and live.

**Unmanaged items + force-delete** (8 tasks, 0 per-task fix rounds, 1 final
whole-branch review with 2 frontend fixes + 1 backend fix, no Critical
findings) closes two gaps found using the delete features in practice:

- A bank-only JSON import (no deck) creates a `content_type: "quiz_bank"`
  content item that the Content Library screen's `canReleaseToReview` filter
  hid completely — no card, no Delete button, unreachable even though the
  row existed. Now shown in a dedicated "Other items" delete-only section.
- All three delete actions (class session, question bank, content item) now
  accept a `force` flag, reachable only after a normal delete is refused for
  *historical* recorded activity, gated behind a "type DELETE to confirm"
  control (`src/components/ForceDeleteControl.tsx`, shared across all three
  screens). Force never bypasses a "this is happening right now" guard
  (session/bank state, live-class usage, currently-released content, the
  active-bank DB trigger) — only a past-activity refusal.

The final review found two real frontend bugs before deploy: `ContentLibrary`'s
item lists had no `key` prop, which was harmless until `ForceDeleteControl`
became the first list child holding its own state — an unkeyed re-render
could rebind a typed-DELETE confirmation to the wrong item; and the success
notice was nested inside a wrapper that never renders when a course has only
unmanaged items, i.e. exactly the case this feature exists for. Both fixed.
The backend review found none of the three audit_log writes recorded whether
force was used — fixed, `force` is now in all three metadata objects, since
it's the only forensic trail this system has for an irreversible operation.
Deployed in the order the review flagged as load-bearing: migration first,
then all three function deploys, then the frontend push — deploying a
function before its migration would have broken the already-live *normal*
delete outright (PostgREST can't resolve an RPC call carrying an unknown
`p_force` argument against the old 2-arg function still in the DB).

**Cleanup deletes + PDF-gate** (7 tasks, 2 fix rounds, 1 final whole-branch
review with 2 Critical findings) is deployed: the "Generate from a PDF" tab
is hidden (frontend-only, reversible), and real permanent delete actions
exist for class sessions (only `planned`/`cancelled`/`closed`), question
banks, and content items — none existed at any layer before this work. Two
Critical findings were caught and fixed before deploy — see
`07-pitfalls.md` #69 for the shared root cause (a hard-delete's safety story
must trace every cascade hop and every write path into the table it
protects, not just the first of each): deleting a class session originally
could silently destroy real pulse-round history pushed through the legacy
(non-plan-checkpoint) flow; deleting a content item originally had no guard
against destroying real end-of-class quiz attempts via a 4-hop cascade.

**Known, accepted, not fixed in either pass** (all judged non-blocking,
tracked here for whoever picks this up next): session/bank refusal messages
stay English-only (raw `Error` messages, per each file's own pre-existing
convention) while content-item's are bilingual stable codes — closing this
needs a stable-code convention added to two more backend files. None of the
six delete/force-delete actions has an executable regression test — the
single largest production-readiness gap across both batches. Content-item
force-delete's activity-history detection compares a translated string
client-side, which drops the "Delete anyway" offer on a live language
switch (self-heals on retry). None of this has been browser-verified by a
human — agent test sign-in refuses the instructor role in this project, so
no subagent can perform that pass. Specifically worth exercising first: a
closed class day that had live questions, a lecture with quiz history behind
it, the unmanaged-items section's layout, and a full force-delete flow on
each of the three entities.

### Class Question Plan auto-checkpoints deployed

**Class Question Plan auto-generated checkpoints** (7 task reviews, 1 fix
round, 1 final whole-branch review with 0 findings) is deployed: migration
`0036_question_slide_hints.sql` applied; `course-content-import`,
`course-question-bank`, `course-class-question-plan` redeployed and confirmed
live (401, not 404); frontend pushed. A professor's imported JSON now keeps
its `covers_up_to_slide`/`topic` metadata instead of discarding it, a Class
Question Plan auto-builds its checkpoints from that metadata the moment it's
created, and the live picker during class is a single "which slide am I on"
dropdown instead of a scrolling card list. Not yet browser-verified by the
professor — agent test sign-in refuses the instructor role in this project,
so no subagent can perform that pass.

**Cleanup deletes + PDF-gate** (7 tasks, 4 fix rounds across the batch, 1
final whole-branch review + 2 re-review rounds) is implemented, committed to
local `main` in both repos, and **not yet deployed** — pending the
professor's explicit go-ahead. What it adds:

- The "Generate from a PDF" tab is hidden (frontend-only, reversible; the AI
  pipeline itself is untouched).
- Real, permanent delete actions for class sessions (only `planned` /
  `cancelled` / `closed`, never live), question banks, and content items —
  none of the three existed at any layer before this work.

**Two Critical findings, both caught in review before deploy, both fixed and
re-verified — see `07-pitfalls.md` #69 for the shared root cause:**
deleting a class session originally could silently destroy real pulse-round
history pushed through the legacy (non-plan-checkpoint) push flow; deleting a
content item originally had no guard against destroying real end-of-class
quiz attempts and answers via the `activity_templates → activity_instances →
student_attempts → student_responses` cascade. Both delete paths now refuse
outright on any real activity rather than silently losing it. A third,
smaller gap (question bank delete could disrupt, not destroy, a live class by
deleting its running Class Question Plan) was also closed.

**Known, accepted, not fixed in this pass** (all judged non-blocking by the
final review, tracked here for whoever picks this up next): session-delete
and bank-delete refusal messages are English-only (raw `Error` messages, per
each file's own pre-existing convention) while content-item's are bilingual
stable codes — closing this needs adding a stable-code convention to two more
backend files, out of scope for this pass. None of the three deletes has an
executable regression test (`tools/verify-*.mjs` verifies structure/shape
elsewhere in this codebase, not these); this is the single largest
production-readiness gap on this work and a good candidate for the next
increment. Content-item delete's new activity-history guard is two
round-trips, not one transaction (narrow TOCTOU window). None of this has
been browser-verified by a human for the same reason noted above.

### External content import is deployed — instructor browser verification is the professor's, not yet done

Implemented, reviewed (5 task reviews + 2 fix rounds per repo, plus a final
whole-branch review + 2 fix rounds per repo — one Critical finding, fixed and
independently re-verified against live production data before deploy),
merged to `main` in both repos, and deployed:

- `course-content-import` (new function) and `course-generation-worker`
  (carries the rebuilt deck engine) are deployed to project
  `ojmbupftdikwmlqvibwt`. Confirmed live by a direct unauthenticated request
  returning the function's real 401 response, not a 404.
- The frontend is live at the confirmed bundle hash `index-CMHNVQqE.js` /
  `index-BpRzTDRG.css` — checked by fetching the live page and comparing
  against the local `vite build` output, not assumed from a successful push.
- No migration — every column the feature writes already existed. Confirmed
  by `npx supabase migration list --linked` showing every local migration
  already matched on remote, both before and after this work.
- All 25 frontend verifiers, the backend's `verify-classroom-language.mjs`/
  `verify-content-import-security.mjs`/`verify-slide-checkpoints.mjs`/
  `verify-live-checkpoint-security.mjs`, `deno check` on both new backend
  files, `npm run typecheck`, and `npm run build` all pass on the merged
  `main` in both repos — verified after merge, not only on the feature
  branch.

**What is verified by a passing check versus what has been seen work in a
browser** matters here more than usual. Everything above is code-level: local
verifiers, typechecks, a build, and confirming the deployed artifacts are
genuinely live. **No browser click-path in this feature has been exercised**
— test sign-in refuses instructors, so an agent cannot reach the Content →
Import tab, the preview/repair flow, the deck upload, Run Class with an
imported deck, or a live pulse question reaching a real device. Test
fixtures, the exact click path for each, and a note on which existing lecture
decks need **Refresh lecture deck** (only `week-01-lecture` — see pitfall
list and the professor's handoff notes) were prepared and handed to the
professor rather than run. Until that pass happens, treat this feature as
"passes every check that can run without a human at the keyboard," not as
"seen working."

The authoring prompt (`ImportPromptCard.tsx`) has been tested against exactly
one model (Claude) — see the visible caveat on the Import screen itself, and
`docs/04-decisions.md` for the reasoning. Not yet run against ChatGPT or
Gemini.

The known, accepted limitations from the final review (documented, not
fixed, all judged low-probability or already covered by a second independent
check — none affect the guard against the Critical finding above): a narrow
timing window in the deck resolve/write split if two instructors import the
same slug concurrently (single-professor course today); a theoretical
draft/archived-bank status gap with no reachable path found; a legacy
`course-quiz-compatibility` shape that only a raw UUID typed as an import
slug could reach; a shorter re-import archives a hand-edited question in the
now-excluded tail the same as any other; option positions aren't required to
be distinct. See the branch's final-review reports for the full reasoning on
each.

### Current state supersedes older entries below — PDF teaching plans are deployed

The current consolidated state is in `PROJECT-HANDOFF.md`. Read it before using
the chronological notes below; some older entries record a discovery that was
subsequently fixed and must not be read as the present state.

The PDF generation redesign is deployed:

- `0035_pdf_teaching_plans.sql` is applied in Supabase.
- `course-generation`, `course-generation-worker`, and `course-question-bank`
  are deployed with the teaching-brief, editable-plan, source-mapped flexible
  question-bank, and grounding workflow.
- The Cloudflare Pages UI is live with deck-and-bank/bank-only choice, free-text
  teaching instructions, and structured checkpoint/question preferences.
- The production browser has confirmed the new form. A complete fresh PDF upload
  → plan review → generated deck/bank inspection is still required before calling
  the end-to-end workflow browser-verified.

The backend synchronization and deployment follow-up is complete at commit
`0cb36b6`. The legacy-slide compatibility fix and Deno type-check fixes are now
in GitHub `main`, the primary backend folder, and the deployed
`course-generation`, `course-generation-worker`, and `course-question-bank`
functions.

The content-authoring loop is complete in the real `course-content` repository:
24 storage-backed items were pulled, validated, and one safe publish was verified
through the real student Review path. Its README may still describe the original
scaffold; use `PROJECT-HANDOFF.md` as the current state until that repository's
documentation is refreshed.

### Platform-side repository sync implemented; production rollout is a separate gate

The authoring loop is now represented in the platform code as well as the private
repository. `course-content-sync` is an instructor-only Supabase Edge Function that
reads `mzareei/course-content` `main` with the server-side
`COURSE_CONTENT_GITHUB_TOKEN`, validates the selected item's metadata and artifact,
hashes it for an unchanged no-op, writes a private-storage version, and records the
source commit plus audit event. It never writes `content_releases`.

The Content screen now shows **Sync from repository** only for an owned,
storage-backed item, with English/Spanish confirmation, progress, success, no-op, and
failure strings. The existing **Make available** control remains a separate step, so
pulling a change cannot accidentally make it visible to students.

Verified locally: backend and frontend static contracts, `npm run typecheck`,
`npm run verify` (20 verifiers), `npm run build`, and `git diff --check` all pass.

Not yet live: set `COURSE_CONTENT_GITHUB_TOKEN`, deploy `course-content-sync`, and
push the frontend. The exact commands and the required token scope are in
`docs/06-runbook.md`. No production content or student release was changed by this
implementation.

### Content-repo sync completed: authoring loop is now wired end to end

The real `mzareei/course-content` checkout now contains the missing fetch half
of the workflow (`tools/pull.mjs` and `lib/pull-metadata.mjs`), the current
README, and byte-identical copies of the three deck-engine templates from
`mzareei.github.io/supabase/functions/_shared/templates/`.

Using the professor's own short-lived instructor session, the pull tool fetched
all 24 storage-backed items by their known slugs:

```
week-01-lecture
week-01-lecture-2
week-01-mission-01
week-02-lecture
week-02-lecture-2
week-02-mission-02
week-02-mission-03
week-03-lecture
week-03-mission-04
week-04-mission-bridge
week-05-lecture
week-05-mission-05
week-06-lecture
week-06-mission-bridge
week-07-lecture
week-07-mission-06
week-08-mission-bridge
week-09-lecture
week-09-mission-07
week-10-lecture
week-10-mission-08
week-11-lecture
week-11-mission-09
week-12-lecture-1-access-control-deep-dive
```

The two `static_path` resources (`review-coach`, `teacher`) and the
`supabase_record` activity (`week-01-quiz`) were intentionally not pulled;
they are not storage-backed authored artifacts. `node tools/validate.mjs`
passes for all 24 pulled items. Two production artifacts needed content-side
fixes before validation: the Week 1 legal lecture declares its two legitimate
teaching links (`amiunique.org` and `tosdr.org`), and the Week 3 XSS example
uses `location['href']` so the validator does not mistake the code sample for
a real relative HTML reference. The public-origin prohibition was not weakened.

The loop was verified live on `week-02-lecture`: a harmless title marker was
published as version 1, Week 2 was temporarily made available from the
instructor Content screen, and the signed-in student view was opened through
Home → View as student → Review. The deck rendered in the gated iframe and
reported the marker in its document title. The temporary whole-course release
was then closed; the pre-existing Week 1 release was not changed.

Remaining authoring work is human translation: first pulls use the English
title/summary as the Spanish placeholder because production has no Spanish
metadata source. The actual Spanish copy must be written before those items
are published as bilingual source. The two static-path resources still need
the separate public-site retirement decision described in audit finding G4.

### `mzareei/course-content` verified: still just the scaffold — no lecture content has ever been pulled in

The professor's actual intent, stated plainly: **`course-content` is meant to
be the one place the material lives.** Clone it to a laptop, edit a lecture
there, push — and the platform pulls the published result into production.
Nothing else should need touching to change a slide.

This session has direct read/write access to the real `mzareei/course-content`
repository (earlier sessions did not — see the blocked note in
`PROJECT-HANDOFF.md`). Checked it directly rather than trusting the entries
below it in this file. **It is not the state those entries imply.**

What is actually there — one commit, `8f34c26 "Course content authoring
repository"`, on both `main` and this session's branch:

```
README.md   course.json   lib/validate.mjs
tools/publish.mjs   tools/validate.mjs   .github/workflows/validate.yml
```

That's the *original* scaffold — the placeholder committed because the agent
that first stood up the repo request "could not create the repository" and
left this as the starting content (its own README still says so, verbatim).

What is missing, all three load-bearing:

1. **`tools/pull.mjs` and `lib/pull-metadata.mjs`** — the fetch half of the
   loop, added later to `course-platform/tools/content-repo/` (see the
   "pull.mjs, the missing half" entry below). That entry already flagged
   "this session has no access to that repository" when it shipped the tool —
   and nobody with access has copied it across since. Confirmed by diff: the
   real repo's `tools/` and `lib/` are missing exactly those two files,
   nothing else differs.
2. **`courses/` does not exist.** Not one of the 27 production content items
   has ever been pulled down. "Modify Week 1" has no local file to open yet.
3. **`shared/`** — the mirrored deck-engine copy the repo's own README
   documents in its layout section — was never added either.

So despite the "deployed to production" entry below recording step 1 as
"`mzareei/course-content` created; `tools/content-repo/` moved into it" —
that was true only for the *tooling that existed at the time*. The edit-
locally-and-push loop the professor wants has never actually worked, because
half the tool for it didn't exist yet when the repo was populated, and the
other half (any actual content) was never pulled. See pitfall #62.

Full plan to close this gap, and a ready-to-paste continuation prompt, are in
the new `docs/CONTENT-REPO-SYNC-HANDOFF.md`. Nothing described there has been
started — this entry is documentation of the gap, not a fix.

### Sharing was reported done and wasn't — the write side is now built

The design and every consuming piece (`canEditContentItem`,
`isVisibleContentItem`, `copy_content_item`, the `content_shares` table, the
frontend's shared badge and Copy button) shipped in the first round, but
nothing ever wrote a `content_shares` row. There was no action an owner could
call to grant a share — "share with a group" existed in the schema and
nowhere else. Found when the professor asked "where's the share button?" and
there genuinely wasn't one.

Fixed on `mzareei.github.io#9` (backend) and `course-platform`
`claude/tc2007b-private-content-4cniyb` (frontend, this branch):

- `course-content-library` gained `share_content_item` / `unshare_content_item`.
  Owner-gated by `canEditContentItem`, never mere `isVisibleContentItem`, so a
  recipient can never re-share. Target section validated against real
  `course_sections` (`planned`/`active`). Upsert on
  `(content_item_id, section_id)` so re-sharing is idempotent. Audited both
  ways.
- `listContentLibrary` now also returns `shareable_sections` (a course-wide
  id/code/name-only list, deliberately wider than the roster-filtered list
  `course-section-management` shows — pitfall #38 hides sections you don't
  teach, but sharing requires naming one you don't) and `shares` (an owned
  item's current grants, empty for anything you don't own).
- The Content screen has a **Share** button next to Make available, on any
  owned item that isn't itself a share you received. It picks a group from
  `shareable_sections`, and an owned item with active shares lists them with a
  **Revoke** button.
- Test-first: `mzareei.github.io`'s `tools/verify-content-sharing-action.mjs`
  and this repo's `tools/verify-content-share-granting-ui.mjs`, both captured
  RED before implementation. Full sweeps: 63 backend verifiers (62 baseline +
  1, same 7 pre-existing unrelated failures as pristine `origin/main`), 18
  frontend verifiers (17 baseline + 1), typecheck and build clean.

**Not yet done:** backend PR #9 needs merging and
`course-content-library` redeploying before the Share button does anything in
production; this frontend branch needs merging and pushing. Not yet
click-tested by the professor.

### "How do I modify Week 1?" — pull.mjs, the missing half of the content repo

The content-repo scaffold (`tools/content-repo/`, meant to become
`mzareei/course-content`) shipped `publish.mjs` but nothing to get a lecture's
*current* bytes back out of production to edit in the first place — none of
the 23 real items had ever been pulled into it, so "modify Week 1" had no good
answer.

Added `tools/pull.mjs`: reads a slug from `course-content-library`, fetches
its live HTML through the same gated `course-content-access` +
`course-content-serve` path the app's own instructor preview uses (never a
storage signed URL or a service key), and writes it plus a matching
`content.json` into the repo layout `publish.mjs` already expects.

The one real limitation: `content_items.title`/`summary` are English-only
database columns, so there is no Spanish source to pull. A first pull sets
`title.es`/`summary.es` to the English text and prints a warning;
`lib/pull-metadata.mjs` (the pure, tested part — `pull.mjs` itself is
untested I/O, like `publish.mjs`) guarantees a re-pull never overwrites a real
translation already on disk once someone has written one in. Test-first:
`tools/verify-content-repo-pull.mjs`, four fixtures, captured RED (missing
module) before implementation.

README.md in the scaffold now documents the pull → edit → publish loop and
exactly where the instructor's own session token comes from (the browser
localStorage key `supabase-js` already writes, not a new credential).

**If `mzareei/course-content` was already created from an earlier copy of
this scaffold, `tools/pull.mjs` and `lib/pull-metadata.mjs` need to be copied
there by hand** — this session has no access to that repository.

### Private content work — deployed to production, decks cleaned live

Both PRs (`course-platform#1`, `mzareei.github.io#7`) merged and deployed by
the professor on 2026-08-07. Sequence actually followed:

1. `mzareei/course-content` created; `tools/content-repo/` moved into it.
2. Migrations `0030`–`0033` pushed. `0033` failed on the first attempt —
   `function min(uuid) does not exist` — because Postgres has no built-in
   `min()`/`max()` aggregate for `uuid`. Harmless: one statement, one
   transaction, nothing written. Fixed in `mzareei.github.io#8` (dropped the
   aggregate, used `count` + `limit 1` instead) and merged; re-run succeeded.
3. All six edge functions deployed
   (`course-section-management`, `course-content-library`,
   `course-content-upload`, `course-content-cleanup`, `course-generation`,
   `course-generation-worker`).
4. **The Content-screen cleanup was run live by the professor.** Reported
   "22 item(s) still link out, 104 link(s) in total" → "Cleaned 22 item(s)."
   22 rather than 23 is correct: `week-01-lecture` was already partially
   cleaned via the legacy checkpoint-preparation path (see pitfall #57/#58
   history) and correctly reported nothing to change.

Pending: a student-side spot check (open a cleaned mission through Review,
confirm the deck still works and "Return to lecture" is gone rather than
broken) to close the loop per pitfall #1 — a reported success is not the same
as verifying through the real entry point. Once confirmed, D5/D6 (retiring the
public site) are unblocked, including archiving/repointing the `review-coach`
and `teacher` static_path items found in G4.

### Private content work — approved, implementation started

The professor approved the design on 2026-08-05 and settled every open
question. Decisions, all recorded in `04-decisions.md`:

- Content repository is `mzareei/course-content`, one directory per course
  (`courses/tc2007b-information-security/`).
- Ownership backfill assigns all existing items to the owner profile (D3).
- **Sharing is copy-based, not read-only.** A receiving instructor sees a
  shared item and takes a copy they own and can edit; the question bank is
  copied with it. The owner's later improvements deliberately do not propagate.
  This supersedes the "read-only, cannot edit" wording in the original brief.
- Publishing is CLI-only; the GitHub Action validates and cannot publish.
- Public course content is removed but the course page stays, carrying a link
  to the platform.
- Generation is routed through the same ownership and versioning rules, the
  legacy-nav matcher is fixed, and a trigger refuses deletion of a content item
  with an active bank.

**Shipped to the branch, not deployed:**

1. **Group lifecycle is platform-owner only** (requirement 8). The backend
   update branch refused nothing before — any assigned instructor could rename
   or archive a group. It now returns `section_management_owner_only` as 403,
   and the frontend hides Add / Edit / Retire for non-owners with a bilingual
   explanation. Manage members stays available to assigned instructors.
2. **Migration `0032_content_ownership_and_versions.sql`** — `owner_profile_id`,
   `visibility`, `forked_from_content_item_id`, `content_shares`,
   `content_versions`, and a BEFORE DELETE trigger on `content_items` that
   refuses when an active question bank still points at it. Additive only, and
   deliberately contains **no backfill** so D3 stays a separate approved step.
3. **`removeLegacyDeckNavigation` now cleans missions.** It only ever matched
   `ui-btn`; missions use `btn` / `back-link` and link to the public `progress/`
   app and the public copy of their own lecture.

4. **Content is private to its owner** — `course-content-library` and
   `course-content-upload` scope reads to owner ∪ shares and refuse writes to
   anything the caller does not own. The null-owner branch is load-bearing:
   every existing item is unowned until `0033` runs, so hiding null-owner items
   before the backfill would empty the professor's own Content screen.
5. **Migration `0033_assign_content_ownership.sql`** — the D3 backfill. Refuses
   unless exactly one active platform owner exists, fills only null owners,
   leaves `created_by` alone, asserts its own postcondition.
6. **`removeLegacyDeckScriptNavigation`** — the anchor pass alone left three
   links per lecture, all in the legacy engine's M/Q/E keyboard shortcuts.
   Measured on all 23 real decks rebuilt from source: **111 public references
   before, 0 after**, every script block still parsing.
7. **`course-content-cleanup` edge function** — preview (writes nothing) and
   clean (one item per call), with the storage-safe ordering: read, transform,
   verify, back up the old bytes, record the version, then overwrite.
8. **The Content screen's cleanup control** — previews, confirms in-app, walks
   the items one at a time, and renders nothing once everything is clean.

9. **`copy_content_item`** — a receiving instructor takes a copy with its own
   storage object and its own question bank, including every question's
   checkpoint metadata and both languages. Visibility is the gate, not
   ownership; the source is never written; the copy starts `owner_private`.
10. **Generated lectures follow the ownership rules.** A slug clash owned by
    somebody else is resolved silently instead of named — naming it leaks
    content the caller may not see and blocks a title they may use. The worker
    re-checks ownership immediately before the upsert, because `create_job`'s
    check runs minutes earlier and two concurrent jobs both pass it.
    Regeneration snapshots the deck it replaces.
11. **The Content screen tells the truth about whose lecture it is.** A shared
    item is badged, explained, and offers exactly one action — Take a copy.
    Every write control is gated on `can_edit`, so no button is offered that
    would 403.

**Still to build:** the content repository `mzareei/course-content` and its
publish CLI, and the D5/D6 public-site retirement including the `review-coach`
and `teacher` items found in G4.

**Audit closed 2026-08-06.** The professor ran all five read-only queries. 27
items confirmed (12 lectures, 12 missions, 2 static_path resources, 1 activity),
14 banks, 223 questions — matching the reset record exactly. Five new findings,
G1–G5 in the audit document. The two that change the plan:

- **G1: nothing is released to students right now** — 0 of 27 items are
  student-visible. D4 currently rewrites material nobody can open, which makes
  now the safest window to do it rather than the riskiest.
- **G4: `review-coach` and `teacher` are `static_path` items pointing straight
  at the public apps D6 retires.** They must be archived or repointed in the
  same change, not discovered afterwards.

Also confirmed: only `week-01-lecture` has ever been checkpoint-prepared, so
11 lectures and all 12 missions still carry every public link (G3); one
unfinished class session is attached to `week-01-lecture`, which publish
preflight must refuse until it is understood (G2); and `created_by` is null on
all 27, so ownership must be assigned rather than recovered (G5).

**Corrected finding on generated slugs.** It was first recorded as "the second
professor silently overwrites the first". That is wrong: `create_job` already
refuses a colliding slug. What is real is that the refusal names content the
caller will not be allowed to see once the library is owner-scoped, blocking a
legitimate title and leaking that someone else's exists — plus two narrow races
where the check and the upsert are far apart. Owner-namespaced slugs plus an
ownership check at the write fix both. See pitfall #60, rewritten.

### Private content authoring and publishing — audited and designed, not built

Requirements 1–8 and 13 of the private-content brief are answered on paper. No
code was changed, no migration was written, no production row or storage object
was touched, and the private content repository was **not** created. Awaiting
the professor's approval before implementation.

- `docs/audits/2026-08-05-content-origin-audit.md` — the content-origin audit.
- `docs/audits/content-origin-audit.sql` — a read-only script that produces the
  per-item production report. Safe to run at any time, including during class.
- `docs/superpowers/specs/2026-08-05-private-content-publishing-design.md` — the
  private-repo layout, the seven-gate publish workflow, the CLI-vs-Action
  recommendation, the owner/sharing model, the group-management guards, the
  destructive-step register, and the TDD plan.

What the audit established from repository evidence:

- All 23 migrated items (11 lectures, 12 missions including 3 bridge missions)
  are `storage_object` under `courses/tc2007b/items/<slug>/`. **The filename in
  this bullet was originally derived as `index.html` and is wrong** — production
  says every item points at `deck.html`, with the superseded `index.html`
  objects still sitting in the bucket unreferenced. Corrected 2026-08-06; see
  the audit and pitfall #58.
- The public academic site still publishes every one of them, linked by hand
  from `_courses/information-security.md`. `_config.yml` excludes `supabase`
  and `docs/superpowers` but not `assets/`.
- Every object in the private bucket carries hard `https://mzareei.github.io`
  links, because `migrate-gated-content.mjs` deliberately absolutised them in
  Phase 2. Nine missions link to the **public copy of their own lecture**.
- `removeLegacyDeckNavigation()` strips four of those destinations, but only
  from `ui-btn` anchors and only during checkpoint preparation — so no mission
  has ever been cleaned, and no code path currently would.
- Content items are course-wide and unowned: any instructor can read, edit and
  overwrite any other instructor's item and storage object. `created_by` is
  null on the migrated items because `register_item` never set it.
- Group create is owner-only on the backend; **rename and archive are not**, and
  the Add-a-group card renders for every instructor.

What is still unverified: everything about production rows. This session had no
Supabase credentials and the sandbox blocks outbound HTTPS to
`mzareei.github.io`, so the 27-item inventory is derived from the code that
wrote it, not read from the database. Run the SQL script before acting.

### Single-screen classroom display — deployed and instructor-verified

Run Class is now the teaching display. The separate projector/controller card
has been removed from the normal workflow. The professor keeps the lecture
deck full-screen and the same deck document receives an answer-neutral live
question layer (prompt plus options only) when a checkpoint is sent. Reveal and
grading remain private in the Checkpoint panel; Continue clears the layer and
resumes the deck. The old projector route and `course-presentation` function
remain only as compatibility code, not part of the normal teaching flow.

Frontend commit deployed to Cloudflare Pages: `2fb1a83`.
Supabase migration `0028_class_presentation_state.sql` and edge function
`course-presentation` are deployed to project `ojmbupftdikwmlqvibwt`.

The normal-mode question overlay's opaque surface regression was fixed after a
browser screenshot showed the iframe's fullscreen layer compositing underneath
it. The app-shell verifier now guards the surface token contract.

The question preview is now answer-neutral too: before the professor sends a
checkpoint, the Run Class screen shows only the prompt and options. Correct
answer styling is reserved for the private post-reveal results state.

Live questions now include a Full screen action. It promotes the neutral
question layer to the browser viewport so the room sees one readable question;
Escape or the same button returns to the normal teaching cockpit.

Question Banks now has an instructor-only review editor. It lists every active
question used by both during-class checkpoints and the end-of-class quiz,
shows the correct option for expert review, supports bilingual prompt/option
edits, and archives questions that should no longer be used.

Instructor sign-in now accepts any valid email domain when the address belongs
to an invited instructor/platform owner. Student access remains restricted by
the institutional-domain or explicit external-access-grant policy.

The People screen now follows the same role-aware policy: an external instructor
can be added without an outside-institution reason, while external students,
teaching assistants, and observers still require the documented reason/grant.
This keeps the Add person button usable for guest professors without weakening
student access controls.

Instructor roster adds now also send a Supabase Auth invitation email. If the
address already has an Auth account, the backend sends the normal magic-link
email instead. Invited instructor rows expose a Resend invitation action, and
the People screen reports whether delivery succeeded. Backend commit `2b777a3`
is deployed for `course-roster-management` and `course-admin`.

Instructor access is now section-scoped. A regular instructor can see and
manage only the group(s) where they have an active `section_enrollments` row
with role `instructor`; the `platform_owner` is the only global course
administrator. This applies consistently to Home sessions, Classes, People,
releases, gradebook, insights, and roster mutations. The policy is enforced in
the edge functions rather than relying on the client hiding other groups.
The deployed backend scope hardening is tracked in commits `03295ad`,
`1a524d8`, and `9d40cc0`.

The canonical continuation record is now [`PROJECT-HANDOFF.md`](PROJECT-HANDOFF.md).
The production data reset has now been executed and verified. Instructor-side
browser rehearsal of the single-screen question layer is complete. A true
real-phone rehearsal remains a human-device check; Chrome's student tab was
blocked by an extension UI, so it is not represented as completed here.

### Production clean reset — executed and verified

On 2026-08-03 the signed-in Supabase SQL Editor ran the guarded reset
transaction after the owner precondition returned exactly one active owner.
The count-only postcondition query returned one course, one profile, two
memberships, four groups, and one instructor enrollment; zero sessions,
releases, attempts, responses, grades, notes, reflections, and audit rows.
TC2007B teaching assets were preserved: 27 content items, 14 question banks,
and 223 generated questions (with their options and generation assets).
Groups are `401: active`, `402: planned`, `501: planned`, and `502: planned`.
No production class session was created after the reset, so the delivered
state is clean rather than polluted by a synthetic rehearsal.

The guarded operation is preserved for future environments in backend
migrations `0030_prepare_clean_platform_reset.sql` and
`0031_execute_clean_platform_reset.sql`. Production was executed directly in
the SQL Editor because this session did not have a Supabase CLI access token;
the verifier and migration remain committed as the reproducible runbook.

### Projector browser rehearsal — fixed and verified

On 2026-08-04, Chrome exposed that the Week 1 storage deck predated the remote
navigation listener. The backend presentation state was changing, but the old
iframe ignored it. The deck engine and checkpoint-backfill function were
deployed, Week 1 Lecture 1 was upgraded through the Question banks screen, and
the live controller/projector pair was verified on slides 2 → 3 with a healthy
projector heartbeat.

Phases 1–5 are complete and deployed. Phase 6 public-site cleanup remains
separate from the clean teaching-platform reset.

---

## Done and verified live

Everything below was exercised through the real UI, not by calling endpoints.

### Foundation
- SPA scaffolded, deployed to Cloudflare Pages, auto-deploys on push to `main`.
- Auth: institutional email + 6-digit code, plus a testing sign-in for rostered
  students (refused for instructors).
- Full EN/ES bilingual (~318 string pairs), enforced by a verifier.
- Light/dark theming with OS default and an explicit override.
- Three verifier scripts running in CI.

### Content gating (Phase 2)
- All 23 decks/missions moved to a **private** Supabase Storage bucket as
  single-file HTML.
- The three-hop gated delivery chain works and is guarded by a verifier.
- `GatedFrame` viewer in the app; students only see released content.

### Live class (Phase 3)
- `pulse_rounds` / `pulse_answers`; push / reveal / close / answer.
- Question snapshotted at push; correctness withheld until reveal.
- Hybrid grading into `participation_events` (partial for answering, full for
  correct) — the existing gradebook needed no changes.
- Per-student client-side option shuffling.
- **Verified end to end:** pushed a question, fresh student session received it
  via its own poll with no reload, answered, instructor saw the live count,
  revealed, closed, and the participation row landed in the database.

### Question banks
- 11 lectures × 18 bilingual tiered questions (6 easy / 6 medium / 6 hard),
  generated and imported. 198 questions total.
- `selectQuestions` is difficulty-stratified so a quiz always mixes tiers.

### End-of-class quiz + reflection (Phase 4)
- `course-class-quiz` orchestrates start / close / status / summary /
  reflections / current, reusing the existing activity engine.
- Sequential, per-question-timed player (20s / 30s / 45s by difficulty),
  auto-advance, auto-submit, no going back.
- Reflection: one paragraph, 50–100 words, server-enforced, 5-minute grace
  window after the class closes.
- **Verified end to end**, including running a *second* quiz in the same session
  for a student who had already finished the first and submitted a reflection.

### End the class
- Closes any open question, closes a running quiz, closes the session (which
  stamps `actual_end_at`, the anchor for the reflection grace window). Confirms
  first and names the consequences.

### AI generation pipeline (Phase 5)
- Schema, `course-admin`, PDF upload actions, `course-generation`,
  `course-generation-worker`, deck skeleton + assembler, and the Content screen.
- **Dogfooded on real content**: a PDF built from the professor's own Week 2
  Lecture 2 (Access Control) produced a **33-slide bilingual deck** (126 `data-es`
  attributes) and **18 questions, exactly 6/6/6**, previewed and approved. The
  bank now appears alongside the hand-made ones and is immediately usable.
- The validator caught a real bad generation in the wild ("Q3 has 5 options")
  and the retry produced a valid bank.

### A poll runs itself start to finish (2026-08-11) — **verified end to end in production**

Auto-reveal, reopen and per-class reset were all exercised against the live Week 1
session, instructor in the professor's Chrome and a student in a second browser:

- **Timer expiry** — round left to run out, revealed itself, phone showed the
  correct answer.
- **Everyone in the room answered** — with one student checked in, revealed
  seconds after the answer, well inside the 60s window. Phone read
  "Respondiste bien · +1 puntos". That verdict was the original bug: without a
  reveal the phone says "recorded" forever.
- **Three advances** — poll opened on slide 48, stayed open through 49 and 50,
  revealed exactly on 51.
- **Reopen** — Closed → Live in one click.
- **Reset** — "Cleared 3 question(s), 1 answer(s) and 1 check-in(s). 7 planned
  poll(s) are ready to ask again", session back to Planned, plan intact.

One bug found and fixed during that run: two plan checkpoints sharing a slide
hint fired back to back, because sending the first refreshed the plan and the
effect re-ran against the same slide. Latched per arrival, not per checkpoint.

### Polls send themselves at their slide (2026-08-11) — the earlier pass

Proven against the live Week 1 session, instructor in the professor's own Chrome
and a student signed in from a second browser: the deck reached slide 22, the
planned poll pushed itself with no click, and the question appeared on the
student screen with its four options and countdown. The round was then closed and
the consumed checkpoint re-added, so the plan still holds all six polls.

Third finding from that run, and the reason the first two fixes still did nothing:
his deck is **mute**. See pitfall 65 — `functions/content.ts` now injects a
slide reporter, which is what finally closed the loop.

Note for whoever tests next: instructor screens ARE reachable by an agent through
the professor's own logged-in Chrome. The standing constraint below applies to
test sign-in, not to his browser.


The professor tested the first version and no question reached the phones. Two
reasons, both found before touching code again:

1. It was never deployed. The commit sat on `design/ui-redesign-2026-08-11`;
   Pages deploys from `main`.
2. It hung off the wrong path. Auto-send fired on deck checkpoints and drew from
   the bank's checkpoint coverage — which Week 1, an imported deck, does not
   have. His polls are class-question-plan checkpoints ("Poll 6" is position 6),
   keyed by `slide_hint`. See pitfalls 63 and 64.

What now runs: the plan board watches the slide the deck reports and pushes the
matching planned poll through the same `pushPlanQuestion` the Ask now button
uses. A poll fires once, only while `planned`, and never re-fires when the
professor pages back over its slide. The board also shows, before class, which
slide the deck is on and which poll is armed next — and says plainly when a deck
cannot report its slide at all, which is every lecture after Week 1.

Verified: 27 verifiers including a lecture-walk simulation, and a postMessage
harness against the real Week 1 deck that established the slide-numbering rule.
Not verified: the instructor screens themselves (see the standing constraint).

### Auto-send at a checkpoint slide (2026-08-11) — the deck-checkpoint path

The professor lectures from the platform's own deck in fullscreen. Sending a
poll used to mean leaving fullscreen, finding the cockpit, and clicking **Send
to the class** — three moves in front of the room for something the deck already
knew was due.

Reaching a slide with `data-checkpoint-key` now draws its question and pushes it
to student phones automatically. Space still reveals the answer and Right Arrow
still continues, so the whole checkpoint runs without leaving the deck. It is a
switch in the checkpoint panel (`cp.auto-send-checkpoints`, on by default,
per-device) because auto-send is a promise to the room: a professor who reads
the question aloud first turns it off and gets the old behaviour back.

Nothing changed on the server — this is the same `course-pulse` `push`. The
guard rails live in `shouldAutoSendCheckpointQuestion` and are covered by
`verify-deck-protocol`; see pitfall 62 for why they are worth keeping strict.

Last mile is the professor's: instructor screens cannot be driven by an agent
(see the standing constraint below).

---

## Remaining work, in priority order

### 0. Coherent class lifecycle redesign — **DEPLOYED AND VERIFIED IN PRODUCTION**

The professor exercised the product on 2026-07-29 and found that the individual
features do not yet form a coherent teaching workflow:

- Week 1 Quiz can be marked "Students can open it", while Today and Review
  intentionally filter that legacy activity because it has no standalone
  player. The write succeeds and nothing appears to students.
- Reflections belong to a live class session, but the Content screen makes the
  quiz look like independent released content.
- Home's "No sessions planned" state does not lead to scheduling; class days
  are buried inside People.
- Run Class and the lecture deck are separate screens.
- Existing decks still contain links to retired Home, Mission, Quiz, and Exit
  pages.
- Pulse questions can be drawn from concepts that have not yet been taught.
- View as student is not a faithful student shell.

The product design is approved in
`docs/superpowers/specs/2026-07-29-coherent-class-lifecycle-design.md`.
Key decisions: quizzes remain live-only; question banks become
professor-only; Classes becomes a first-class screen; a 40-slide lecture gets
approximately four pre-generated concept checkpoints; QR joining returns; and
Run Class renders the deck with context-sensitive controls; live checkpoints
appear in the same deck surface rather than a separate projector window.

The redesign is live and its instructor lifecycle has been rehearsed through a
production browser session. The real-phone classroom dress rehearsal remains
the next operational milestone and must be performed with actual student
devices; it is not safe to manufacture that evidence from a desktop tab.

### 0.1 Content delivery semantics — **DONE, verifier-covered**

Built 2026-07-29 as the first coherent-lifecycle increment. `studentDelivery()`
now classifies content by both content type and source: storage-backed lectures,
missions, case files, and resources use the gated viewer; approved external
materials open externally; activities and question banks are live-only; all
other shapes remain internal. `canReleaseToReview()` is used by the instructor
library and both student content consumers, so the professor is never offered
an availability control for something students cannot actually open.

Today is temporarily limited to releases assigned to a class session while the
next increment moves it fully to the session collection. Review now contains
only viewer or external materials. The Content screen labels its reviewable
materials and has a professor-only Question banks placeholder that makes the
live-only rule explicit. `tools/verify-content-semantics.mjs` locks the
classification contract; typecheck, all verifiers, and the production build
pass.

### 0.2 First-class class sessions and Classes — **DEPLOYED AND VERIFIED**

Built 2026-07-29 as the second coherent-lifecycle increment. Class sessions and
content releases are now separate collections in `course-auth-context`.
Students receive their active-section sessions even when no content release
exists, and Today plus Live discover class state only from that session
collection.

The instructor navigation now has **Classes**, which owns Groups and Class days;
People is roster-only. Scheduling can associate an optional reviewable lecture,
prefills the student-facing title, and records the lecture directly on the
session. A dedicated `start_session` transition moves `planned | open |
continued` to `live` with the start timestamp in the same update and writes one
state-change audit event.

`tools/verify-class-sessions.mjs` locks the student-session context, the
session-driven Today/Live paths, and the Classes route. The verifier was captured
RED before implementation and GREEN afterwards. Frontend typecheck passes.
Migrations 0020 and 0023 and the affected functions are live. On 2026-07-29 the
production empty state led from Home → Schedule a class → Classes; the
instructor created “Deployment rehearsal — Week 1”, opened it from Home, and
started it successfully. Migration 0023 is the production-discovered fix that
adds Supabase's trusted `extensions` schema to the atomic starter's search path.

### 0.3 QR class joining — **DEPLOYED; ENROLLED STUDENT PATH VERIFIED**

Built 2026-07-29 as the third coherent-lifecycle increment. Run Class now shows
a real QR code before and during class. It encodes only the session URL
(`/join/<join_code>`), never a pulse question, so students scan once and remain
on `/live` for the questions, quiz, and reflection that follow.

The new `course-session-join` edge function validates the JWT, active profile,
4–12-character alphanumeric code, session state, and active student enrollment
for the session's group. It creates no enrollment. Signed-out QR visits keep
only a strict same-origin `/join/<UPPERCASE_CODE>` return path, consume it once
after code or test sign-in, and also clear it after a magic-link return.

`tools/verify-class-sessions.mjs` covers the return-path allow-list and
one-time consumption. The verifier was captured RED with the expected
missing-module failure, then GREEN. The function was syntax-bundled, checked
to contain no database writes, deployed to Supabase project
`ojmbupftdikwmlqvibwt`, and a live unauthenticated POST reached the function
and returned its own HTTP 401 response.

The five authenticated browser cases remain pending because this increment was
not pushed to Cloudflare Pages and an instructor email code is required to
prepare a live class. Do not describe QR joining as browser-verified until the
signed-in enrolled, signed-out return, unenrolled, invalid-code, and
closed-session paths have all been exercised through the UI.

### 0.4 Existing-deck checkpoint preparation — **DEPLOYED; WEEK 1 PILOT VERIFIED**

Built 2026-07-29 as the recoverable legacy-content increment. The instructor-only
Content action maps each existing 18-question bank to 3–5 teaching checkpoints
without rewriting prompts, options, or question status. Migration 0022 adds the
durable `none | pending_upload | ready` preparation state and two service-role
RPCs: the first atomically commits all five metadata fields for the full bank
with `pending_upload`; the second acknowledges readiness only after the same-path
private deck upload succeeds.

An interrupted upload or readiness acknowledgement is now recoverable from the
Content card. The pending action rebuilds the mapping from persisted metadata,
re-transforms the current deck, uploads, and finalizes without another model
call. The pure deck transformer is retry-idempotent, structurally rejects nested
sections inside teaching slides, and removes bare-relative, parent-relative,
root-relative, and absolute Home/Mission/Quiz/Exit controls with query/hash
variants while preserving unrelated navigation.

Migration 0022 and the backfill function are live. Week 1 Lecture 1 was prepared
in production: 45 teaching slides became a 50-section deck with five embedded
checkpoints; all 18 existing questions were mapped; and Home, Mission, Quiz,
and Exit disappeared while language, theme, overview, help, fullscreen, and
slide controls remained. The production pilot also found and fixed model output
that used a different concept key per question and returned six adjacent
boundaries. The server now groups all candidates at one slide boundary and
merges the closest adjacent boundaries when more than five are returned.

### 0.5 Unified Run Class cockpit — **DEPLOYED AND VERIFIED END TO END**

Built 2026-07-29 as the instructor-facing lifecycle increment. A scheduled
session's selected lecture now opens privately inside Run Class beside one
checkpoint panel; the obsolete lecture/bank and difficulty controls are gone.
Before live, the professor sees the real deck, session QR, and the atomic
**Start class** action. During live teaching, the same deck and QR remain in a
two-column cockpit with the action appropriate to the current checkpoint.

Instructor deck access is content-item based and teacher-gated. It mints the
existing short-lived content token without creating or consulting a student
release, and the iframe loads only `/content?t=…` with scripts and same-origin
enabled—never `srcdoc`, `blob:`, popups, or a public Storage URL.

At a deck checkpoint, Run Class draws from that exact slide boundary. Sending
passes only `question_id` plus `checkpoint_after_slide`; `course-pulse` reloads
the active question and bank, then refuses the push unless the session is
exactly `live`, the session lecture matches the bank content item, and the
stored question checkpoint matches the request. Prompt and bilingual option
text are still snapshotted into the round. Space remains a generic deck intent:
the parent alone maps `ready → send` and `open → reveal`. Right Arrow remains
deck navigation; the parent closes any round once the deck reports it resumed.
If the bridge does not connect, the panel exposes the bank's validated
checkpoint coverage as a manual selector.

The final quiz is absent from the active panel until the last prepared teaching
point is reached or the professor explicitly opens it. The existing sequential
20/30/45-second student quiz and automatic reflection transition remain
unchanged; student pulse rendering now uses the bilingual bank snapshot.

`tools/verify-app-shell.mjs`, `tools/verify-deck-protocol.mjs`, and backend
`tools/verify-live-checkpoint-security.mjs` cover cockpit composition, gated
iframe rules, parent-authoritative Space intent, client protocol mismatch
rejection, server lecture/checkpoint identity enforcement, reload recovery,
conditional reveal/close transitions, repeated-key suppression, and token
refresh at the current slide. A session close now closes every open or revealed
pulse on the server first.

Production rehearsal evidence (session
`65803c87-f4b8-4dfe-a53f-6608ba8637d4`, closed):

- Instructor Home → Run class → Start class loaded the cleaned 50-section deck
  and QR in the single cockpit.
- A question authored after teaching slide 15 was prepared from slides 11–11,
  sent, received by a separately signed-in QA student from Today → Join class,
  revealed, restored after an instructor reload, and closed.
- The timed 12-question quiz arrived automatically; QA Test Student submitted
  11 answers and received 18.2%.
- Closing the quiz automatically opened reflection. A 58-word reflection was
  submitted, appeared in the instructor feed, and the student completion screen
  confirmed pulse/quiz/reflection were recorded.
- The class was closed using the bilingual two-step in-app confirmation.
- Gradebook → Per class showed the pulse distribution, 1 of 1 quiz finished
  with an 18% class average, and the full 58-word reflection.

The rehearsal intentionally records 0 pulse answers because the 60-second pulse
expired while the separate student browser was reconnected. Delivery, expiry,
reveal, recovery, close, quiz, reflection, and gradebook persistence were all
observed through the production UI.

### 0.6 Faithful student preview — **DEPLOYED AND VERIFIED**

The instructor preview now exposes all three real student destinations:
`/student`, `/student/review`, and `/student/grades`. Each route renders the
same screen component and the same `StudentShell` bottom navigation used by a
student. Instructor tabs are removed during preview and a visible exit returns
to `/teach`.

The production preview was exercised at 375×812 and 430×932. Today, Review, and
My Grades used `/student/*` links, the instructor navigation was absent, and the
exit returned to `/teach`. Review contained Week 1 Lecture 1 and did not contain
Week 1 Quiz. The projector cockpit was checked at 1440px width with a 977×549
deck iframe and no horizontal overflow.

The latest deployed frontend bundle is `index-Dlk8k3FR.js` from commit
`af1ea69`. Backend `main` is `623feca`; migrations 0020–0027 and the class
management, roster management, and student-notes functions are deployed.

### 0.7 Class management and private notes — **DEPLOYED AND PRODUCTION VERIFIED**

Instructors can append private notes for an exact class session and enrolled
student from Gradebook → Per class. Notes can be marked for follow-up; the
original text remains immutable and only an open follow-up exposes Resolve.
People opens the same profile-scoped history across all class sessions. The
note API is deliberately absent from student screens and rejects student tokens.

The partial 2026-07-30 production rehearsal used QA group `QA730E`, class session
`460a2cfb-bdfb-4e41-8577-21336195789e`, and class code `98ZXF8UV`:

- The instructor assigned QA Test Student through the group-filtered People
  screen, created a class with no lecture, attached Week 1 Lecture 1, then
  replaced it with Week 1 Lecture 2.
- The group edit round trip persisted all fields. Starting the class changed it
  to Live; Classes no longer offered Edit after `actual_start_at` existed.
- QA Test Student reached the class from Today → Join class. Closing it used the
  in-app two-step confirmation and produced a group-scoped `review_only`
  release. QA Test Student saw Week 1 Lecture 2; Test Student, in another group,
  did not.
- Gradebook → Per class created a follow-up note and resolved it. Real
  QA-student edge calls returned auth context 200 and progress 200 without the
  note; `course-student-notes` returned 403 without note content.

Cleanup removed the QA Review release, restored QA Test Student to Section A,
restored Section A to Archived, restored the QA group's edited details, and
retired the QA group. The closed QA class and resolved note remain as deliberate
audit/history rows. Production group `TC2007B-401` stayed unchanged and Active.

The release gate found two deployment issues during that partial rehearsal. Strict Deno
checking exposed inferred-`unknown` rows in all three management functions; the
fixes are behavior-preserving type narrowing. The first assignment then failed
because the roster function had been deployed before migration
`0025_assign_student_section.sql`; applying the pending migration supplied its
transactional RPC and the same UI action passed.

Review then found two assignment-boundary defects: the original release
permitted a direct RPC assignment into a completed or archived group and
excluded invited students before first sign-in. Migration
`0026_guard_student_section_assignment.sql` replaces the deployed RPC without
rewriting 0025: only `planned | active` groups are targets and
`active | invited` student profiles are eligible. The People UI mirrors
those rules and maps structured server error codes to bilingual messages. These
fixes are deployed.

The safe follow-up used session
`27d87aed-b99c-4d83-8235-398fe1f28ba0` and completed the full matrix:

- Content → Assign to a class replaced planned Week 1 Lecture 1 with Week 1
  Lecture 2; a fresh Classes load proved persistence.
- After start, the Live row exposed no Edit. A stale authenticated
  `update_session` request with a sentinel title was refused, and a fresh row
  proved no title or lecture mutation.
- Before close, Week 1 Lecture 2 completed Make available now → Remove from
  Review; the live class remained assigned to Week 1 Lecture 2.
- Gradebook's class-scoped history created and resolved a unique note; People's
  profile-scoped history showed the identical resolved record.
- An invited profile was assigned before first sign-in. After QA730E was
  archived, its People view explained that it must be reactivated and a
  pre-staged authenticated assignment was refused without changing enrollment.
- A fresh QA-student privacy check returned auth context 200 and progress 200
  without the new note; the notes endpoint returned 403 without note content.

Cleanup restored Student Name to A and QA Test Student to TC2007B-401, archived
A and QA730E, removed the temporary whole-course Review release, and left the
new QA class Closed. TC2007B-401 remained unchanged and Active.

#### Final composition hardening — **DEPLOYED AND PRODUCTION VERIFIED**

Whole-plan review found four cross-feature composition defects plus two UI
state-refresh defects. The fixes are implemented test-first in additive
migration `0027_class_management_composition_fixes.sql` and the existing
management functions/components:

- Private note creation, session listing, profile history, and follow-up
  resolution use historical `active | dropped` student enrollment, so a normal
  group move does not erase earlier class records or make one moved student's
  note fail the whole session list.
- Moving an unstarted class into a group with the same sequence number chooses
  and returns that group's next number atomically.
- Repeating End class on an already-closed session returns the existing closed
  result without another Review release, release event, or audit entry; the
  edge function can retry remaining pulse/activity cleanup.
- Future scheduled access is not counted as currently available. Content offers
  bilingual **Cancel scheduled access**, which uses the valid
  `scheduled → draft` transition; ordinary Review removal still closes the
  release.
- Resolving from People reloads the full profile-wide semester history, and
  each group assignment selector follows fresh roster props after a move.

Migration 0027 and the updated session and notes functions are deployed.
Frontend commit `af1ea69`, backend commit `623feca`, and production bundle
`index-Dlk8k3FR.js` completed the live release gate:

- A note created in old QA session `27d87aed-b99c-4d83-8235-398fe1f28ba0`
  remained available after the student moved from QA730E to A. The class list
  still loaded both students, People retained all three semester notes, and
  resolving from People preserved the full list through a page reload.
- Planned session `8d72be63-54ce-4fe2-a0ed-0c08ed340626` moved from QA730E
  sequence 3 into A, whose sequences 1–4 were occupied. The persisted result
  was A sequence 5.
- Close counts for release / release event / audit were `0 / 0 / 0` before,
  `1 / 1 / 1` after the first close, and still `1 / 1 / 1` after a second
  authenticated close request.
- A QA730E release opening in 2035 rendered as scheduled and not currently
  available. Cancel scheduled access succeeded and persisted `draft`.
- The roster group selector followed A immediately and after reload.
- Student auth context and progress returned 200 without the moved-note text;
  the notes endpoint returned 403 without it.

Cleanup restored QA Test Student to TC2007B-401, archived A and QA730E, and
closed the new class's Review release without changing the historical Group A
release. The cancelled schedule remains as an inert `draft` QA fixture for the
planned final data reset. TC2007B-401 remained unchanged and Active.

### 1. Dress rehearsal with real students on real phones — **highest value**
Nothing here substitutes for it. Only 1–3 test accounts have ever used the
platform, all driven by automation on one machine. Run one complete class.

Watch for: concurrent answer bursts, phones sleeping mid-quiz, students joining
late, flaky campus wifi.

### 2. Re-verify the reflection step on a fresh class session — **DONE**
The 2026-07-29 production rehearsal used a fresh class session. Closing the quiz
opened reflection automatically; the QA student submitted 58 words; the
instructor feed and Gradebook both displayed the saved response.

### 3. Gradebook Tab B — per-class review — **DONE, verified by the professor**
Built on 2026-07-28. A **Per class** tab on the Gradebook screen: pick a class
session, then see every question pushed to the room with its distribution and
correct answer marked, the quiz attempt table with the class average, and every
reflection in full.

Backend: a new `rounds` action on `course-pulse` (all rounds of one session,
batched — `results` is per-round and would have been an N+1). Deployed.
`summary` and `reflections` on `course-class-quiz` were reused as-is; their
return shapes were read directly and match the frontend interfaces.

**Verified:** the `rounds` action is live and role-gated (student → 403, bogus
action → "Unknown action"); typecheck, all three verifiers, and the build pass;
the student surface is unaffected and console-clean.

**Confirmed working by the professor on 2026-07-28.**

### 4. Admin screens — **DONE, verified by the professor**
Built on 2026-07-28. `src/screens/instructor/Admin.tsx`: the course list with a
teaching-staff count, a create-a-course form, the teaching-staff table filtered
by course, an invite form (professor or TA), and removal with a confirm that
names the consequences.

Two structural bugs were fixed on the way in, both instances of pitfalls that
are already documented:

- **`/admin` had a route but no nav link.** It was reachable only by typing the
  URL — pitfall #1, the exact shape of the bug that once shipped a live class
  students could not join. `InstructorNav` now shows an **Admin** tab, for
  platform owners only.
- **The `/admin` route component was an inline arrow inside `App`** — pitfall
  #4, a new component identity on every render. Now a module-scope `AdminRoute`.

The dead `Placeholder` component and its orphaned strings went with them.

**Verified:** all five `course-admin` actions are refused for a student token
("This action is restricted to a platform owner" — the owner gate runs before
the action switch); the `course_memberships` unique constraint that
`invite_professor`'s `ON CONFLICT` needs is a plain table-level constraint, not
a partial index, so pitfall #6 does not bite; typecheck, all three verifiers and
the build pass; the student surface still works end to end (Today, Review and
Grades all render real data, console clean).

**Confirmed working by the professor on 2026-07-28.**

### 5. CSV roster import — **DONE, verified by the professor**
Built on 2026-07-28. `src/components/RosterImport.tsx`, on the People screen:
choose a CSV, see exactly which rows will be imported and which will be skipped
and why, then apply behind a confirm. Nothing is written until you have seen the
preview.

Header matching accepts common English and Spanish spellings (`email` /
`correo`, `name` / `nombre`, `section` / `grupo` / `sección`, `matrícula`), so a
professor's own export usually just works. Only email, name and section are
required; role defaults to student.

**A destructive backend bug was found and fixed on the way in.** See the
"Roster import used to sign everyone out" note in `07-pitfalls.md` #13 — this is
the most important thing in this entry.

**Verified:** the CSV parser is covered by a new fourth verifier,
`tools/verify-csv-roster.mjs` (21 checks: CRLF, Excel BOM, quoted commas,
quoted newlines, doubled quotes, Spanish and accented headers, padded cells,
missing-column reporting, header-only files, blank-line handling). It was
mutation-tested — breaking the row-number offset, the email lowercasing or the
blank-line filter each makes it fail — so it is a test that can actually fail.
Typecheck, all four verifiers and the build pass.

**Confirmed working by the professor on 2026-07-28.**

### 6. Your own lectures + the release gate — **DONE, verified in the browser**

**This entry corrects a claim the docs used to make.** `01-project-overview.md`
said definition-of-success items 1–4 were "essentially met", including *"run a
complete class without touching the old apps or the database"*. That was not
true:

- The Content screen listed **generation jobs only**, so the professor's own 23
  decks — in `content_items` since Phase 2 — were never displayed.
- **The SPA never called `course-release-management`**, so no release could move
  from `draft` to `released`. Every release in the system had been made in the
  old app or seeded by hand.
- The AI pipeline therefore dead-ended: approving creates a *draft* release the
  app could not publish.

Nobody caught it because Week 1 Lecture 1 was already released, seeded outside
the app — see pitfall #14.

**Then the first version of the screen was rejected on sight**, and correctly:
it exposed the state machine (Release / Open during class / Switch to review
only) and made the class-session picker mandatory, in a course with exactly one
class session. See pitfalls #15 and #16.

**Now:** each item shows one badge — *Students can open it* / *Not available to
students* — and one primary button, *Make it available* / *Take it back*, with a
filter across all three. The backend state machine was made navigable in both
directions.

**Then it was reported broken again the same day**, and correctly: *"when I
click on make it available, nothing actually happens."* Two causes, both now
fixed — see pitfall #17:

- `update_state` **requires** a `reason` when reopening a `closed` release. The
  client typed it optional and never sent one, so take-back worked and
  make-available threw every time.
- The resulting error rendered at the top of a 23-item list, so a hard failure
  looked like a no-op. Errors are now keyed by item and render in the card.

**"Tie it to a class day" was removed.** It created a draft release and never
released it, so it could only ever make content invisible — and it was premature
regardless, since there is no UI to create class days, so it offered one
irrelevant option. It returns with class-day management (item 8).

**A third round, same day:** *"it shows red error A valid source kind is
required."* — the new per-item error surfacing working as intended. Two more
causes, both fixed (pitfall #18):

- `course-content-library`'s `sourceKinds` allow-list never gained
  `storage_object`, which migration 0012 added to the `content_items` constraint
  in Phase 2. Every real lecture is a `storage_object`, so `save_content_item`
  rejected all 23. Broken for months; the function had no caller until now.
- More fundamentally, creating a release should never have gone through
  `save_content_item`, which rewrites the entire content item as a side effect.
  `course-release-management` now has a `create_release` action that makes a
  draft release and touches nothing else.

**VERIFIED IN THE UI on 2026-07-28, end to end**, driving the professor's own
signed-in Chrome:

1. Content → Your lectures lists all **27** items.
2. *Make it available* on Week 11 → badge flips to "Students can open it", no
   error.
3. QA student's Review shows it as *Disponible*.
4. Student opens it → `/view/<release_id>` → iframe `src="/content?t=…"` (the
   correct gated chain, not `srcdoc`) → token path
   `courses/tc2007b/items/week-11-lecture/deck.html`.
5. The deck renders **49 slides** and the counter reads `1 / 49` — the engine
   initialised. Arrow keys advance it to `3 / 49`, so it is genuinely alive,
   which is the direct test for pitfall #2.
6. *Take it back* → student loses it → *Make it available* again succeeds. That
   round trip is the regression for pitfalls #16 and #17.

No console errors at any step.

### 7. Grade adjustments and locking
Backend exists; no UI. Still done in the old app.

### 8. Groups, class days, and removing people — **DONE, verified in the browser**

Built and verified 2026-07-28. All three were holes where the backend existed
and the v2 app had no caller, and together they blocked onboarding a second
professor: invited through Admin, they could create neither a group nor a class
day, so they had nowhere to put anyone.

- **Groups** (`components/Sections.tsx`) — create, edit, retire, reactivate,
  and hand off directly to that group's filtered People roster. Group saves
  echo every persisted field so optional meeting and campus metadata are never
  cleared accidentally. The 2026-07-30 browser follow-up replaced the
  enrollment-scoped auth-context group list with the authoritative section
  endpoint and added transactional student group moves. The filtered view can
  move a current member out or assign another active student into the group;
  prior enrollment rows remain as dropped history and are excluded from
  current-member filtering. Current-group detection is limited to active
  student enrollments whose section belongs to this course.
  "Group" in the UI, `section` in the schema; the schema word means nothing to a
  professor and design rule #2 forbids leaking it.
- **Class days** (`components/Schedule.tsx`) — add one per class meeting, edit
  an unstarted planned/open/continued class (including replacing its lecture),
  cancel a planned one, run it. New backend action `create_session`, which assigns the
  sequence number server-side because `class_sessions` has
  `unique (section_id, sequence_number)`.
- **Remove a person** (People roster) — new backend action `remove_person`.
  Not a delete: memberships go `inactive`, section enrolments go `dropped`, so
  work and grades survive and re-adding the same email brings the person back.
  Refuses self-removal and platform owners.

Both panels call `refreshContext()` afterwards, since Home and the student Today
screen read `teacher_sessions` from the auth context.

**Verified end to end in the professor's browser:** created a class day, watched
it appear in the schedule *and* on Home, opened Run Class from it and got the
question-bank picker, then cancelled it. Added a throwaway person and removed
them. Confirmed the Remove button is absent on your own row.

**Three bugs were found by doing that, none of which reading would have caught:**

1. *Run this class* linked to `/teach/run/undefined` — `listSessions` returns
   `session_id`, not `id` (pitfall #3, made again while building this).
2. Home showed the class day one day early — a bare `YYYY-MM-DD` parses as UTC
   midnight (pitfall #19). `formatDay()` in `src/i18n/index.ts` is now the one
   place that knows this.
3. A removed person looked untouched, because the status cell preferred
   `profile_status` — which removal deliberately does not change — over
   `membership_status` (pitfall #20).

### Coherent lifecycle: generated slide checkpoints and deck bridge — **IMPLEMENTED LOCALLY, NOT DEPLOYED**

Built 2026-07-29 across both repositories. Newly generated banks now carry a
stable concept segment, cited finalized slide numbers, a source range, and the
exact slide after which each question may be asked.

- Generated slides have sequential one-based `slide_number` values.
- Question generation receives the finalized slide JSON, not the earlier
  outline, and is rejected unless it produces exactly 18 questions, exactly
  6/6/6 by difficulty, 3–5 checkpoints for a normal 18–50-slide lecture, and at
  least two candidates at every checkpoint.
- One shared backend validator guards the worker and `import_bank`; both
  persistence paths write the same five columns.
- `list_banks`, `draw_question`, and generation `review_bundle` return the
  checkpoint fields their consumers use. The Question banks tab now shows
  balance, coverage and legacy-bank warnings. It has no release action:
  question banks remain professor-only inputs to a live class.
- Legacy banks now have a local-only preparation path. **Prepare checkpoints**
  appears only when every active question is truly missing checkpoint metadata,
  calls an instructor-authenticated edge function with the real content-item id,
  and reports checkpoint/question counts or a per-bank error in the same card.
  Invalid or partially mapped banks never receive the action.
- The backfill accepts only a private `storage_object` lecture with exactly one
  active 18-question bank. It downloads the existing single-file HTML, extracts
  the teaching slides in order, loads the unchanged questions and options, and
  makes one structured Claude call that returns metadata only. Exact question-id
  coverage, 6/6/6 balance, 3–5 checkpoints, every source range, and at least two
  candidates per checkpoint are validated before the first write.
- The legacy transformer preserves teaching-slide count, text and order; adds
  stable `data-teaching-slide` coordinates; removes only the retired
  Home/Mission/Quiz/Exit anchors; keeps custom lecture CSS/JavaScript and all
  language, theme, overview, help, fullscreen and slide controls; and replaces
  the old presenter engine with the existing `DECK_STYLE` / `DECK_SCRIPT`
  assets. All HTML substitutions use callback replacements so asset text such
  as `$&` cannot be interpreted as a replacement token.
- Database writes update only the five checkpoint metadata columns. The
  same-path private Storage upload is the final operation, so authentication,
  model, transform, validation or database failures cannot overwrite the
  working deck.
- The deterministic assembler now inserts a bilingual checkpoint section
  immediately after each matching teaching slide. Teaching-slide numbers remain
  stable even though the presentation gains additional physical slides.
  Reused concept-segment labels receive deterministic position-qualified deck
  keys, so metadata accepted by the bank validator cannot strand assembly.
- Generated decks expose a version-1 same-origin bridge. Every message is
  origin-, source-, version-, and shape-checked; the parent hook accepts messages
  only from its own iframe and sends only to `window.location.origin`.
- Exact-shape validation enumerates every own key and inspects its descriptor;
  non-enumerable, symbol, accessor, executable and unknown properties are
  rejected in both directions instead of disappearing from `Object.keys`.
- At a checkpoint, Right Arrow reports a skip before moving and Space is
  reports one generic parent action without moving. Run Class remains
  authoritative and interprets that intent as send or reveal from its current
  state. Ordinary slide navigation and fragment reveal behavior remain
  unchanged.
- The editable skeleton, style and script remain the only deck-template source;
  `deck-assets.ts` is regenerated and a verifier checks exact source parity.
  That verifier now runs in a path-scoped backend CI workflow, where the
  editable source actually lives.
- Frontend gated-content verification fails closed when that editable backend
  source cannot be inspected. Frontend CI explicitly checks out
  `mzareei/mzareei.github.io` and passes its path through
  `COURSE_PLATFORM_BACKEND_ROOT`; local verification may use the documented
  sibling checkout but cannot silently skip the contract.

**Local evidence:** a disposable same-origin parent harness loaded generated
fixture HTML through `/content?t=fixture` and captured `deck.ready`,
`deck.slide_changed`, `deck.checkpoint_entered`, and
`deck.checkpoint_skipped`. It confirmed skip-before-navigation, checkpoint Space
staying put, parent ready/resume, ordinary fragment reveal, overview, help,
language, and theme. The fullscreen control invoked `requestFullscreen`, but
the controlled browser denied fullscreen permission, so actual fullscreen entry
remains pending alongside verification through a live `/content` token.

The backend verifier also executes the real embedded deck script in a
deterministic DOM harness. It confirms that checkpoint Space emits exactly one
`deck.checkpoint_action` to `location.origin` without moving, and that Right
Arrow orders `deck.checkpoint_skipped` before `deck.slide_changed`.

Migration `0021_slide_checkpoints.sql` and the changed functions have **not**
been applied or deployed from this isolated task. No live generation was run
because there was no disposable instructor-authenticated fixture, and this
increment must not overwrite an existing private deck.

The new `course-checkpoint-backfill` function is also **not deployed**, and no
real private deck or bank was prepared. Managed approval for shared
backend/Storage mutation was explicitly rejected, so the runtime sequence
remains pending: apply the checkpoint migration and deploy the changed
functions only after authorization; prepare Week 1 Lecture 1 first; confirm all
45 teaching slides remain, 3–5 checkpoints exist, retired anchors are gone and
arrow navigation still works; then continue one lecture at a time with the same
preview and coverage checks. Do not batch this backfill.

**Local backfill evidence:** `tools/verify-checkpoint-decks.mjs` was captured
RED against the required four-slide legacy fixture, then GREEN. It exercises
the real transformer, preserves custom inline assets containing `$&`, verifies
the checkpoint falls after slide 3 without renumbering teaching slides, and
source-checks instructor/private/active-bank gates, current asset reuse, no
prompt/option mutations, pre-write validation and same-path Storage ordering.

### 9. Phase 6 cleanup
- Strip lecture/mission content from the public `mzareei.github.io` repo.
- Point the syllabus at the new app; turn old Gen-2 app pages into redirects.
- Crawl the public site to confirm zero gated-content leaks.
- Gen-1 apps stay frozen.

### 10. Deferred by the professor's own choice
- **Projector view** — separate big-screen window for pulse results.

QR joining and mid-lecture deck checkpoints moved into the approved lifecycle
redesign on 2026-07-29.

### 11. Known wrinkle worth fixing eventually
The generation worker self-chains *and* the Content screen nudges `advance`, so
two invocations can race on one step. Self-healing, but it can write a confusing
transient error. A claim/lease on the job row would fix it properly.

---

## Closed questions

- **Quiz per-question timing** — asked and answered on 2026-07-28: **seconds**.
  20 / 30 / 45 seconds stays as implemented. Closed; don't reopen it.

---

## A standing constraint on agent testing

Test sign-in refuses instructor accounts by design
(`course-test-signin/index.ts:128`), and the QA account
`zarei.1982@gmail.com` is student-only — no TA role. An agent can therefore
drive the **entire student side** unaided but **cannot reach any instructor
screen** (Run class, Content, Gradebook, People). Anything instructor-facing
needs the professor signed in at `m.zareei@tec.mx` with an emailed code.

Plan around this: build instructor features knowing the last mile of
verification is the professor's, and say so plainly rather than implying a
screen was seen working.

---

## How the pipeline was dogfooded (reproducible recipe)

Useful if you need a test PDF again:

1. Chrome headless `--print-to-pdf` on a lecture deck captures **only the one
   visible slide** — deck CSS hides the rest. Don't bother.
2. Instead: parse the deck HTML, extract each `<section class="slide">`'s English
   text (strip `data-es`), emit a plain print-friendly HTML document, then print
   *that* to PDF.
3. For automated testing a minimal base-14 (non-embedded-font) PDF writer keeps
   the file ~7KB — small enough to base64 into the page and attach to the real
   file input via `DataTransfer`, so the actual UI path gets exercised.

Working scratch scripts were used for this and not committed; the recipe above is
enough to recreate them.
