# Pitfalls — read before debugging

Every entry here already cost real time, and several shipped broken behaviour to
the professor. They share a shape: **the code looks right, nothing errors, and
the UI is silently wrong.**

---

## 87. A permission bypass makes every group-scoped screen lie, silently

**Reported 2026-08-18: "I select Group 501 and I see all four of my lectures."**

`course-content-library` grants the platform owner `isGlobalOwner`, and
`canEditContentItem` returns true on it before anything else is checked.
Visibility is derived from editability, so the owner saw the whole course
library inside every group. Nothing errored; the switcher simply had no effect
on that screen, and the client-side scope filters (`scopedReleases`,
`scopedSessions`) all ran correctly on the *releases* and *sessions* while the
item list they hung off had never been narrowed at all.

Two things worth keeping:

**A screen is only as scoped as its least-scoped query.** Content filtered its
releases, its shares, and its assignable classes by group — five correct
filters — around one list that was never filtered. The correct filters made it
look scoped, which is why it survived so long.

**An owner bypass is not a superset of a normal view, it is a different view.**
"See what they see" cannot be built on top of a permission check that answers
early and true. The bypass has to be *dropped* for the impersonated view, and
the ownership test replaced — not merely narrowed — because the owner's own
profile id still matches his own items inside somebody else's group.

**Rule:** when a role can bypass a visibility check, every screen that claims
to be scoped needs a test *as that role*. A non-owner instructor would never
have reproduced this — the bug was only visible to the one account that could
not see it was a bug.

---

## 84. A gate whose only key is a habit is not a gate, it is a dead end

**Reported 2026-08-14 with a screenshot of "No grades yet" on a phone whose
owner had just finished the whole class.**

`studentClassGrades` deliberately showed only classes with a posted
`gradebook_scores` row, and the comment above it defended the choice well: "a
grade should not appear on a phone because a screen was opened." The only thing
that ever wrote that row was a **Post to the gradebook** button, on each class
record, one class at a time.

The policy was sound. The mechanism was a human remembering to press a button
twenty-eight times a semester, and he never did — so a feature that worked
perfectly produced, for every student, the experience of a broken one. Nothing
errored, no test failed, and the numbers were correct and sitting in the
database the entire time.

Two things to carry:

- **When a deliberate gate has exactly one key and that key is somebody's
  discipline, the gate will be shut forever.** Either bind it to an event that
  already happens (here: finishing the reflection, ending the class) or accept
  that the feature behind it does not exist.
- **Automating the write reintroduces the gate's original job.** Grades still
  must not appear early, so the trigger has to be the *right* event per person:
  the exit ticket posts one student, never the roster, because posting the room
  when one person finishes hands everyone still writing a grade carrying the
  20% missing-submission penalty. "Post automatically" was never the whole
  answer — "post whom, and when" was.

And removing the button removes the recovery path with it. `postClassGrades` is
called through a `…Quietly` wrapper so it can never fail a reflection submit or
a class close, which means a failed write is silent; opening a closed class's
record re-posts it, so there is still a way out (pitfall #70).

---

## 83. "Make it automatic" is a question about *when*, not about *whether*

**Asked 2026-08-14: "when the answer is already shown … that button should be
automatically pressed, so we continue to the lecture."**

The literal implementation — fire `continueCheckpoint()` the instant the state
turns `revealed` — is a regression, and a silent one. Continuing closes the
round; `course-pulse` serves a student only an `open` or `revealed` round
(pitfall #66); so the verdict every student was waiting for would appear and
vanish in the same frame. Nothing errors. The professor's cockpit does exactly
what he asked. The failure lands on thirty phones he cannot see, and comes back
a week later as "the students say they never find out if they were right."

The tell is that the request names a *trigger* ("when the answer is shown") but
the button does two things: hand the lecture back **to the professor**, and take
the question away **from the room**. Those wanted different timings, and only
the professor could say what the second one should be. He said fifteen seconds.

**Rule:** before automating a control, list everything it does and who each
effect lands on. If one effect is invisible from where the request was made,
that is the one to ask about — and ask with the trade-off spelled out, not as
"how many seconds?" More generally, when a delay is the answer, the number is a
teaching decision, not an engineering one: bound it in code (a verifier now
pins it below the phones' own display window) but let him choose it.

---

## 82. A verifier that pins an implementation shape goes stale when the code gets better — and a permanently-red verifier protects nothing

**Found 2026-08-13 while sweeping the backend: `verify-generation-ownership`
failed on pristine `main`, and had for long enough that it was being stepped
around as "known red".**

It asserted `worker.search(/from\("content_items"\)\s*\n?\s*\.upsert\(/)` and
refused to run further when that regex found nothing. Nothing was broken. The
worker had *stopped* upserting `content_items` from TypeScript, and persistence
moved into the `finalize_pdf_generation_bundle` SQL function, which does:

```sql
select * into content_item from public.content_items
 where course_id = … and slug = … for update;      -- row lock
if content_item.owner_profile_id <> generation_job.created_by then
  raise exception 'generation_slug_not_owned';      -- check
…
update public.content_items …                       -- write
```

Check and write are now in **one transaction behind a row lock** — which is
exactly what the verifier's own header comment demanded ("the check and the
write are far apart … the guarantee has to live at the write"). The code had
grown into the thing the test was asking for, and the test failed *because of
it*. Two more assertions below the failure had gone stale the same way and had
not run in months (`owner_profile_id: ` and `content_versions`, both of which
moved into the same SQL function).

Worse, two of the original assertions were **unsound even when green**:

- Ordering was read from where functions appear in the *file*, not from their
  call sites. `preparePriorVersion` is defined *below* the finalize helper and
  runs *before* it, so the positional check was measuring layout, not sequence.
  It passed for years by coincidence of formatting.
- Table names were matched as substrings, so retargeting a write to
  `content_versions_DISABLED` still satisfied "must record a version".

**Rules:**

1. **Assert the property, not the shape.** "Ownership is checked before the
   write, under a lock" survives a refactor; `.from("x").upsert(` does not.
   When a verifier fails, first ask whether the *property* still holds — if it
   does, the verifier is the thing that's wrong, and moving its assertions to
   wherever the property now lives is the fix, not deleting it.
2. **A red verifier is worse than no verifier**, because everyone learns to
   skip it and it stops guarding the thing it was written for. Fix it or
   delete it the day it goes red; never carry it as "known red".
3. **Mutation-test every assertion.** A verifier that only ever passes proves
   nothing at all — same lesson as #78, where a lockout counter that never
   incremented looked perfectly healthy. Break the property on purpose, one way
   per assertion, and watch each one fail. Seven deliberate breakages were run
   here; the first pass caught six, and the seventh (`content_versions` renamed
   to `content_versions_DISABLED`) sailed through and exposed the prefix bug
   above. That single miss is the entire argument for doing this.

---

## 81. An app-level branch on a non-reactive location strands in-app navigation in the wrong shell

**Found 2026-08-13 by a full E2E rehearsal in Group 402, the day after it
shipped: a first-time student claimed their PIN at the QR code, landed on
`/live`, and saw the sign-in form until they manually reloaded.**

`App` chooses between three shells, and exactly one branch is URL-driven:
`if (location.pathname.startsWith("/join/")) return <JoinRouteShell />`. But
`App` re-renders only when a **signal** changes, and `location.pathname` is not
a signal. So when `JoinClass` finished the join and called `route("/live")` —
the deliberate no-full-reload improvement shipped the previous evening — only
the Router *inside* the join shell re-rendered. `App` kept rendering the join
shell at `/live`, and that shell's fallback route was `<SignIn />`. The header
knew the student's name; the body asked them to sign in. Nothing errored.

Every first-time student walks this exact path, because claiming a PIN is the
first thing the QR does. The previous behaviour had been a full
`location.href` navigation, which re-ran `App` from scratch and masked the
stale branch — replacing the reload with `route()` is what exposed it.

The fix has two halves, and the second matters even with the first in place:

1. `currentPath` — a module-level signal initialised from `location.pathname`
   and kept fresh by a `PathSync` component inside the shell's
   `LocationProvider`. The App branch reads the signal, so leaving `/join/*`
   re-renders App out of the shell. `verify-class-sessions` pins this.
2. The join shell's fallback route renders SignIn **only when signed out**; a
   signed-in user gets a quiet loading beat. A fallback that can face a
   signed-in user must never be an authentication screen — that is the one
   component guaranteed to gaslight them.

**Rule:** a component that branches on the URL must read the URL reactively,
or the branch is frozen at whatever the URL was on its last unrelated render.
And after changing *how* navigation happens (reload → in-app route), re-test
every flow that crosses a shell boundary, not just the screen the change was
aimed at — the reload was doing invisible work.

---

## 80. A student's session outlives the sign-in method that created it

**Reported by the professor 2026-08-13, from the second real class: "for two,
three students it asks them to set the PIN … but for the majority they scanned
the QR code and went directly into the course without being forced to set a
PIN."**

PIN sign-in shipped 2026-08-12, the day after the first class. It changed
nothing for anybody already signed in. A Supabase session lives in the phone's
local storage and refreshes itself indefinitely, and `JoinClass` renders the
sign-in screen on exactly one condition:

```tsx
if (!signedIn) return <SignIn joinCode={…} />;
```

So every student who had signed in during class 1 — by emailed code, by the test
door, by Microsoft — was carried straight past the new sign-in screen and into
the class. The two or three who *did* set a PIN were simply the ones who
happened to be signed out. Nothing failed, nothing errored, and there was no
session bug: the sessions were working exactly as designed. The design just had
no way to say "this credential is superseded."

Neither of the obvious remedies is right. Deleting and re-registering the
students destroys attendance, answers and grades to fix a credential. Revoking
every session mid-semester logs the room out at whatever moment it lands, and
still relies on each student then choosing to set a PIN.

The fix is to gate the **scan**, not the sign-in screen: `course-session-join`
refuses with `pin_required` when the student has no `pin_set_at`, and the join
screen renders the claim form in place. The QR code is the one thing every
student in the room passes through no matter what state their session is in, and
a student who already has a PIN never sees it.

Two exits are deliberate, because a gate a student cannot pass is worse than no
gate (pitfall #70's shape): `claim_student_pin` requires a `live` class, so a
`paused` one is never gated; and a rostered profile with no student ID cannot
claim, so it is let through and audited rather than locked out of a lecture.

**Rule:** changing how people authenticate does not change anyone already
authenticated. Before shipping a new sign-in method, ask what happens to the
sessions minted by the old one — they will still be valid, and the new screen is
the one place that cannot reach them. Enforce the change at a door every user
must re-enter, not at the door they already walked through.

---

## 79. An edge function bundles `_shared` at deploy time, so fixing a shared file ages every importer you don't redeploy

**Reported by the professor 2026-08-13: "when we get to the end of the quiz and
I push it, the students got a JSON error … two, three of them could see their
quiz, but the majority got this JSON error thing." The end-of-class quiz had to
be abandoned.**

Migration 0048 let one class hold more than one `class_attendance` row per
student, so a lecture paused one day and resumed the next records both days.
`_shared/attendance.ts`'s `loadCheckInAt` was fixed the same day to read a list
instead of a row (pitfall #77). Three of the five functions importing it —
`course-pulse`, `course-session-join`, `course-class-record` — were redeployed.
`course-activity-attempt` and `course-exit-ticket` were not.

**A deployed function carries the copy of `_shared/*.ts` that existed when *it*
was deployed.** So those two kept running `.maybeSingle()` against a table that
now legitimately holds two rows, and PostgREST answered:

```
JSON object requested, multiple (or no) rows returned
```

`course-activity-attempt` returns `error.message` verbatim, and `QuizPlayer`
renders it. Every student who had scanned in on **both** class days — the
majority, since this was a resumed class — got that sentence instead of their
quiz. The two or three who saw the quiz were the ones with a single attendance
row. `course-exit-ticket` was stale too, so the reflection would have failed
identically had it been reached.

Nothing pointed at this. The source in the repo was correct, reviewed, and
committed; the migration was applied; `git log` was clean; the fix's own pitfall
entry (#77) was already written. The only wrong thing in the world was a deploy
that had not happened, and no tool in either repo could see it.

Timestamps cannot settle it either — the commit for a change is routinely made a
minute *after* the deploy that shipped it, which reads as stale. Confirmed by
downloading the live bundle and diffing it, which is now a script:

```bash
node supabase/tools/check-function-deploys.mjs
```

It downloads every deployed function into a scratch directory (never the working
tree) and diffs the real source, including the `_shared` files each one bundled.
**Run it before class day.** It found this in one pass.

**Rule:** after editing anything in `_shared/`, redeploy *every* function that
imports it, not the ones you happened to be working on —
`grep -rl "<file>.ts" supabase/functions/` lists them. And treat "the fix is in
the repo" as saying nothing at all about what production is running. Same family
as pitfall #21, one layer down: there the browser held a stale bundle, here the
server does.

---

## 78. Recording a failed attempt and then raising throws the record away

**Built and caught by testing, 2026-08-12, before any student used it — but it
was deployed and live for about ten minutes first.**

Student PIN sign-in throttles guessing: five wrong PINs and the account locks
for fifteen minutes. Six digits is a million combinations and student IDs are
semi-public, so that lockout is the only thing making a short PIN defensible.

`verify_student_pin` in migration 0051 did this:

```sql
update public.profiles set pin_failed_attempts = pin_failed_attempts + 1 ...;
raise exception 'pin_invalid';
```

A raised exception aborts the transaction, and the `UPDATE` goes with it. The
counter was **always zero**, the lock never armed, and the scheme was quietly
weaker than the emailed codes it replaced.

Nothing looked wrong. The function returned the right error, the client showed
the right message, and every individual line was correct. It was caught only by
a test that made five deliberate wrong attempts and then tried the *correct*
PIN — which still worked. A test that only checked "wrong PIN is rejected"
would have passed.

Fixed in `0052`: the functions return a `result` code and the caller maps it.
Exceptions are reserved for genuine faults.

**Rule:** never write a record and then raise in the same transaction — the
raise destroys the write. This applies to failed-login counters, audit rows,
rate-limit tallies, and anything else whose whole purpose is to survive the
failure that triggered it. And when testing a lockout, assert that the
**correct** credential is refused once locked; asserting that wrong ones are
rejected proves nothing about whether the counter persisted.

---

## 77. A unique constraint encodes a product rule, and relaxing it breaks every writer and reader at once

**Built 2026-08-12 for pause/resume. Caught by sweeping, not by symptoms.**

`class_attendance` was `unique (class_session_id, profile_id)` — one row per
student per class. The professor's rule is that **attendance is a day** while
engagement and grading stay per class, so a lecture paused today and finished
next week needs two rows. Relaxing that constraint touches five places, and only
one of them is the migration:

- `_shared/attendance.ts`'s `loadCheckInAt` used `.maybeSingle()`, which throws
  on more than one row — so it would have failed for exactly the student who
  attended *most*.
- `course-class-record`'s `loadAttendance` built a `Map` straight from the rows,
  silently keeping whichever came last and losing the real arrival time.
- `course-pulse`'s `present` count counted rows, not people, so anyone who came
  both days counted twice — pushing "everyone has answered" permanently out of
  reach and quietly disabling auto-reveal, the thing that lets the professor
  stay in fullscreen.
- Both writers (`course-session-join`'s scan, `course-class-record`'s Mark
  present) named the old two-column `ON CONFLICT` target, which stops existing
  the moment the constraint is dropped.

Two greps find all of it: `grep -rn "class_attendance" supabase/functions/` and
`grep -rn "class_session_id,profile_id" supabase/functions/`.

**Rule:** a unique constraint is a product rule the whole codebase has been
written against. Before relaxing one, find every reader that assumes at-most-one
(`.maybeSingle()`, `new Map(rows.map(...))`, `count`) and every writer that names
it in `ON CONFLICT`. Same family as pitfall #69 — follow every path into the
table, not just the one you are changing.

**And roll it out in two migrations, not one.** Dropping the old constraint in
the same step as adding the new one leaves a window where the deployed functions
name a conflict target that no longer exists: every check-in fails with a raw
database error, mid-class, for a student standing in front of a QR code. Add the
new constraint first (it is redundant while the old one stands, which is the
point), deploy the functions, then drop the old one. Migrations 0048 and 0049.

---

## 76. A one-time promotion that lives in one endpoint blocks every other door

**Reported by the professor 2026-08-12, after the first real class: every
student saw "This class is for another group" and had to reload two or three
times before the class opened.**

`loadOrClaimProfile` links a rostered `profiles` row to an auth account and
promotes `invited → active`. It lived inside `course-auth-context`, so the only
way to become active was to load the course context first.

`course-session-join` requires a profile that is *already* linked and *already*
active. A student scanning the class QR on a **first-ever sign-in** reaches the
join before the context has ever run, so it was refused with 403 — which
`JoinClass` renders as `join.access.title`, "This class is for another group". A
reload worked because a reload runs `course-auth-context` first.

On day one this was not an edge case: no student had ever signed in, so it was
every student in the room. And the message named the wrong cause entirely, so
there was no way to guess the real one from what anybody saw — same disease as
pitfall #71.

**Rule:** when one endpoint performs a one-time promotion that every *other*
endpoint requires, it belongs in `_shared/`, and every endpoint a user can
arrive at **first** must call it. Ask "what is the earliest request a brand-new
account can make?" — not "what does the app usually call first?" A QR code, a
deep link, and a magic-link return all skip the boot order the app assumes.

---

## 75. Refreshing a credential must not reload the thing that is using it

**Reported by the professor 2026-08-12: "sometimes when I was in full screen
during the presentation, the full screen would be closed automatically, and then
I had to come back to my laptop and click again."**

`InstructorDeck` re-mints the deck's content token on a timer and assigned the
result straight to the iframe's `src`. `course-content-access` mints with
`SIGNED_URL_SECONDS = 600` and the refresh is scheduled at `expires_in - 60`, so
this fired **every 540 seconds**. Assigning `src` reloads the iframe document,
and the browser exits fullscreen the instant the fullscreen element is
destroyed. A two-hour lecture therefore threw him out roughly a dozen times, at
no fixed moment, which is why it read as random.

The refresh bought nothing while the deck was up. `functions/content.ts` serves
the deck as **one self-contained HTML document**; the token gates that single
fetch and the loaded document never uses it again.

**Rule:** a credential refresh for a self-contained document is worth *holding*,
not applying. Apply it only when the thing really has to reload, and never while
`document.fullscreenElement` is set. More generally: before scheduling any
periodic refresh, ask what the refreshed value is still being used for. If the
answer is "only the initial load", the refresh must not touch the live view.

---

## 74. A server-side display window needs a client-side twin

**Same report, 2026-08-12: "when it jumps out of the full screen, I see this
previous question that I did in my page and it has this button that continue
with the class."**

`course-pulse`'s `loadCurrentPulse` stops serving a revealed round to students
after `revealDisplayMinutes = 3` (that window is itself pitfall #8's fix). The
cockpit had no equivalent: `CheckpointPanel`'s `revealed` branch renders until
`continueCheckpoint()` runs. So the two surfaces disagreed by design — the
phones moved on, the panel kept the question indefinitely.

**Rule:** when the server bounds how long something is shown, every other
surface showing the same thing needs the same bound, and the number must come
from one place. Two independent timeouts are a bug waiting for one of them to
change; one timeout and one un-bounded view is a bug already.

---

## 73. An automatic path that depends on an optional capability is not automatic

**Same symptom as #74, and the reason it was never noticed in testing.**

Retiring a revealed question automatically had exactly one trigger in
`RunClass`: `bridge.checkpoint` going from set to null, which happens when the
deck reports it resumed past an authored checkpoint. **Only a deck carrying the
full engine sends checkpoint messages.** Imported lectures carry only the
slide-reporter shim that `functions/content.ts` injects, which reports position
and nothing else — and an imported deck has no checkpoint coverage *by design*
under migration 0036.

So the automatic path worked on Week 1's generated deck, which is what every
rehearsal used, and could never work on the imported decks that are the normal
case from Week 2 onward. Plan-driven polls — the whole point of
`ClassQuestionPlanBoard` — are exactly the path that never had it.

A related trap sits inside the fix. `autoRevealReason` fires `"movedOn"` at
three slide advances, so a question revealed that way arrives with its advance
counter *already at the threshold*. Reusing that counter to decide when to
retire would have closed the answer in the same second it appeared. The retire
counter resets on the reveal, not on the question opening, and a verifier now
fails if anyone wires the two together.

**Rule:** before relying on a bridge message, a capability flag, or an optional
protocol extension, check which artefacts **in production** can actually produce
it. "The deck sends this" was true of one deck out of a dozen. Test the
automatic path on the artefact the professor actually teaches from, not the one
the feature was built against.

---

## 72. `File.text()` assumes UTF-8, and Excel does not write UTF-8

**Reported by the professor 2026-08-11: the roster preview for group 401 said
"All 26 rows look good" while showing `Diana Mar<?>a Ar<?>mburo Lozano`,
`Omar <?>vila Meza`, `Diego Israel Dom<?>nguez N<?>jera`.**

`RosterImport` read the file with `await file.text()`. That decodes as UTF-8,
always, with no way to say otherwise. Excel's plain **CSV (comma delimited)**
export is the machine's legacy code page — Windows-1252 on the Spanish Windows
in use — so `í` arrives as the single byte `0xED`, which is not a valid UTF-8
sequence and becomes U+FFFD before the parser sees a single comma.

Nothing errored, and nothing could: by the time `rosterFromCsv` ran, the
mangled name was just a name. Every validation passed, and the import would
have written 26 permanent student records with replacement characters in them.

`decodeCsv` in `src/api/csv.ts` sniffs instead: UTF-16 BOM, then strict UTF-8
(`{ fatal: true }`), then Windows-1252. The fallback is safe precisely because
accented Latin-1 bytes are never valid UTF-8 — a real UTF-8 file always decodes
on the first attempt, so this cannot corrupt a correctly-saved file.

The general rule: **any byte source that came from a desktop application is not
UTF-8 until proven otherwise.** `file.text()`, `response.text()` and
`Buffer.toString()` all guess, and all guess the same wrong way.

## 71. A quiz gate built for standalone content also caught the live in-class quiz

**Reported by the professor 2026-08-11, from a real rehearsal: pushed
questions fine, then "Activity is not allowed for this section" on the
end-of-class quiz, 0% grade, empty Gradebook, and the same lecture listed
three times in Review.**

Two separate bugs, both in the release/content-availability model, neither
about the test student's sign-in method (that was a red herring — its
enrollment checked out fine).

**The quiz was blocked by a check that has nothing to do with the class
being live.** `course-activity-attempt`'s `assertReleasedForStudent` requires
a `content_releases` row for the underlying lecture in
`released|live|scheduled` state. That's the right gate for a standalone
activity a professor publishes from Content — but the end-of-class quiz
(`course-class-quiz`'s `ensureTemplateAndItem`) reuses the *lecture's own*
`content_item_id` for its activity_template, so the same gate now also
guards a live, ephemeral, session-scoped quiz that Run Class creates on the
fly. Nothing in Start Class touches `content_releases`, so if that lecture's
release happened to be sitting in `review_only` from earlier work — which it
was — every attempt was refused, with a message that names "this section,"
not "this lecture isn't released," so there was no way to guess the real
cause from the error. The professor's own guide says the opposite is true:
*"Everything the students see is driven by the class session's own state"* —
true for pulse questions and reflections, false for this one path. Fixed by
skipping the release check entirely for a session-scoped instance
(`class_session_id` set): its own state and `starts_at`/`ends_at` window
(already checked by `assertActivityOpen`) is authority enough, same as pulse
and reflection. Standalone activities are unaffected.

**Closing the same lecture in the same section twice created two rows, not
one.** `close_class_session_with_review`'s reuse lookup and its insert's `ON
CONFLICT` target both keyed on `(content_item_id, section_id,
class_session_id)`. Every session has a `class_session_id` nothing has ever
seen before, so the "reuse" branch could only ever fire for a genuine retry
of closing the exact same session — any other session closing against the
same lecture always inserted a fresh row. `course-release-management`'s
`create_release` already states the intended model in its own comment
("Reuse a release with the same scope rather than accumulating rows — an
item showing two releases for the same audience is unreadable") and
`moveReleasesToContinuation` already reassigns `class_session_id` on an
existing row instead of making a new one — `close_class_session_with_review`
was just narrower than its own neighbors. Three rows had piled up for one
lecture from three separate close events a few days apart; nothing
de-duplicates on read (`loadVisibleReleases`, `loadReleasedPractice`), so the
student saw the lecture three times in Review and three identical "Start
practice" prompts in My Grades. Fixed in migration `0040`: reuse by
`(content_item_id, section_id)` alone, with `class_session_id` following
whichever session closed it most recently, plus a one-time consolidation of
the three existing rows into one.

**Rule:** when the same underlying column (`content_item_id`) is reused by
two different features for two different purposes — "is this published for
self-study" versus "is this live class's quiz open right now" — a guard
written for one purpose will silently apply to the other unless the code
that creates the second thing is checked too. And when a "reuse existing
row" comment states the intended dedup key, grep for every other writer of
that table and confirm each one actually uses the same key — a narrower key
in just one of several writers reproduces the exact bug the comment says it
prevents.

---

## 70. A session that can start with no lecture must also be able to end with no lecture

**Reported by the professor 2026-08-11: three sessions (`Malware`, `mal code`,
`mal v2`) stuck live, "Could not end the class", and no delete button ever
appeared for them.**

`start_class_session_atomic` has no content requirement, and Run Class says so
explicitly on screen: *"The class can still start, but checkpoints and the
final quiz need a lecture selected on the class day."* But
`close_class_session_with_review` (0027) unconditionally threw when
`content_item_id is null`, because closing always tried to create a review
release for that content. A session started with no lecture attached could
therefore never close.

That turned into a genuine dead end, not just a blocked action: `live` has no
transition to `cancelled` (`allowedSessionTransitions` only allows
`live → paused | closed`), and `delete_class_session_atomic` refuses any state
other than `planned | cancelled | closed` **even with `p_force`** — force
(0038) only bypasses the recorded-pulse-activity check, deliberately never the
"this is happening right now" state guard. So a live session with no content
could not close, could not cancel, and could not be deleted, force or not.
Confirmed against production before fixing: all three sessions had
`content_item_id = null`; one (`mal code`) also had a real recorded pulse
round, which is why its eventual delete still needed the force-confirm step
— that guard was working correctly, the closing guard was not.

**Rule:** when a state machine's entry condition is more permissive than its
exit condition for the same field, anything that enters through the gap the
exit doesn't cover gets stuck — check every transition's guards against every
other transition's guards for the same optional field, not just against that
one transition's own preconditions. Fixed in migration `0039`: closing with no
lecture attached skips the content-release write (there's nothing to release
for review) instead of refusing to close; behavior for sessions that do have a
lecture is unchanged. Same family as pitfall #16 ("every state machine needs a
way back"), but here the missing edge was never an edge anyone drew on the
diagram — a supported *entry* state that had no matching *exit* path.

---

## 69. A hard-delete's safety story must trace every cascade hop and every write path, not just the first of each

**Caught twice in the same batch of work (class session delete, content item
delete), 2026-08-10, before deploy — both in review, not shipped.**

Building real delete actions for class sessions, question banks, and content
items (for clearing test/QA data), the design's safety premise was: real
recorded activity blocks the delete via the schema's own restrict-FK
constraints, never silently cascades away. Two of the three delete paths had
a genuine hole in that premise, each caught by review rather than caught by
design:

- **Class session delete:** `pulse_rounds.class_session_id` is `on delete
  cascade`. The only protection considered was
  `pulse_rounds.plan_checkpoint_id on delete restrict` — but that only
  covers a pulse round pushed through the newer Class Question Plan flow.
  The legacy deck-checkpoint push flow (`course-pulse`'s `pushRound` with
  `plan_checkpoint_id` null) is still the primary way most real classes push
  live questions, and produces pulse rounds the restrict FK never sees.
  Every `closed` session eligible for deletion had necessarily gone through
  `live`, so this was the common case, not an edge case.
- **Content item delete:** the design's cascade table stopped at the first
  hop (`activity_templates | cascades`) and never followed it further. The
  real chain is `content_items → activity_templates → activity_instances →
  student_attempts → student_responses`, all `on delete cascade`, and
  `course-class-quiz`'s `ensureTemplateAndItem` creates that chain on every
  end-of-class quiz start — live, primary path, not dead schema. A lecture
  with a long-closed release could still have real graded quiz attempts
  behind it, silently destroyed.

Both fixes are the same shape: refuse on the *existence* of any row at the
relevant table (`pulse_rounds` for a session; `activity_instances` for a
content item), not on a narrower condition that only covers one write path
into that table.

**Rule:** when a delete's safety depends on "a restrict FK will block this if
there's real activity," verify that FK actually sits on *every* path that can
produce the row, not just the one the feature you were just working on uses
— and follow the cascade past the first `on delete cascade` hop to whatever
table actually holds the thing a student would be upset to lose (an answer,
an attempt, a grade), not just the table named in the same migration as the
column you're deleting.

---

## 68. Reusing an existing content item's slug can silently corrupt a real production bank

**Caught in the final whole-branch review for external content import,
2026-08-10, before deploy — confirmed against live production data, not
shipped.**

`course-content-import`'s `resolveBankContentItem`/`resolveDeckContentItem`
originally reused any existing `content_items` row the caller owned, without
checking what was already on it. Migration `0033` assigned every existing
TC2007B item to the platform owner — the same account this feature treats as
"yours" for reuse purposes. So importing a bank under an existing lecture's
slug (`week-05-lecture` is a completely ordinary thing to type) would either:

- **conflict-overwrite** a real generated bank's metadata (same `bank_type`,
  upsert matches) and mix `import_N`-keyed questions into an 18-question
  checkpoint-validated bank, or
- **insert a second active bank** on the same content item (different
  `bank_type`, no conflict) — and `course-class-quiz`'s "Start quiz" path
  queries active banks for that item with `.maybeSingle()` and no `bank_type`
  filter, which throws on two rows: a raw database error mid-class.

A read-only query against production before this shipped confirmed **every
one of the 11 real lectures already had an active bank** — this was not a
theoretical edge case, it was the default outcome of typing a real slug.

**Rule:** a resolve-or-create pattern designed for a feature's own
idempotent re-import must never be reachable for content that feature did not
create. Verify reuse by checking that everything the existing item already
has — `source_kind`/`source_ref` shape and any active bank's own signature
(`generation_validation_profile`, `generation_job_id`) — matches exactly what
this feature itself would have written, not just that the *owner* matches.
Owner-matching alone answers "can this person write here", not "did this
person's own tooling write what's already here" — those are different
questions, and only the second one is safe to silently overwrite.

The fix (`isReimportableByThisFeature` in `course-content-import/index.ts`)
was verified two independent ways before deploy: by tracing the actual
`content_items`/`question_banks` writers across the whole backend for a
signature nothing else produces, and by running the exact check against a
live read-only export of every production row and confirming zero would
pass. Both checks, not just one, because "looks right" and "is right"
diverge exactly on a guard like this.

---

## 67. A reference-scanning regex will match inside a `<script>` body it never meant to read

**Caught in the same final-review pass, before deploy.**

`_shared/deck-validation.ts`'s `references()` widened its `href`/`src`
attribute matching to catch more exfiltration shapes (`srcset`, `poster`,
`action`, CSS `url()`, unquoted values). The wider pattern also matched
inside inline `<script>` element bodies, since a flat regex has no notion of
HTML structure versus JavaScript: `<script>const data = await
res.json();</script>` was flagged as a relative reference (`"await"`) and
would have rejected an entirely ordinary, self-contained deck. Imported decks
are *expected* to carry inline JS — this was not a rare shape, it was close
to the common case.

**Rule:** when tightening a document-scanning regex, test it against content
that is supposed to pass, not only content that is supposed to fail. A
validator's own false-positive rate on legitimate input is as real a defect
as a missed true positive, and it is invisible if every test fixture is
adversarial.

Also worth recording as its own fact: this validator is **not** a general
inline-script/exfiltration sandbox, and its header comment says so explicitly
now. It checks self-containment and declared outbound links only. The
`/content` route's CSP is the actual runtime control for anything a deck does
client-side that doesn't require a literal, parseable reference in the
markup. See `docs/04-decisions.md`'s "External content import reverses..."
entry for the full reasoning.

---

## 66. A quoted JSON boolean is valid JSON and silently means "no correct answer"

**Caught during the self-test of the external-content-import authoring
prompt, 2026-08-09/10 — before any professor used it.**

`"correct": "true"` (a string) is syntactically valid JSON and parses without
error. `questionFile.ts`'s original check compared it with plain truthiness
in one place and would have accepted it; the actual per-question validator
compares `entry.correct === true`. A model that writes the string `"true"`
instead of the boolean `true` therefore produces a file that looks perfect —
every question present, every option present — but every single question is
flagged with zero correct answers. Nothing about the failure points at the
real cause; the professor sees 20+ questions flagged identically and no
obvious reason why.

Found by deliberately generating three adversarial variants of a
prompt-following model's output (a quoted boolean, a wrapper key around the
whole file, bare-string options with no `correct` field) and running each
through the real parser before shipping the prompt. All three broke the
import; none of the three would have been caught by testing only the
happy-path output the prompt's author expects a well-behaved model to
produce.

**Rule:** the same discipline applies to server-side re-validation, not just
the frontend preview — `course-content-import`'s `questionFault` was
tightened in the same review round to require `is_correct === true` (strict
equality) rather than a truthy filter, so a crafted request that bypasses the
preview entirely cannot exploit the same confusion. When a contract crosses a
model boundary (a prompt, not just an API), test the contract adversarially
before trusting a single well-behaved run — pitfall #10's lesson
("models return the right data in the wrong shape") applies just as much
when the model is a person's own ChatGPT/Claude/Gemini session as when it's
the platform's own pipeline.

---

## 65. A PDF generation title is a label, not source material

A test uploaded malware slides under the temporary title `test mal`. The older
generation prompt treated the title as meaningful content and produced a deck
about test failure instead of the uploaded malware PDF. This is a severe
curriculum-integrity failure: a plausible-looking deck is worse than a visible
error when it teaches the wrong subject.

**Rule:** the uploaded PDF is the complete curriculum source. Preserve every
source page and its order in the proposed plan and final deck. The typed title is
display metadata only. A teaching brief may control pedagogy and placement, not
invent, omit, or reorder curriculum. Run the independent grounding check before
persisting any generated content.

---

## 64. Repository sync needs a server secret and is not a release

The Content screen can offer a **Sync from repository** button, but the browser must
never receive the GitHub credential. The Edge Function reads the private repository
with `COURSE_CONTENT_GITHUB_TOKEN`, validates the selected item, and writes the
private storage/version record. A browser token, a public GitHub URL, or a client-side
Supabase Storage upload would bypass the intended boundary.

The second boundary is just as important: syncing updates the instructor's current
copy; it does not write `content_releases` and therefore does not make the material
student-visible. After reviewing the pulled version, use the existing availability
control and test through the real student Review route.

**Rule:** keep the GitHub token as a Supabase secret, grant it read-only Contents
access to `mzareei/course-content`, record the source commit, and treat sync and
student release as two explicit actions.

---

## 47. The clean reset must preserve the course row and teaching assets

Deleting the TC2007B course would cascade into lecture decks, activity
templates and question banks. The production reset therefore normalizes the
existing `tc2007b` row and deletes only operational identities, sessions,
releases, attempts, grades, notes, reflections and audit records. The guarded
reset function fingerprints retained identifiers before and after deletion and
rolls back if anything changes.

---

## 1. Test through the real entry points, not internal routes

**The single most important lesson in this document.**

A whole night of testing was done by navigating the browser directly to `/live`.
Everything "worked". Then the professor tested for real and nothing worked —
because the **"Join class" button never appeared on the Today screen**, so a
student had no way to reach `/live` at all. The code path being validated was
one no user could reach.

**Rule:** sign in as a student in a clean session and click from Today. If you
find yourself typing an internal URL to reach a feature, you are not testing it.

---

## 2. Never render deck HTML with `srcdoc` or `blob:`

**This has bitten twice**, in Phase 2 and again in Phase 5.

Both `srcdoc` and `blob:` iframes **inherit the parent page's CSP**. The app's
CSP forbids inline scripts, so the deck's engine `<script>` is silently blocked.
The symptom is maddening: all slides are present in the DOM, the page looks
fine, but the engine never initialises — stuck on slide 1, counter reading
"1 / 1", no navigation.

**Rule:** deck HTML is only ever loaded through `/content?t=<token>`, which is
same-origin and gets a relaxed CSP scoped to that path in `public/_headers`.
For unreleased drafts use `course-generation`'s `preview_url`.

---

## 3. Frontend/backend field-name mismatches are invisible

TypeScript cannot verify a contract across a network boundary. An interface that
*claims* the backend returns `weighted_percent` compiles perfectly while the
backend actually returns `weighted_course_percent` — and the UI renders "—"
forever with no error.

Four of these were found in one audit, three of them shipped and live:

| Screen | Frontend expected | Backend actually returns |
|---|---|---|
| Grades | `weighted_summary.weighted_percent` | `weighted_course_percent` |
| Grades | `categories[].{name,weight_percent,average_percent}` | `category_summaries[].{category_name,category_weight_percent,category_average_percent}` |
| People | `person.enrollments[]`, `.role`, `.status` | `person.sections[]`, `.course_role`, `.profile_status` |
| Gradebook | `score.student_email` | `institutional_email` |

**Rule:** when writing or changing a screen, open the edge function and read the
actual `return json({...})` — trace into helpers if it delegates. Never trust
the TypeScript interface as evidence.

A defensive `?? "—"` fallback is what makes these invisible. Consider whether a
missing field should be loud instead.

---

## 4. Never define a component inside another component

```tsx
// WRONG — new component identity on every render
function Live() {
  const Shell = ({ children }) => <div>{children}</div>;
  return <Shell>…</Shell>;
}
```

Preact sees a different component *type* each render and unmounts/remounts the
entire subtree. Combined with a 3-second poll, this meant `QuizPlayer` was
destroyed and recreated every 3 seconds — its initial fetch never had time to
resolve, so the quiz sat on "Loading the quiz…" forever while `start_attempt`
hammered the server in a loop.

**Rule:** define components at module scope. Always, but especially in anything
that re-renders on a timer.

---

## 5. "Recover state after reload" must distinguish active from finished

A recovery call was added so a page refresh wouldn't lose an in-progress quiz.
It fetched the *most recent* quiz instance regardless of state — so once a
session's first quiz was closed, every load recovered that closed instance and
rendered the closed-summary branch, which has **no start button**. The button
flashed on first paint then vanished. The professor could never run a second
quiz.

**Rule:** a recovery feature must return "what is running" and "what finished"
as separate things, or it will remove the control that creates new work.

---

## 6. A partial unique index cannot be an `ON CONFLICT` target

```sql
create unique index … where generation_key is not null;   -- ✗ unusable
alter table … add constraint … unique (a, b);             -- ✓ works
```

Postgres/PostgREST only match a *full* index for a plain-column `upsert()`.
A partial index yields "there is no unique or exclusion constraint matching the
ON CONFLICT specification". Plain unique constraints still permit unlimited
NULLs, so they were the right choice anyway. Fixed in migrations 0015 and 0016.

---

## 7. Word-count limits and character-count limits are not the same guard

`exit_tickets.one_thing` had a `length between 1 and 500` check from when the
reflection was a short field. The reflection was later redesigned to 50–100
words — and a 95-word answer is ~630 characters. Legitimate submissions were
rejected by Postgres *after* passing the app's own word-count validation.

**Rule:** when a field's shape changes, re-check the constraints sized for the
old shape. Migration 0018 raised it to 1500.

---

## 8. A stale "revealed" pulse round blocks the whole live screen

`loadCurrentPulse` had no time bound on the `revealed` state. If a professor
forgot to click "Close the question", the student's live screen showed that
question forever and could never progress to the quiz or reflection.

Fixed with a 3-minute `revealDisplayMinutes` window. **Rule:** any state a human
is supposed to clear manually needs a timeout, because sometimes they won't.

---

## 9. `String.replace` with a string pattern treats `$` specially in the replacement

`$&`, `` $` ``, `$'`, `$1` in a *replacement string* get substituted. When
splicing large assets (CSS, JS) into a template this can silently corrupt them.

Not currently biting us (the deck assets contain only `$/` inside a regex, which
isn't special), but the deck assembler does exactly this kind of splice — worth
remembering if a generated deck ever comes out subtly broken.

---

## 10. Models return the right data in the wrong shape

The first real generation run produced a step where `questions` came back as an
object rather than an array, and the code died with
`questions.forEach is not a function` — a message meaningless to a professor.

The tool schema asks for an array; that is not a guarantee. `asArray()` in the
worker coerces and unwraps. **Rule:** validate and coerce model output at the
boundary, and make the error message something a non-engineer could act on.

The flip side: the question validator caught a genuine bad generation in the
wild ("Q3 has 5 options") and the retry produced a valid bank. Quality gates on
model output earn their keep.

---

## 11. Browser automation clicks can race a fresh render

When driving the app with browser tooling, a click issued immediately after a
re-render can land before Preact has attached handlers, so it appears to do
nothing. This is a *testing* artifact, not an app bug — but it will send you
chasing a phantom.

Confirm with a direct `element.click()` via injected JS before concluding the
app is broken.

The same applies to *filling* a field. A tool that assigns `input.value`
directly does not necessarily make Preact see the change, so the component's
state stays empty and the submit button acts on nothing. Hit again on
2026-07-28 signing in as the QA student. The combination that works every time:

```js
const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
set.call(input, "value");
input.dispatchEvent(new Event("input", { bubbles: true }));
button.click();
```

---

## 12. A status the backend can emit but `StatusPill` doesn't know renders raw

`StatusPill` falls back to the raw state string for any state not in its
`CLASSES` map. That fallback is silent: no error, no missing-string warning, and
`verify-i18n` cannot catch it because there is no `t()` call to check.

`student_attempts.status` can be `late` (set in `course-activity-attempt` when
the submission lands after `ends_at`), and `late` was in neither `CLASSES` nor
`strings.ts`. Any screen showing attempt statuses would have rendered a bare,
untranslated "late" to a Spanish-reading professor. Found while building
Gradebook Tab B, fixed in the same commit.

**Rule:** when you surface a status column in the UI, list every value the
*schema* allows and confirm each exists in `StatusPill`'s map and in
`strings.ts`. From `mzareei.github.io/supabase/migrations`:

```bash
grep -rho "status in ([^)]*)" *.sql | sed "s/status in (//" | tr -d "()'" | tr ',' '\n' | tr -d ' ' | sort -u
grep -rho "state in ([^)]*)"  *.sql | sed "s/state in (//"  | tr -d "()'" | tr ',' '\n' | tr -d ' ' | sort -u
```

Running that sweep while building the Admin screen turned up three more silent
gaps beyond `late`: `completed` (`courses.status`, `course_sections.status`),
`merged` (`profiles.status` — already reachable from the People screen) and
`dropped` (`section_enrollments.status`). All four are fixed.

This is pitfall #3's shape — a cross-boundary mismatch the compiler cannot see —
with a defensive fallback hiding it. Note the two different column names:
grepping only for `status` misses every `state` column, and vice versa.

---

## 13. Roster import used to sign every existing student out

**Found 2026-07-28 while building the CSV import UI. Fixed in
`course-roster-management`, deployed.**

`upsertAcceptedRows` wrote profiles with a plain upsert:

```ts
.upsert({ ...row, status: "invited" }, { onConflict: "institutional_email" })
```

`status: "invited"` is correct for somebody new. On conflict it was also written
over **everybody already on the roster**, flipping active students back to
`invited`.

That matters because the endpoints serving a live class require an active
profile — `loadProfileForToken` in `course-pulse` filters `status = 'active'`
and otherwise throws "No active course profile is linked to this account."

So re-importing a roster mid-semester — a completely normal thing to do in the
first weeks, as students add and drop — cut off every student who was already
signed in. It self-heals, but only on the student's *next app boot*, because
`course-auth-context`'s `loadOrClaimProfile` promotes `invited` → `active`. The
live screen polls `course-pulse` and never re-calls the auth context, so during
a class each student would have had to reload before they could answer anything.

Nothing errored on the professor's side. The import would report full success.

**The fix:** status is set on INSERT only. Existing profiles get their name and
student id refreshed and nothing else — never their status, never their auth
link.

**Rule:** an upsert's payload is written on the update path too. Any column that
means "this is a new record" (`status`, `created_by`, `invited_at`) must not be
in a blind upsert payload. Split it: insert the new ones, update the existing
ones with only the fields you actually intend to refresh.

---

## 14. Seeded test data hides whole missing features

**Found 2026-07-28, and it had been true since the v2 app began.**

The SPA could not release content. The Content screen listed **generation jobs**
only, so the professor's own 23 decks — sitting in `content_items` since Phase 2
— were never displayed. And nothing in the SPA called
`course-release-management` at all, so no release could move from `draft` to
`released`.

That meant "run a complete class without touching the old apps" was false, and
the AI pipeline dead-ended: approving a generated lecture creates a *draft*
release, and the app had no way to publish it.

Every test missed it for one reason: **Week 1 Lecture 1 was already released**,
seeded outside the app. Every student test walked a path where the content was
visible, so the missing capability was never exercised. It surfaced only when
the professor asked a question about something else — where his other lectures
were.

**Rule:** ask what your fixture data is *pre-satisfying*. If every test starts
from a state some feature was supposed to produce, that feature is untested and
may not exist. Walk the lifecycle from empty at least once: no release, no
roster, no session — not just the happy state someone seeded months ago.

Related: pitfall #1 is the same disease at the routing layer (a feature nobody
can reach) and #5 at the state layer (a control that disappears).

---

## 15. Exposing a state machine is not the same as designing a screen

**Reported by the professor on 2026-07-28, the day after the screen shipped.**

The first *Your lectures* screen put the release state machine on the page
almost unchanged: "Release to students", "Open it during class", "Switch to
review only", "Close it", plus a mandatory class-session picker on every item.
Each button was a legal transition. The screen was still unusable:

- *"I don't get exactly how this works … I click on week 11, it says give it to
  the class, then it just has one class, Class 1."* The picker was mandatory but
  the course has exactly one class session, so 22 of 23 lectures could only be
  tied to a day they have nothing to do with.
- *"Some things I sometimes see switch to review only, close it. One is closed.
  I don't know how to open it."* Different items sat in different states, so
  every card offered a different set of verbs.

Two root causes, and only one of them was the state machine:

1. **The graph was one-way** (pitfall #16 below) so `closed` was a dead end.
2. **The screen asked the database's question, not the professor's.** He has one
   question — *can my students open this?* — and `course-auth-context` already
   answers it: `released | live | paused | review_only | scheduled` are visible,
   `draft | closed | archived` are not. Five states collapse to one boolean.

The rewrite shows a badge (**Students can open it** / **Not available**) and one
primary button (**Make it available** / **Take it back**). Tying to a class day
became secondary, optional, and self-explaining.

**Rule:** count the states your user has to distinguish, not the states the
schema has. If a screen's buttons change per row because the rows are in
different internal states, the abstraction has leaked. Design rule #2 in
`03-design-system.md` says no state-machine vocabulary in the default UI —
"Switch to review only" broke it, and shipped.

---

## 16. Every state machine needs a way back

Falls straight out of #15, but is worth stating alone because it is easy to
check and easy to get wrong.

`course-release-management`'s `allowedTransitions` allowed
`released → live`, `review_only → archived`, `closed → review_only | archived`
— and nothing back to `released`. Closing a lecture was effectively permanent.
It looked complete because every state had *an* outgoing edge.

**Rule:** for every state a user can reach by accident, check there is a path
back to normal. "Has outgoing transitions" is not the same as "is recoverable".
Terminal states should be rare, deliberate and named as such — here only
`archived` is.

---

## 17. An optional-looking parameter the backend conditionally requires

**Shipped broken and reported the same day, 2026-07-28.**

`course-release-management`'s `update_state` takes a `reason`. It is optional
for almost every transition — and mandatory for exactly one:

```ts
if (currentState === "closed" && !input.reason) {
  throw new Error("A reason is required when reopening a closed release.");
}
```

The client typed it `reason?: string` and never sent one. The result was a
screen that worked in one direction only:

- **Take it back** (`released → closed`) — no reason needed. Worked.
- **Make it available** (`closed → released`) — threw every single time.

So the professor could hide content and never get it back, which is the same
symptom as pitfall #16 and had already been "fixed" once at the transition-graph
level. The graph was fine. A second, invisible guard sat behind it.

**Rule:** grep the whole handler for `throw` before wiring a call, not just the
part that looks like validation. A conditional requirement reads as optional in
every signature, every interface and every type check. This is pitfall #3's
family — the contract that TypeScript cannot see — but about *requiredness*
rather than field names.

### And why it looked like nothing happened at all

The error was caught and rendered — at the top of a list of 23 lectures, far
from the button that caused it. From the professor's side: *"I click on make it
available, nothing actually happens."* A hard failure was indistinguishable from
a no-op.

**Rule:** an error belongs next to the control that produced it. Errors are now
keyed by item id and render inside the card. A single page-level error line is
only honest on a page with a single action.

---

## 18. A migration widened a constraint; the edge function's copy of it did not

**Broken since Phase 2, surfaced 2026-07-28.**

Migration 0012 moved the decks into the private bucket and widened the
constraint:

```sql
check (source_kind in ('static_path', 'supabase_record', 'external_url', 'storage_object'))
```

`course-content-library` keeps its own copy of that list for validation, and it
was never updated:

```ts
const sourceKinds = ["static_path", "supabase_record", "external_url"];
```

Every real lecture in the course is a `storage_object`, so `save_content_item`
rejected **all 23** with "A valid source kind is required." It sat broken for
months because the v2 app had no caller for that function until this month.

**Rule:** an enum written in both SQL and TypeScript is two copies of one fact.
When a migration touches a `check (... in (...))`, grep the functions for the
same literals in the same request. `grep -rn "source_kind\|content_type" supabase/functions/`
costs nothing.

### The bigger fix was to stop calling it

Creating a release went through `save_content_item`, which **rewrites the whole
content item** as a side effect. So "make this lecture available" revalidated
every field of the item, and would blank any field the caller forgot to echo
back. `course-release-management` now has `create_release`, which makes a draft
release and touches nothing else.

**Rule:** if adding a child row requires a full rewrite of the parent, that is
the wrong endpoint. Look for — or add — one that owns the thing you are
actually changing.

---

## 19. A date-only column parses as UTC midnight

`planned_date` and friends come back as `YYYY-MM-DD`. `new Date("2026-08-04")`
is parsed as **UTC midnight**, so anywhere west of Greenwich — Monterrey
included — it renders as the 3rd.

A class day created for Aug 4 showed as `8/3/2026` on Home. Both Home and
Gradebook did this; the bug was old and invisible because nobody had created a
session in a while.

**Rule:** never `new Date(value)` on a date-only string. Use `formatDay()` in
`src/i18n/index.ts`, which pins to local noon — safely inside the intended day
for every timezone on earth.

---

## 20. "Removed" that the UI reads off the wrong status

`remove_person` deactivates the **membership** and deliberately leaves
`profiles.status` alone, so the person keeps their account and their work.

The People roster rendered `profile_status ?? membership_status`. Since
`profile_status` is still `invited` or `active`, it always won — so a removed
person's row was **identical** to before: same group, same badge, same live
Remove button. The call succeeded, the toast appeared, nothing looked different.

**Rule:** when two status columns describe different things, name which question
the screen is asking. This column asks "are they on this course", which is
membership, not profile. A `??` chain between two unrelated fields is a bug
waiting for one of them to be non-null.

Same family as #12 and #17: the failure is silent and looks like a no-op.

---

## 21. Verify against the bundle that is actually loaded

While confirming a fix, the page kept showing old behaviour after a deploy that
had definitely landed. The cause was mundane: an in-page `location.href = …`
navigation was served from cache, so the tab was still running the previous
bundle.

Ten minutes went into re-reading correct code.

**Rule:** when a fix "doesn't work" after deploying, check what is loaded before
you check what you wrote:

```js
[...document.querySelectorAll('script[src]')].map(s => s.src.split('/').pop())
```

Compare it to the hash `vite build` printed. A cache-busting query string forces
a real fetch. The runbook already says to confirm the deploy hash *before*
testing; this is the same rule one layer in.

---

## 22. Supabase CLI and the SQL editor have different permissions here

`npx supabase db push` and `npx supabase functions deploy` work. Retrieving the
service-role key and running arbitrary `INSERT`s through the dashboard SQL
editor may be blocked by tooling policy. Prefer the app's own endpoints, or
`npx supabase storage cp`, over hand-writing rows.

---

## 23. A successful write can be a product no-op

**Reported by the professor on 2026-07-29.**

Content showed **Week 1 Quiz: Security Foundations** with the same availability
control as a lecture. Making it available succeeded: a release row moved to a
student-visible state.

Both student screens then deliberately filtered the item:

```ts
r.content_type === "activity" && r.source_kind === "supabase_record"
```

That filter was individually reasonable—the activity has no standalone viewer
and otherwise becomes a dead `#` link. Together, the two screens formed a
contradiction: the instructor was promised "Students can open it" while every
student consumer was designed never to show it.

The same leaked abstraction made reflection confusing. Reflection belongs to a
class session after its live quiz closes; it does not belong to a released quiz
card.

**Rule:** before exposing a create, publish, release, or availability action,
trace the result through every intended consumer. A successful database
transition is not evidence of a usable feature. If the consumer has to filter
the result out, the producer must not offer the action.

This is pitfall #14 from the opposite direction: #14 had a consumer whose
producer did not exist; this had a producer whose consumer intentionally did
not exist.

---

## 24. Sessions and content releases answer different questions

The student Today and Live screens locate a class session by searching content
release rows for `class_session_id` and `session_state`. This couples "is class
happening?" to "was some content released for it?"

It already caused the original missing Join class failure when the wrong
release state was checked. It remains fragile even after that fix: a valid
scheduled class with no associated release has no independent student
representation.

**Rule:** return student sessions and content releases as separate collections.
Sessions drive Today, QR joining and `/live`; releases drive Review and the
gated viewer. Never require a content row to discover a live class.

---

## 25. Availability is a delivery promise, not a database state

**Found 2026-07-29 while beginning the coherent class-lifecycle redesign.**

A release can be student-visible in the database even though its content type
has no route a student can open. Activities and question banks are live-only:
they are inputs to the live class, not self-study cards. A release control that
does not account for that distinction creates a successful write followed by a
product no-op.

**Rule:** classify content by its actual student delivery before exposing it in
an instructor availability control or a student material list. Only viewer and
external delivery may enter Review; live-only content belongs to the live class,
and internal content is never shown to students.

---

## 26. A lecture picker is not authorization

A class-day form may offer only lectures from the current course, but the
browser payload is still caller-controlled. Accepting its `content_item_id`
without checking it would let a crafted request associate another course's item,
or a quiz bank/activity that cannot be presented as the class lecture.

**Rule:** validate associations again at the edge-function boundary. For class
sessions, the selected item must exist, belong to the requested course, and have
`content_type = 'lecture'`. The browser's filtered select is usability; the
edge function is the data-integrity boundary.

---

## 27. Authentication return paths are an open redirect unless allow-listed and consumed

A QR join can begin while the student is signed out, so the app must remember
where to return after authentication. Storing an arbitrary pathname or URL
turns that convenience into an open redirect, and leaving even a safe value in
storage lets an old class hijack a later sign-in.

**Rule:** authentication return storage accepts only
`/join/<4–12 uppercase alphanumeric characters>`. Reject absolute URLs,
protocol-relative URLs, and every non-join app route. Remove the storage key
before interpreting its value, so it is consumed exactly once even when the
stored value is malformed.

Magic-link sign-in is a second completion path: it boots already authenticated
and does not call the code/test sign-in completion helper. The signed-in Join
screen must consume the stored value too. Test both consumption paths whenever
authentication recovery changes.

The QR itself identifies only the class session. Encoding a question or pulse
round would force students to rescan during class and couple joining to content
that expires within seconds.

---

## 28. An outline is not a slide coordinate system

Questions used to be generated from the extracted lecture outline while the
deck was generated in a separate step. That works for a topic-level bank, but
it cannot answer the live-class question that matters: *has this exact material
already appeared on a finalized teaching slide?*

Guessing slide ranges from the outline would create metadata that looks precise
and is impossible to verify. Generating questions before slide numbering also
lets a later deck rewrite move the cited idea beyond its supposed checkpoint.

**Rule:** finalize and sequentially number the teaching slides first, then give
that exact JSON to question generation. Require every question to cite only
slides at or before its checkpoint, validate the range against the cited
numbers, and reject the whole bank before any insert when coverage is wrong.

The database range check is a last line of defence, not the quality gate. It
cannot prove that a cited slide contains the answer or that a bank has 18
questions, a 6/6/6 balance, 3–5 checkpoints and two candidates per checkpoint.
Those invariants live in one shared backend validator used by every generated
insert path.

---

## 29. Inserting a checkpoint creates two slide coordinate systems

A generated lecture now has **teaching slides** and **physical presentation
slides**. If a checkpoint is inserted after teaching slide 15, it becomes the
next physical slide in the deck, but it must not turn the former teaching slide
16 into teaching slide 17. Question citations and checkpoint coverage were
validated against the finalized teaching slides before assembly; renumbering
them afterwards would silently invalidate that contract.

The browser still needs the physical position for its counter and navigation,
while Run Class needs the stable teaching position to decide what material has
been covered.

**Rule:** never derive teaching position from a generated deck section's DOM
index. Give every teaching section its original `data-teaching-slide`, leave
checkpoint sections without one, and send both physical `slide` and nullable
`teaching_slide` over the bridge. Insert checkpoints by matching
`after_slide`, not by splicing array offsets.

`segment_key` identifies a concept, but it is not guaranteed to identify one
physical checkpoint: the same concept label may legally appear at more than one
`after_slide`. A deck key must therefore be derived from the segment and its
position when the segment repeats. Rejecting that shape only during assembly is
too late—the validated questions have already been cached, so every retry would
reuse the same unassemblable data.

The same bridge also has two identity boundaries: origin and window. Checking
only `event.origin` lets any same-origin frame impersonate the deck. The parent
must additionally require `event.source === iframe.contentWindow`; the deck
must require `event.source === parent`. Validate the version and exact plain-data
shape before reading message fields so accessors or extra executable values are
never invoked.

`Object.keys` is not an exact-shape check: it omits non-enumerable own
properties, including a hidden executable or unknown value. Enumerate every own
key with `Reflect.ownKeys`, reject symbols, and inspect every property descriptor
before reading values. Require enumerable data descriptors and then compare all
own string names with the protocol's exact key set.

The editable deck engine lives in the backend repository, so its frontend
contract verifier has a second failure mode: a missing sibling checkout can
look like "nothing to inspect." Missing source is a verifier failure, never a
skip. CI must explicitly check out the backend and pass
`COURSE_PLATFORM_BACKEND_ROOT`; keep backend-owned workflow enforcement too so
neither repository can silently drift.

Keyboard intent belongs in the same protocol. A key event focused inside the
iframe does not bubble to the parent window. Checkpoint Space therefore emits a
generic `deck.checkpoint_action`; it must not claim `send` or `reveal`, because
only the parent owns the current live-round state and may decide which action is
valid.

---

## 30. A legacy deck rewrite can destroy the only working copy

Checkpoint preparation has to modify two systems: question metadata in Postgres
and the lecture HTML at its existing private Storage path. Replacing the HTML
before Claude output and the whole 18-question mapping are validated would turn
one bad model response, malformed source range, or database failure into a
broken class deck.

**Rule:** finish every read and every fallible pure step first: authorize the
instructor; require a private `storage_object` lecture and one active bank;
download and extract the ordered teaching slides; load all unchanged questions
and options; make the single metadata-only model call; validate exact question
ids, 6/6/6 balance, 3–5 checkpoints, source ranges and two candidates per
checkpoint; then build and re-read the transformed HTML. Only after all of that
may one transaction update all five metadata columns for all 18 questions and
mark the bank `pending_upload`. Never loop through 18 independent updates: row
10 can fail after rows 1–9 have committed, leaving metadata that is neither
legacy nor usable. The transaction must not touch prompts, options, or question
lifecycle status. Upload to the same private path only after that durable
pending boundary.

Legacy decks carry lecture-specific inline CSS and JavaScript in addition to the
old shared engine. Do not rebuild the slide bodies and do not replace every
`<style>` or `<script>` tag. Identify only the old shared assets, reuse
`DECK_STYLE` and `DECK_SCRIPT`, and preserve the custom blocks. Use callback
replacements for HTML transformations: replacement strings interpret `$&`,
`$1`, ``$` `` and `$'`, so an innocent asset literal can silently corrupt a
deck. Re-extract the result and require the same teaching-slide count, text and
order before any write.

`<section\b...>.*?</section>` is not a structural slide parser. A nested
`<section>` inside teaching content makes that expression stop at the inner
closing tag, after which injection can splice the rest of the teaching slide in
the wrong place. Scan balanced section tags and fail closed when a teaching
slide participates in nesting. The fidelity check must use those structural
boundaries too, not the same blind regex as the transformer.

A balanced section stack is still unsafe if tag discovery uses `[^>]*`: `>` is
valid inside a quoted attribute value, and stopping there splices
`data-teaching-slide` into the attribute. Find a tag's closing `>` only while
outside single/double quotes; fail closed on unterminated quotes; and ignore
section-looking text inside comments and raw script/style content. Text equality
alone can agree with the same broken tokenizer, so also compare each teaching
section's exact original markup after normalizing only the deliberately added
`data-teaching-slide` attribute.

Legacy navigation is not consistently absolute. Historical decks contain bare
relative, `../` parent-relative, root-relative, and absolute Home, Mission,
Quiz, and Exit links, with query strings and fragments. Match normalized path
suffixes only on `ui-btn` anchors and keep a fixture matrix for every form;
otherwise a cleanup can report success while leaving the exact link students
click.

Postgres and Storage do not share a transaction. The required Storage-last
ordering protects the existing deck from authentication, model, validation and
database failures, but upload or final-readiness failures must leave a durable
`pending_upload`, not an ambiguous partial bank. Content exposes Resume/Retry
only for that state. The retry reads the persisted full-bank metadata,
idempotently removes/recreates checkpoint sections in the current deck, uploads
again, and marks `ready`—it never calls the model again. Treat `ready`, not the
earlier metadata update, as the completion boundary; pilot one lecture, preview
it through `/content?t=…`, and never batch the remaining decks blindly.

---

## 31. Private instructor viewing and live question identity are separate gates

An instructor needs to preview and present the session's selected lecture even
when students have no release. Reusing the student `request_url` path makes a
release an accidental prerequisite; creating a release as a workaround changes
student access merely because the professor opened Run Class.

**Rule:** instructor deck access starts from `content_item_id`, loads that item
first, derives its course from the stored row, requires an active teaching role
in that course, requires a private `storage_object`, and mints the existing
short-lived content token. It never reads or writes `content_releases`.
Presentation still goes through same-origin `/content?t=…`; instructor status
does not make `srcdoc`, `blob:`, public Storage, or popup permissions safe.

A `question_id` is not enough authorization for a live pulse. Without a
server-side join through the question bank, a stale or modified browser can send
a valid question from a later checkpoint or a different lecture while still
receiving a perfectly valid snapshotted round.

**Rule:** when a checkpoint pulse is pushed, the server reloads the active
question, its active bank, and the class session. Require the session state to
be exactly `live`, require `session.content_item_id` to equal
`bank.content_item_id`, and require the stored `checkpoint_after_slide` to equal
the requested checkpoint before closing another round or inserting anything.
Snapshot prompt and options only after those checks; never accept a
client-authored snapshot for the checkpoint path.

Deck keyboard events are presentation intent, not server authority. Space may
mean Send only while the parent is `ready`, and Reveal only while it is `open`.
Right Arrow can emit both checkpoint-skipped and slide-changed while resuming;
the parent must transition its panel state before the follow-up event so it does
not close or resume twice. Keep exact state-transition and protocol-mismatch
tests for both paths.

---

## 32. A short-lived deck token must refresh without resetting the lecture

Replacing an iframe token with a fresh `/content?t=…` URL reloads the deck.
Without carrying forward the last `deck.slide_changed` value as a hash, a
refresh silently returns a professor to slide 1 in the middle of class. Clearing
the iframe when token minting briefly fails is worse: a transient network error
blanks the projector even though the existing document still works.

**Rule:** mint the replacement token, append the last known slide hash, then
swap the iframe source. Reset the parent bridge for that deliberate navigation.
If refresh fails, keep the existing source visible, show a bilingual warning,
and retry. Only the initial load may render the unavailable fallback.

---

## 33. Pulse transitions must be conditional and reload-recoverable

A reveal response can arrive after Right Arrow has already closed the round.
An unconditional update then changes `closed → revealed`, resurrecting a
question students should have left. Likewise, keeping the active round only in
component state makes a browser reload forget a question still open on every
student phone.

**Rule:** reveal updates only `open`; close updates only `open | revealed`;
same-target retries are idempotent; stale transitions fail without changing
state. Run Class recovers the current round from the server, including its
segment and checkpoint slide. Ending a session also closes all visible pulses
server-side, so a client failure cannot strand the class lifecycle.

Keyboard repeat is a separate edge: ignore `keydown.repeat` in the generated
deck. Otherwise one held Space can send and immediately reveal after the parent
state changes between repeated events.

---

## 34. A model's concept label is not checkpoint identity

The first real legacy-bank preparation put multiple questions at the same slide
boundary but supplied a different `segment_key` for each. The mapping was
semantically useful, yet the validator counted 18 one-question checkpoints and
rejected it. A retry produced six valid shared boundaries—still one above the
product's 3–5 range.

**Rule:** checkpoint identity is the authored slide boundary. Before validating,
give every question at one boundary the same canonical key. If a model returns
more than five boundaries, merge the closest adjacent boundary into the later
one; that preserves the rule that every cited source slide has already been
taught. Keep the 3–5 and minimum-candidate validators after normalization.

---

## 35. Supabase extension functions are not in a `public`-only search path

The atomic class starter used `gen_random_bytes` while declaring
`set search_path = public`. Supabase installs pgcrypto in `extensions`, so the
function failed at runtime with “function gen_random_bytes(integer) does not
exist” even though the migration applied cleanly.

**Rule:** a `security definer` function should keep a restricted trusted search
path, but it must include every trusted schema it intentionally uses. For
pgcrypto here that is `public, extensions` (migration 0023). Exercise each new
RPC through its real edge-function caller after applying it.

---

## 36. Destructive confirmations should be in-app state, not `window.confirm`

Native dialogs block browser automation and offer poor styling, translation,
and consequence layout. The full production rehearsal reached the end of class
but could not reliably accept the native dialog through browser control.

**Rule:** first click changes the action to an explicit bilingual confirmation
button and renders the consequences beside it; the second click performs the
write. This is easier to test, clearer on projector and phone screens, and does
not depend on browser-owned modal behavior.

---

## 37. Private student notes need both the class and the profile scope

A profile-wide history is useful in People, but it is not a per-class record.
Showing it unfiltered in Gradebook silently mixes notes from other class days;
using a session-only list makes it easy to write against the wrong student.

**Rule:** a Gradebook note composer always receives the selected
`class_session_id` and `profile_id`; its history loads the session then filters
to that profile. People may load the profile-wide history, but students must
never import or call the private-notes API.

---

## 38. Auth-context sections are the signed-in person's enrollments, not all groups

The first Manage members link passed a correct group UUID, but People resolved
its label and Add person choices from `course-auth-context.sections`. That
collection intentionally contains only the signed-in person's section
enrollments. An instructor who was not enrolled in the target group therefore
saw a raw UUID and an empty group picker.

**Rule:** course administration screens load authoritative groups from
`course-section-management`. Treat auth-context sections only as identity and
access context. Moving a student between groups must also be one transactional
server operation: course-scope the target, preserve old enrollments as dropped,
reactivate the target and course membership, and audit the before/target IDs.
Because roster responses retain dropped history and can include enrollments
from other courses, a current member must match the exact group with
`role = student` and `status = active`; current-group detection must also
require the enrollment's section ID to be in the authoritative group set.

---

## 39. Deploy a new RPC migration before the edge function that calls it

The roster-management function deployed successfully and passed Deno checks,
but its first production group assignment returned the generic fallback
“Unable to manage roster.” The function was current; production's migration
ledger showed `0025` only on the local side. Its
`assign_student_section_atomic` RPC therefore did not exist remotely.

**Rule:** when an edge-function release depends on a new migration, inspect
`npx supabase migration list --linked`, apply the reviewed migration, and only
then deploy the function. A successful function deployment proves packaging,
not that its database contract exists. Exercise the new RPC through the real UI
immediately after deployment.

Supabase errors are plain objects often enough that `error instanceof Error`
may discard their useful message. User-facing fallbacks should stay safe, but
deployment diagnostics need the function logs or linked migration ledger rather
than assuming a generic message identifies the cause.

---

## 40. Student auth context is a snapshot, not a release subscription

Closing a class created the correct group-scoped Review release, but the
already-open student shell initially showed its pre-close release list.
Reloading refreshed `course-auth-context`, after which the lecture appeared as
**Review only** for the assigned QA student and remained absent for a student in
another group.

**Rule:** tests that mutate releases from a separate instructor session must
refresh the student context before judging access. Do not mistake a stale
in-memory context for a missing release, and do not add client-side inferred
access as a workaround. The edge response remains the authority.

---

## 41. Historical groups and invited students have opposite assignment rules

The first group-move implementation validated course ownership but not group
status, so a direct call could reactivate enrollment in an archived or completed
group. Its UI also required `profile_status = active`, which excluded a newly
invited student precisely when an instructor needs to place them before first
sign-in.

**Rule:** assignment targets and student eligibility are separate predicates.
Targets must be `planned | active`; profiles may be `active | invited`.
Enforce both in the UI and in the transactional RPC. Keep historical groups
visible for audit and roster review, but render an explicit bilingual
non-assignable explanation instead of controls.

Do not rewrite a migration that has reached production. Migration 0025 is
deployed history; migration 0026 replaced the function with the stronger
contract. Return stable error codes from the edge function so People can show
localized guidance, while safely extracting the useful `message` field from
plain Supabase error objects for logs and diagnostics.

The production follow-up proved both sides of the boundary. An invited profile
was assigned before first sign-in. After the target group was archived, the
filtered People view withheld the target and explained reactivation, while a
pre-staged authenticated assignment returned the localized
`group_not_assignable` guidance and left the student's existing group
unchanged.

---

## 42. Current enrollment is not historical class-note ownership

A student move marks the old group enrollment `dropped`. Note creation,
profile-history loading, session listing, and follow-up resolution originally
required the old enrollment to remain active. The move therefore hid earlier
notes, blocked unresolved follow-up, and one moved student could make the whole
session-note list fail.

**Rule:** private class-note integrity follows the session's course and the
student's historical `active | dropped` enrollment in that session's group.
Profile history starts from course-scoped note rows, not current group sessions.
Do not batch-fail a session list because a student later moved. Keep the notes
endpoint instructor-only; historical access does not change student privacy.

Production proof moved QA Test Student out of QA730E after creating an
unresolved note. The old session still loaded every student and note, People
retained all three semester notes, and resolving from People preserved the full
list through reload.

---

## 43. A class number belongs to its group

Moving planned Class 1 from Group A to Group B can collide with Group B's own
Class 1 because the schema key is `(section_id, sequence_number)`. Returning
“choose another class number” is impossible advice: the interface intentionally
does not ask professors to manage sequence numbers.

**Rule:** lock the target group inside the atomic session-edit RPC. If the
incoming number is taken, assign `max(sequence_number) + 1`, persist it in the
same transaction, audit before/after sequence values, and return the resulting
row.

Production proof moved QA730E sequence 3 into A while A contained sequences
1–4. The persisted session returned A sequence 5.

---

## 44. Atomic close still needs an idempotent cleanup retry

Closing the session and creating its Review release are atomic, but the edge
function closes pulse and activity rows afterwards. If that cleanup call fails,
a retry sees an already-closed session. Rejecting `closed → closed` strands the
cleanup even though the authoritative close succeeded.

**Rule:** the close RPC returns an already-closed session immediately, before
writing another release event or audit record. The edge transition guard must
allow that exact retry, then rerun idempotent pulse/activity cleanup.

Production counts for release / release event / close audit were `0 / 0 / 0`
before close, `1 / 1 / 1` after close, and remained `1 / 1 / 1` after a second
authenticated stale-tab close request.

---

## 45. Raw `scheduled` is not the same as student-visible

The instructor Content summary treated every `scheduled` row as open even when
`opens_at` was in the future, while the student auth endpoint correctly hid it.
The same screen tried to remove scheduled access using `closed`, a transition
the release state machine rejects deterministically.

**Rule:** compare `opens_at` with the current time when reporting availability.
Keep future scheduled scope visible as scheduling information, not available
content. Its explicit bilingual cancellation action uses
`scheduled → draft`; normal Review removal uses a valid visible-state
transition to `closed`.

Production proof used a QA730E release opening in 2035. Content labeled the
material scheduled and not available; cancellation returned it to `draft`
without the previous deterministic transition failure.
## Projector/controller deployment (2026-08-04)

The projector must be remounted when the active class session changes, even if
both sessions use the same lecture. Otherwise the deck bridge has been reset
but no fresh `deck.ready` event arrives, so remote navigation and telemetry
silently stop. `Projector` keys `InstructorDeck` by session generation and
guards all acknowledgement/checkpoint retries with both session and bridge
identity.

The remote projector protocol lives inside the generated deck HTML. Deploying
`course-presentation` alone is insufficient for decks generated before the
protocol existed: the API state changes, but the old iframe ignores
`course-platform:goto-slide` and stays on its first slide. Deploy the updated
deck engine and run the idempotent **Refresh lecture deck** action for existing
ready banks before testing projector navigation.

The deck controls are bidirectional. A projector-side click must be reported
as a local navigation event and written through the safe projector-shaped
`request_slide` response; otherwise the controller can remain on an older
slide even though the projector moved. Keep remote-vs-local navigation marked
explicitly in the deck bridge.

## 46. A parent overlay disappears in browser fullscreen

The lecture deck is an iframe. A question layer rendered only by the parent
Run Class page is hidden when the professor presses the deck's fullscreen
button, because fullscreen promotes the iframe document itself. The live
question must therefore be rendered inside the generated deck engine as well
as in the parent page. Keep the payload answer-neutral: prompt, bilingual
prompt, and option text only — never `correct_key`, correctness flags, results,
student names, or scores.

## 48. A desktop tab is not a real-phone classroom rehearsal

QR joining, late joins, concurrent answers, timer expiry, reflection and podium
depend on separate student devices and independent browser lifecycles. A
signed-in instructor tab can prove the deck/checkpoint protocol, but it cannot
prove phone camera scanning, sleeping phones, network handoff, or simultaneous
submissions. If browser automation is blocked by an extension UI, record the
instructor-side evidence and leave the phone rehearsal explicitly pending
instead of claiming an end-to-end classroom pass.

## 49. The normal Run Class overlay must have an opaque app token

The fullscreen deck owns a question layer inside its iframe. Normal Run Class
also mounts a parent layer so the question remains visible outside fullscreen.
If the parent background references an undefined token, CSS drops the
background declaration and both layers show through each other: the prompt is
painted twice and appears to stack or flicker. Keep the parent layer on a
defined app surface token and retain the verifier that rejects `--surface-0`.

## 50. The question preview is part of the public classroom display

The professor's Run Class page is often the exact browser window sent to the
room projector. The generated bank includes `is_correct` for grading, but the
pre-send question preview must never use it for styling or labels. Otherwise
students see the answer before they respond. Keep the preview neutral and only
show correctness in the private results/reveal state.

## 51. A question can be readable without the side controls

Run Class keeps the instructor controls beside the deck, but that layout is
too narrow for long bilingual questions. The audience layer therefore needs a
user-initiated browser Full screen action. Keep it on the neutral layer, with
Escape and a matching toggle to return to the cockpit.

## 52. Question-bank edits must preserve historical references

Question options can be referenced by student responses. Expert removal is
therefore a status archive, not a hard delete, and edits update existing option
rows in place. The edge function validates four options and exactly one correct
answer before writing and records an audit event for every edit or archive.

## 53. External instructor email is role-gated, not domain-gated

The sign-in form may accept any well-formed email so an invited professor can
request a magic link. The server must then confirm that the address belongs to
an active or invited instructor/platform-owner membership before bypassing the
institutional-domain guard. Never make every external student address valid by
changing only the client-side check.

## 54. The People form must mirror the role-aware email policy

The server permits external instructor invitations, but the People form also
computes whether an outside-institution reason is required. If that UI check
looks only at the email domain, an external instructor is correctly accepted by
the API but the Add person button stays disabled until a misleading reason is
entered. Keep the client condition role-aware (`role !== "instructor"`) and
retain the reason requirement for external students, teaching assistants, and
observers. The class-session verifier guards this contract.

## 55. An invited roster row is not an invitation email

Creating a `profiles` row with `status = 'invited'` only makes the address
eligible to claim the course. It does not contact the mailbox. Any instructor
invite flow must call Supabase Auth's `inviteUserByEmail`; when Auth already has
that address, fall back to `signInWithOtp` so re-added instructors still get a
fresh link. Surface the delivery result and provide a resend action—otherwise
the UI can look successful while the professor receives nothing.

## 60. A uniqueness check that names content the caller cannot see

**First written 2026-08-06 as "the second professor silently overwrites the
first." That was wrong, and the correction is the more useful entry.**

`course-generation`'s `create_job` already refuses a colliding slug:

```ts
if (clash) throw new Error(
  `A content item with slug "${lectureSlug}" already exists — choose a different one.`);
```

So in the ordinary sequential case nothing is overwritten. The original claim
came from reading the worker's `upsert(..., { onConflict: "course_id,slug" })`
in isolation and never checking whether anything upstream had already closed
the door. **Reading one end of a write path is not reading the write path.**

What is genuinely wrong is subtler, and it only appears once content is owned:

1. **The refusal names content the caller is not allowed to see.** Once the
   library is scoped by owner, professor B cannot see professor A's
   `firewalls` lecture — but is still told it exists, by name, and is blocked
   from a title they have every right to use. A uniqueness error across a
   privacy boundary is both an information leak and impossible advice, the same
   shape as pitfall #43's "choose another class number".

2. **Two narrow races survive the check.** Two jobs created concurrently with
   the same slug both pass, and the second to assemble overwrites the first.
   The same holds if a publish or `register_item` creates the slug between job
   creation and assemble. The check is a read followed by a much later write,
   with no lock and no unique constraint failure to fall back on, because the
   write is an upsert.

**Rule:** a global uniqueness check stops being a usability feature the moment
the namespace stops being global. Namespace the slug by owner so two
professors can both have a "Firewalls" lecture, and make the write refuse an
item the caller does not own — so the remaining races fail loudly instead of
resolving in favour of whoever finished last.

And: when a check and its write are far apart, the check is advisory. The
guarantee has to live at the write.

---

## 61. "Sharing is done" meant every consumer of a share, not the one thing that creates one

Requirement 7's design and the first implementation round built
`canEditContentItem`, `isVisibleContentItem`, `copy_content_item`, the shared
badge, the Copy button, and the `content_shares` table itself — every piece
that *reads* or *acts on* a share. Reported as complete. It was not: no code
path anywhere ever wrote a `content_shares` row. An owner had no action to
grant one, so "share with a group" existed in the schema and nowhere else.
`grep`-ing for `content_shares` at the time would have shown only reads.

Caught when the professor asked "I don't see how I can share content" —
the honest answer was that the button had never existed, not that it was
hard to find.

**Rule:** when a feature has a grantor and a grantee, verify both write paths
exist before calling it done. A schema column plus a consumer path that
assumes rows will appear is not evidence anything populates it — trace one
concrete row from the action that creates it to the action that reads it. If
you can't name the button/action a professor clicks to create the row, the
feature isn't built, regardless of how much of the surrounding machinery is.

Fixed by adding `share_content_item` / `unshare_content_item` to
`course-content-library`, gated by `canEditContentItem` (never
`isVisibleContentItem` — a recipient must not be able to re-share), plus a
`shareable_sections` course-wide list for the picker (narrower than
`course-section-management`'s roster-filtered list, since pitfall #38 hides
sections you don't teach but sharing requires naming one you don't) and a
`shares` field on each owned item so the owner can see and revoke.

---

## 62. "The content repo was created and populated" meant tooling only, not content

`PROJECT-HANDOFF.md` and `05-status.md` both recorded, as part of a completed
deploy sequence dated 2026-08-07, that step 1 was "`mzareei/course-content`
created; `tools/content-repo/` moved into it." Read on its own, that sentence
implies the edit-locally-push-publish loop is live.

It wasn't checkable at the time — the sessions writing those entries had no
access to the real `mzareei/course-content` repository, only to the scaffold
copy inside `course-platform/tools/content-repo/`. A later session (2026-08-07,
this one) did have access and diffed the two. The real repo held exactly the
scaffold as it existed *at the moment of that one copy-in*: `course.json`,
`lib/validate.mjs`, `tools/publish.mjs`, `tools/validate.mjs`, the CI workflow.
Two things had since been added to the `course-platform` copy and never
carried over — `tools/pull.mjs` and `lib/pull-metadata.mjs` — and one thing had
never existed anywhere: an actual pulled-down copy of any of the 27 production
items. `courses/` does not exist in the real repo at all.

"Moved the scaffold in" and "the authoring loop works" are different claims.
The first is a file copy; the second requires the fetch tool to exist in that
copy *and* at least one item to have been pulled through it. Neither had
happened, so "modify a lecture, push, done" had no working first step despite
two status entries that read as though it did.

**Rule:** a claim about a second repository's contents is not verified by a
status entry in this one, even a status entry written in good faith by a
session that genuinely did what it could reach. If you have access to
`mzareei/course-content` and are about to tell the professor the pull/edit/
publish loop is ready, `ls` the actual repository first. See
`docs/CONTENT-REPO-SYNC-HANDOFF.md` for the gap and the plan to close it.

---

## 63. Pulling live bytes can expose validator failures that production tolerated

The first complete pull of `mzareei/course-content` found four failures that
were not visible from the database metadata alone. Two real teaching links in
`week-01-lecture-2` needed explicit `external_links` declarations. The Week 3
XSS teaching example contained the text `location.href='evil.com?c='`; the
validator correctly scans HTML attributes, but that code sample looked like a
relative `href` reference to the scanner.

The fixes belong at the content boundary: declare legitimate teaching hosts in
the item's metadata and write the code example in an equivalent form that
cannot be parsed as a document attribute (`location['href']`). Do not weaken
the validator, allow `mzareei.github.io`, or skip validation because the bytes
already exist in production. A pull is the point where production artifacts
become reviewable source, so the repository gate must be allowed to surface
these mismatches.

The same round-trip also confirmed the operational boundary: publishing the
artifact does not make it student-visible. To test a newly published unreleased
item through the real app, temporarily release it, open it through the signed-in
student Review route, record the observed result, and close that exact test
release afterward. Verify the final release state rather than trusting a UI
toast; a timed-out browser action can leave the release unchanged or still
active.

---

## 57. Gated content can link straight back out to its public copy

Found 2026-08-05 during the content-origin audit, by rebuilding all 23 items
with `migrate-gated-content.mjs --dry-run` and grepping the output.

The Phase 2 migration deliberately rewrote every relative link in a deck or
mission to an **absolute public URL**, so cross-navigation would keep working
while the public copies still existed. That was correct then. The consequence
now is that every object in the private bucket carries hard
`https://mzareei.github.io` links — and nine of the twelve missions link to the
**public, ungated copy of their own lecture**. A student inside `/content?t=…`
is one click from the material the gate exists to protect.

`removeLegacyDeckNavigation()` in `_shared/checkpoint-deck.ts` cleans four
destinations, but only from anchors carrying `ui-btn`, and only when a lecture
goes through checkpoint preparation. Mission anchors use `class="btn"`, and
missions never go through that path at all. So the cleanup that exists has
never touched a mission and, as written, never would.

**Rule:** a gate is only as good as the outbound links inside what it serves.
When content moves behind an authorisation boundary, audit its *outbound* links
as carefully as its inbound ones, and make "no reference to the public origin" a
validator, not a review habit. Ordering matters too: retiring the public site
before the objects are re-published turns every mission's primary navigation
into a 404 from *inside* the private bucket.

---

## 58. A superseded storage object does not go away on its own

**First written from the code, then corrected by production on 2026-08-06.**
The correction is the more useful half.

The derivation: `migrate-gated-content.mjs` passes `filename: "index.html"`,
the AI pipeline writes `deck.html`, so the bucket must hold two conventions and
a publish tool that assumes one would corrupt the other.

Production says otherwise. **Every one of the 24 storage-backed items points at
`deck.html`** — and **all 23 `index.html` objects are still in the bucket**,
referenced by nothing. Something re-uploaded and re-registered the decks under
a new filename, and the old objects were simply left there. Neither repository
contains the script that did it.

They are not served: the gated chain resolves `source_ref`, and no row points
at them. But they are almost certainly the original Phase 2 artifacts, public
links and all, sitting one signed URL away from being served by anything that
guesses a path.

**Rule:** Postgres and Storage do not share a transaction, and they do not
share a garbage collector either. Changing where a row points leaves the old
object alive and unreferenced, forever. When a storage path changes, decide
explicitly what happens to the object it used to name — and record that
decision, because the next person will find two plausible files and no way to
tell which one is live.

Corollary: never re-register content by scanning the bucket. Two candidate
files per slug means a scanner has to guess, and guessing wrong silently
reverts a lecture to an older version that still renders perfectly.

---

## 59. `created_by` is not populated by every write path

`course-content-library`'s insert sets `created_by`. `course-content-upload`'s
`register_item` upsert does not — it never has. So the 23 migrated decks, the
entire hand-authored course, almost certainly carry `created_by = null`.

This only surfaced when ownership became a requirement: there is no data to
backfill *from*. Ownership has to be assigned by a reviewed decision, not
recovered.

**Rule:** if a column is meant to answer "who made this", check every path that
creates a row, not the one you happen to be reading. An upsert that omits the
column writes null on insert and leaves it stale on update — the same family as
pitfall #13, where the payload was written on the update path and should not
have been.

---

## 56. Course instructor membership is not global group access

TC2007B is one course containing groups 401, 402, 501, and 502. A course-level
`instructor` membership grants teaching capability, but it does not grant
visibility into every group. The section assignment is the active
`section_enrollments` row whose role is `instructor`; only an active
`platform_owner` membership is global. Every teacher-facing edge function must
load the permitted section IDs and apply them to reads and writes. A client
filter is not sufficient because a crafted request could otherwise expose or
mutate another professor's roster, sessions, releases, or grades.

---

## 57. Attendance is only as real as the door it is measured at

`course-session-join` used to validate a join code and return `joined: true`
without writing anything, so the platform had no check-in record at all. Two
paths reached a live class with no scan: a **Join class** button on Today, and
`selectLiveSessionId()`'s fallback to any live session the student was enrolled
in.

Adding an attendance table without closing both would have produced a table that
looks authoritative and is fiction — the worst kind, because a professor would
act on it.

Two rules came out of this:

- **A gate on one door is not a gate.** A student reaches a live class through
  three functions: `course-pulse` (answer), `course-activity-attempt`
  (start_attempt), and `course-exit-ticket` (submit). All three call
  `_shared/attendance.ts`. Gating only the visible one leaves the other two open.
- **Selection is not authorisation.** The client still picks *which* session to
  ask about; only the server decides whether the student may be in it. The
  client-side check exists to render a courteous message, never to enforce.

A corollary worth remembering: `localStorage` cannot be the gate. A student on a
borrowed laptop, or in private browsing, has no stored join and every right to
be in the room.

## 58. "Allow about 20% mistakes" is a threshold, never a count

The class grade scales a raw score against `MASTERY_THRESHOLD = 0.8`. Writing it
as "three wrong answers are forgiven" would be wrong the moment a class pushes
ten questions instead of fifteen. The room for error is a *share* of however many
questions were actually asked.

Related: when a class ran no pulses, or no quiz, the surviving component takes
the full weight rather than the missing one scoring zero. When neither ran the
grade is **null**, rendered `—`. A class that graded nothing did not fail
anybody, and a table that says `0` claims it did.

## 59. Two paths posting to the gradebook meant students saw the wrong one

Two functions independently created gradebook categories and posted to them:

| Function | Category | Weight | What it posted |
|---|---|---|---|
| `course-class-quiz` | `Quizzes` | 30%, drop-lowest 1 | the raw end-of-class quiz score |
| `course-class-record` | `Class grades` | **0%** | the real composite grade |

Nothing was broken in either one. The bug lived in the arithmetic *between*
them: the weighted course total multiplied the composite by its 0% weight, so
the only number reaching a student's phone was the raw quiz score — 43.7% where
the class grade was 73.96. The professor's screen showed 74 and the student's
showed 43.7, and both were reading the database correctly.

Three lessons:

- **A component of a grade is not a peer of it.** The quiz is 70% of the class
  grade. Posting it beside the class grade entered the same performance twice
  and invited exactly one of them to be read as the answer.
- **A 0% weight is not "not configured", it is "worth nothing".** No screen
  reported that class grades were being discarded, because discarding them was a
  valid configuration.
- **Whoever creates a category decides its weight, whether or not they meant
  to.** Both `ensureGradebookCategory` implementations picked a weight inline;
  neither author was choosing a course grading policy, but between them they had.

Weighted categories are gone (migration `0043`). One class is one grade and the
course total is their plain average, so there is nothing left to weight. If
weighting ever returns, it must be configured in exactly one place and no
function may invent a default on insert.

## 60. Grading rules must be shared, not copied, once two screens show them

The formula now renders on two screens — the professor's class record and the
student's My Grades. It lives in `_shared/class-grade.ts` and both call
`computeGrade`; only the data-loading differs (whole roster vs one student,
batched across classes).

Do not let the second caller grow its own copy. A student and a professor
looking at different numbers for the same class is the single most expensive bug
this system can produce: it is the professor's credibility, not a rendering
glitch, and it is invisible until someone disputes a grade.

## 61. A backfill that quietly matches nothing is worse than one that fails

`0043` linked each class-grade item to its class session by rebuilding the
title string `Class <n> — <title>`. An exact-string match against a title that
can be renamed or truncated at 180 characters — and a `null` result means the
student's My Grades screen renders *nothing at all*, with no error.

`0044` exists because of that: it re-matches on the class number paired with the
section its scores were posted into, then **raises** if any class-grade item is
still unlinked. A migration that asserts its own postcondition turns a silent
empty screen into a failed `db push`. Prefer that trade every time.

## 62. Auto-send must be decided against where the deck stands *now*

Reaching an authored checkpoint slide now pushes its question to the class on
its own, so the professor never leaves fullscreen. The trap is that the draw is
a network round-trip: by the time it resolves, the professor may already have
pressed Right Arrow past the checkpoint. Sending then would put a question on
sixty phones for a slide nobody is looking at.

`shouldAutoSendCheckpointQuestion` in `features/live/checkpointState.ts` fails
closed on every one of those: auto-send is off, the class is not live, the draw
came from the manual list or "draw again", a newer draw superseded it, this
checkpoint already sent once, or the deck has moved. `RunClass` feeds it
`liveDeckCheckpoint.current` — a ref reassigned every render — precisely because
the render-time `bridge.checkpoint` captured in the closure is stale by then.

Only the deck's own arrival passes `fromDeckArrival: true`. Never add it to a
retry or to `selectManualCheckpoint`: those are the paths a professor uses when
the automatic one has already gone wrong.

## 63. The professor's polls live in the plan, not in the deck's checkpoint map

Auto-send was first built on `deck.checkpoint_entered` + `drawCheckpointQuestion`.
That path is real but it is not the one Week 1 runs on. An imported lecture has
no checkpoint coverage by design (migration 0036, and pitfall/commit b291572),
so the draw has nothing to draw and the professor never sees a question. Week 1's
deck has exactly five checkpoint slides (15/23/28/40/45) — "Poll 6" is not one of
them. It is checkpoint **position 6 in the class question plan**.

So the poll path that matters is: plan checkpoint `slide_hint` → the slide the
deck reports → `pushPlanQuestion`. Before adding anything to the checkpoint-bank
path, check whether the lecture in front of you actually has coverage.

## 64. A deck reports two different slide numbers, and only one is the professor's

Measured on the Week 1 deck through a postMessage harness: at DOM slide 40 the
deck reports `{ slide: 40, teaching_slide: 37 }`. Teaching numbering skips the
checkpoint slides already passed, so the two drift apart by one per checkpoint
crossed. On a checkpoint slide itself, `teaching_slide` is `null`.

`slide_hint` is hand-typed into "Which slide are you on?", so it is always the
number on the deck's own counter — the DOM position. Matching a hint against
`teaching_slide` as well looks harmless and generous; on this deck it fires poll 6
three slides early. Match the counter, and treat the teaching number only as a
fallback for a deck that reports no counter at all.

Two decks in this course can talk to the platform at all: only
`week-01-lecture` carries the bridge engine. Every deck from week 02 on has no
`postMessage` in it, nothing injects the engine at import or serve time, and so
no poll can send itself there. The plan board says so out loud rather than
leaving the professor waiting for a question that cannot come.

## 65. Most decks are mute, so the cockpit gets its slide from an injected reporter

Measured in the live cockpit: the Week 1 deck the professor actually teaches from
is 54 slides, ~5 MB, and contains **zero** `postMessage` — no `deck.ready`, no
`deck.slide_changed`, no protocol marker. Only `week-01-lecture` in the content
repo carries the bridge engine, and nothing injected it at import or serve time.
Every platform-side feature that needs a slide position was therefore dead on
arrival for his real lectures.

`functions/content.ts` now appends a small reporter to any HTML it serves, via
HTMLRewriter so a 5 MB deck still streams. Two rules keep it safe:

- **It observes, never drives.** No key bindings, no navigation, no class
  mutation, no checkpoint messages. Those belong to the full engine.
- **It stands down when the real engine is present** (`script[data-course-deck-engine]`),
  so generated decks keep reporting their own teaching-slide numbers and
  checkpoints instead of being overwritten with `teaching_slide: null`.

When testing a shim like this by hand, inject it as a real `<script>` element
inside the iframe. Running the same code from the parent's console does not work:
`postMessage` then carries the *parent* as `event.source`, and `useDeckBridge`
correctly rejects anything whose source is not its own iframe. That looks exactly
like a broken feature and cost a debugging cycle.

## 66. Revealing ends a question; closing it takes the answer away

`course-pulse` serves a student only a round that is `open` or `revealed`
(`loadCurrentPulse`). So "reveal the answer and close the question" — the
obvious reading of what a professor wants — destroys the thing he asked for: the
verdict flashes and vanishes before anyone reads it.

Reveal is the end state. It already stops answers (`answer` refuses a round that
is not `open`), and it is what flips the phone from "recorded" to "you were
right". A revealed round retires itself after `revealDisplayMinutes` (3), and the
next push closes whatever is left. Auto-reveal therefore reveals and stops.

## 67. `enrolled` is the roster, not the room

`loadResults` counts `section_enrollments` — 28 students whether nine turned up
or none. Any rule of the form "everyone has answered" measured against it can
never be true, so it silently never fires. `present` (added alongside it, from
`class_attendance`) is the count that matters: only students who scanned in can
answer at all.

Guard the completeness rule with a floor as well. One student checked in, tapping
instantly, satisfies "everyone answered" one second in — and the rest of the room
never sees the question.

## 68. Reset is not delete, and delete is not reset

`delete_class_session_atomic` (0037) removes a class day and **refuses** when it
has pulse activity. `reset_class_session_atomic` (0047) exists for the opposite
need — pulse activity is precisely what it clears — and it keeps the class day,
its lecture, and its question plan.

Order matters inside it: `pulse_rounds.plan_checkpoint_id` is ON DELETE RESTRICT,
so rounds must go before their plan checkpoints are touched. And the checkpoints
are *reset to `planned`*, never deleted: deleting them would throw away the six
polls the professor wrote, which is the one thing he wanted to keep.

## 69. The reveal guard has two halves: the phones and the projector

Auto-reveal (pitfall 66) governs what students see on their phones. It says
nothing about the slide, and the slide is what the room is looking at.

A poll slide carries its own answer as a click-to-reveal fragment —
`.answer-reveal` in the current decks, `.reveal-answer` in the older template —
and a deck engine shows the next hidden fragment on the *first* forward press.
So the three-advance guard protected the platform while one stray press on a
clicker put the correct answer on the projector mid-vote. Verified on the real
deck: one click set `revealed` on the fragment while the round was still open.

The injected reporter now ships a CSS gate the cockpit drives —
`html[data-answer-lock="1"]` hides those two selectors — locked exactly while a
round is `open` and released on reveal. Two things to preserve:

- **`visibility`, not `display`.** The answer keeps its space, so the slide does
  not reflow under the class when it finally appears.
- **Gate, don't fight.** The engine may mark the fragment revealed whenever it
  likes; the gate only refuses to paint it. Racing the engine with a
  MutationObserver that strips `revealed` would loop against its own mutations.

Absent any message the deck is unlocked, so presenting outside a live class is
completely unchanged.

## 70. `enrolled` is the roster, not the room — and completeness needs a floor too

The end-of-class quiz closes itself when everyone has finished. "Everyone"
measured against `section_enrollments` can never be true — the roster carries
every absent student — so the rule silently never fires. `class_attendance`
scoped to `classDateFor()` is the only denominator that means "the people who
can actually answer".

That is the same trap `loadResults` hit for the pulse questions, and it carries
a second half that is easy to miss: **guard the rule with a time floor as
well.** One student checked in and finishing fast satisfies "everyone finished"
seconds in, ending the activity for a room that has barely started.
`autoReveal.ts` encodes `EVERYONE_ANSWERED_FLOOR_MS = 10_000` for the pulse
path; `quiz-close.ts` encodes `EVERYONE_CLOSE_FLOOR_MS = 60_000` for the quiz,
longer because a student tapping through can legitimately finish twelve
questions in well under a minute.

Note this file numbers `## 57` through `## 69` **twice each**. Cite pitfalls by
title, not number.

## 71. A grace window needs a lower bound, and it is the moment the activity actually stopped

`withinSubmitGrace` originally bounded only the upper edge — `now <= endsAt +
60s` — which is trivially true for the whole quiz. Two things broke: the
professor's "Close the quiz" sets `state` but never touches `ends_at`, so
submissions kept landing until the original deadline, minutes later; and
`assertAttemptWithinTimeLimit`'s early return fired from the moment an attempt
started, making the per-attempt limit unreachable.

Adding `now > endsAt` fixed those and broke something worse: a close *before*
`ends_at` then refused every straggler outright, losing every answer they had
already given. The stop time is `min(endsAt, closedAt)`, where `closedAt` is the
instance's `updated_at` **read only when `state === "closed"`** — on a running
row that column is an unrelated edit and would put the stop time in the past.

## 72. Two effects on the same clock tick share one `stateRef` snapshot

`Player.tsx` mirrors live state into a ref so its clock-driven effects read
current values without re-subscribing. That ref is reassigned once per render,
so every effect in the same commit sees the *same* snapshot. When the
per-question auto-advance called `submitNow` — whose `setBusy(true)` is a
deferred state update — the whole-quiz deadline effect ran microseconds later,
still saw `busy: false`, and submitted the same attempt again.

A phone that sleeps throttles the interval, so on unlock `now` jumps past both
deadlines in one tick and the double submit is routine, not exotic. Only a
`useRef` latches synchronously; `busy` cannot. Reset the latch in `catch` only —
a successful submit must stay latched.

## 73. A poll that changes the screen can unmount a component mid-write

`Live.tsx` rendered `<QuizPlayer>` only while `quiz.state === "live"`. The
player auto-submits on its own 1s clock; the 3s poll flips that state to
`closed`. At the deadline they race, and when the poll won the player unmounted
with its interval cleared and **nothing was ever submitted** — no error, no
score, no way for the student or the professor to know.

A component that owns unsaved work must own its own exit. The player now
receives `quizClosed` and reports `onFinished`, and the screen keeps it mounted
for a started-but-unfinished instance regardless of what the poll says.

## 74. Pausing a class pauses its quiz, and resuming never un-paused it

`updateSessionState` sets `activity_instances.state = 'paused'` on pause with no
mirror on resume. That asymmetry was survivable only because a paused quiz used
to be closed by its own timer, which quietly healed it. Narrowing
`decideQuizClose` to `CLOSABLE_STATES = ["open","live"]` — correct, a quiz must
not expire while the room is stopped — turned the leak permanent: the instance
never reaches `closed`, and `Live.tsx` gates the exit ticket on exactly that, so
**no student in the class reaches the reflection for the rest of the session.**

The resume mirror filters `.in("state", ["paused"])` on purpose. The
`closed → continued → live` reopen path drives this same code on a session whose
instances are already `closed`; without the filter, reopening an ended class
would revive a finished, graded quiz for answers.

## 75. A verifier that hardcodes `../mzareei.github.io` passes here and fails in CI

The backend repo sits beside this one on the development machine, so
`../mzareei.github.io` resolves locally and every check runs. CI clones it to a
path of its own choosing and announces that path in
`COURSE_PLATFORM_BACKEND_ROOT`. A verifier that ignores the variable fails in
one of two ways, and the quiet one is worse:

- `verify-class-reset` read the migration with no existence check and died on
  `ENOENT`, **turning every push to main red from 2026-08-11 onward.**
- `verify-quiz-timing`, `verify-quiz-podium`, `verify-quiz-auto-close`,
  `verify-auto-posted-grades` and `verify-live-attendance-count` guarded the
  same wrong path with `existsSync` and printed "backend repo not checked out,
  skipping". CI *had* checked it out. Five verifiers reported success without
  running — including every server-side quiz contract.

`tools/lib/backend-root.mjs` is now the only place that answers "where is the
backend". A verifier that needs it calls `backendPath` / `backendUrl` and, when
it may legitimately be absent, `skipWithoutBackend` — which prints the root it
looked in, so a skip that should not have happened is visible in the log.

## 76. A prompt that points at a reference file inherits the reference's gaps

Step 1's prompt (2026-08-17) no longer describes the slide markup. It hands the
model a reference deck and says *reproduce this presentation system*. That is a
better prompt — it carries the whole visual language, presenter controls,
overlays and media policy in one attachment instead of pages of prose — but it
moves the contract out of the text and into a file, and a design file does not
know it is a contract.

The five markers the platform reads off a Pulse Check slide are invisible.
`class="slide activity"`, the `Pulse check` / `Pregunta rapida` badge, four
`.choice` buttons, `answer-reveal fragment correct`, `data-pause-id` and
`data-pause-topic-en/es` change nothing on the projector. A deck that loses them
looks perfect in the room and produces a bank with zero `pulse` questions, so
Create plan builds a class that never stops and nobody finds out until the
lecture is running.

Three consequences worth holding onto:

- **State the markers in the prompt AND carry them in the reference file.**
  Either alone fails: prose without an example gets paraphrased away, an example
  without prose gets rewritten. `verify-content-import` checks both, together,
  and that pairing is the point.
- **`public/TC2007B_Presentation_Style_Reference.html` is a contract artifact,
  not documentation.** Editing its Pulse Check slide changes every deck
  generated afterwards. Treat it like source.
- **The reference is offered as a download, never a link.** Served under the
  app's own CSP its inline presenter engine is blocked, so a professor who
  clicks through to it sees a dead page and reasonably concludes the reference
  is broken. This is pitfall #2 wearing different clothes: deck HTML never
  renders under the app's CSP.

A prompt swap is not a text edit. Diff what the old prompt *guaranteed* against
what the new one guarantees, and treat every dropped guarantee as a decision to
make out loud — see the identity clause dropped in the same change, recorded in
`docs/prompts/README.md` and asserted, deliberately, in the verifier.

## 85. A Teach screen that filters by section on its own will drift

Every screen scoped by the instructor/admin switcher (2026-08-15) narrows
through `src/features/scope/filters.ts`, and `tools/verify-scope-filter.mjs`
fails the build the day a screen stops importing it. Three things to hold onto
here:

- **A screen must not write its own section filter.** The moment one does,
  it and `filters.ts` are two copies of the same rule, and they will disagree
  the first time either one changes.
- **`activeSectionId === null` means *all groups*, not *no group*.** It must
  always return the rows untouched. A filter that treats `null` as "nothing
  matches" silently empties the admin view — the one mode that is supposed to
  show everything.
- **`model.ts` and `filters.ts` may never import Preact, i18n, or
  `localStorage`.** A Node verifier imports both directly to self-test them
  against real data; either import breaks that verifier's ability to run at
  all, not just its assertions.

---

## 86. "Defaults to the student's own section" is wrong the moment they have two

**Reported by the professor on 2026-08-18**, from a full run-through of a test
class in 501: slides, live questions, timers, leaderboard all fine — then
**Submit reflection** answered *Class session is not available for this section.*

`course-exit-ticket` took the section from the request, and when the phone
didn't send one (it never does), from `sections[0]` — the first active student
enrollment that happened to come back from the database. It then checked that
the class session belonged to *that* section. His test account is enrolled in
401 **and** 501; the first row was 401; the class was in 501; the check failed.
Every real student is in exactly one section, so nobody in class had ever hit
it — which is exactly why it survived until the professor tested with an
account that isn't shaped like a student.

**Fix:** when a `class_session_id` is given, the *session* decides the section.
Load the session by id + course, take its `section_id`, and only then confirm
the student is enrolled there. The caller-supplied / first-enrollment fallback
is now used solely for tickets with no class session at all.

**Rule:** if the request names a class session, an activity instance, or any
other section-owned object, resolve the section *from that object* and check
enrollment against it. Never pick "the student's section" first and then test
the object against it — for anyone with more than one enrollment (test
accounts, TAs, a student who transferred groups mid-term) the pick is a coin
flip. `course-portfolio-entry` still uses `sections[0]`, but nothing it accepts
is section-owned, so it is fine as long as that stays true.
