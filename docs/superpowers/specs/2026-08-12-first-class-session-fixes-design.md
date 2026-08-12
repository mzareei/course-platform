# First live-class session fixes — design

**Date:** 2026-08-12
**Origin:** the professor's report after the first real class with students
(2026-08-11/12). Six problems, reported in his own words, all reproduced or
traced to a specific line before this document was written.

Nothing here is speculative. Each section names the code that causes the
symptom.

---

## 1. Every student hit a rate limit on "Send"

**Reported:** *"when I asked them to scan the QR code and join the class with
their email address, all of them told me they see this rate limit problem when
they click on sign in… just now I tried and it's actually working for me."*

### Cause

Not a bug — a configuration ceiling. The Supabase project still uses the
**built-in email service**, which is capped at a couple of messages per hour
project-wide and is documented by Supabase as suitable for testing only. Thirty
students pressing **Send** inside the same minute means the first one or two
receive a message and every other request is refused.

It worked for the professor afterwards because the room had emptied and the
hourly window had reset.

This is already known inside the codebase.
`supabase/functions/course-test-signin/index.ts` opens with: *"issues a session
for a rostered address without sending a verification email, so the course team
can test without hitting Supabase's built-in SMTP rate limit."* Test sign-in was
built to dodge this exact limit, and is what the class ended up using.

A second contributor is possible but unconfirmed: the whole room shares one
campus NAT address, and some Supabase auth endpoints are rate-limited per IP
independently of email. This must be re-checked after SMTP is in place rather
than assumed away.

### Fix

**Configuration (professor, with written steps):** enable a custom SMTP provider
in Supabase → Authentication → SMTP Settings, then raise Authentication → Rate
Limits → *Rate limit for sending emails* from the built-in default to ~300/hour.

**Provider recommendation: Brevo.** Resend — named in the original discussion —
requires a verified DNS domain, and the professor does not control DNS for
`tec.mx`. Brevo's free tier allows 300 emails/day and verifies a **single sender
address** (`m.zareei@tec.mx`, or the personal Gmail) with no domain ownership
required. Gmail SMTP with an app password is a documented second choice. Both
procedures get written; the professor chooses.

**Code:** `src/screens/SignIn.tsx` detects a 429 / rate-limit response and
renders a bilingual, actionable message with the wait time instead of surfacing
Supabase's raw English error string. It also reveals the verification-code field
on that failure, so a student whose email *did* arrive is not blocked behind a
classmate's refusal.

### Closing the test-sign-in door

The professor decided (2026-08-12) to **close it once email is confirmed
working**, not before — his classes must stay runnable if SMTP is not ready by
the next class day.

So: set `config.testSignIn` to `false` and clear `COURSE_TEST_SIGNIN_UNTIL`
**after** a real student inbox has received a real sign-in code, and not as part
of the same change that configures SMTP. Until then, anyone who knows a rostered
address can sign in as that student and their grades hang off that account —
which is why this is a tracked step with a trigger, not a someday-item.

---

## 2. "This class is for another group" until they refreshed

**Reported:** *"sometimes when they get into their course, it was saying this
course is blocked in other group, and they had to refresh a couple of times to
see the actual… okay, the class is ongoing, watch the lecture."*

The string is `join.access.title` — *"This class is for another group"* — shown
when `course-session-join` returns 403.

### Cause

A race between two calls that both run at sign-in.

`src/screens/student/JoinClass.tsx` fires `resolveJoinCode(code)` from a
`useEffect` the moment `session.value` becomes truthy. That effect does not wait
for `refreshContext()`.

`course-session-join`'s `loadActiveProfile` requires a profile row that is
**already linked** (`auth_user_id` matches) and **already** `status = 'active'`.
It has no claim path of its own; it throws 403 *"No active course profile is
linked to this account."* otherwise.

The only code that links an auth user to a rostered profile, and promotes
`invited → active`, is `loadOrClaimProfile` in `course-auth-context`.

So on a **first-ever sign-in** — every student, day one — the join request
arrives before the profile has ever been claimed, and is refused with a message
about groups that has nothing to do with the real cause. Reloading boots the app,
which runs `course-auth-context` first and claims the profile; the next attempt
then succeeds. That is precisely "they had to refresh a couple of times."

This is pitfall #71's shape again: an error message that names the wrong cause,
so nobody can guess the real one from what they see.

### Fix

**Server (authoritative half):** extract `loadOrClaimProfile` from
`course-auth-context/index.ts` into `_shared/`, and call it from
`course-session-join`'s `loadActiveProfile`. A first-ever sign-in then claims its
profile at the join, exactly as it would have at the auth-context call.

Every existing guard is preserved and none is weakened:

- `assertCourseEmailAllowed` on the auth email
- `assertProfileMatchesAuthEmail` on the resolved profile
- roster-profile lookup restricted to `status in ('invited','active')`
- the real `section_enrollments` check against `session.section_id` with
  `role = 'student'` and `status = 'active'`

The 403 remains reachable — it just becomes truthful. A student genuinely in
another group still gets it.

**Client (latency half):** `JoinClass` waits for `context.value` to be non-null
before calling `resolveJoinCode`, and retries once after an explicit
`refreshContext()` if the first attempt returns 403. Both halves ship: the server
fix makes it correct, the client fix makes it correct on a stale bundle too.

### Verification

Test through the real entry point (rule #1): a rostered student who has **never**
signed in, scanning the QR from a clean browser profile, must reach `/live`
without a manual reload. A student rostered in a different group must still see
the "another group" card.

---

## 3. "The class is live" but they could not get in

**Reported:** *"sometimes they get into their tutoring and they see the class is
live, but when you click on it, you cannot get into it… they would close that
tab, and then I show them the QR code, but they don't end up in that part — they
see the class is live but they cannot see the question."*

### Cause

Two things stacked.

**There is no way back in, by design.** `src/screens/student/Today.tsx` carries an
explicit comment: no join button, because the scan **is** the attendance record
and a button would let a student "attend" from anywhere. Correct as a rule — but
it also means a student who *already scanned* and then closed the tab has no
route back to `/live` except rescanning. The live card is not clickable, which is
exactly the "you click on it and cannot get into it" complaint.

**And rescanning could fail** for the reason in section 2, on the first day when
no student had a claimed profile yet.

The server already knows who scanned in: `course-pulse`'s student view returns
`checked_in`, and `class_attendance` holds the row. But
`course-auth-context`'s `loadStudentSessions` does not carry that fact, so Today
cannot tell the difference between a student who scanned and one who did not.

### Fix

**Server:** `loadStudentSessions` gains a `checked_in: boolean` per session, read
from `class_attendance` for the returned sessions in one query. Field name matches
the one `course-pulse` already returns, so the two agree (pitfall #3).

**Client:** Today renders a **Return to class** button on a live or paused session
**only when `checked_in` is true**. Every other student sees the existing scan
card, unchanged.

The attendance rule survives intact: the button is reachable only by someone
whose scan is already recorded, so it can never manufacture an attendance the
room did not see. The button navigates to `/live`; it writes nothing.

New strings in EN + ES pairs in `src/i18n/strings.ts` (rule #4).

---

## 4. Fullscreen closed itself during the lecture

**Reported:** *"sometimes when I was in full screen during the presentation, the
full screen would be closed automatically, and then I had to come back to my
laptop and click again."*

### Cause

`src/features/deck/InstructorDeck.tsx` re-mints the deck's content token on a
timer and assigns the result to the iframe's `src`:

```
schedule(expectedGeneration, access.expires_in - 60);
```

`course-content-access` mints with `SIGNED_URL_SECONDS = 600`, so this fires
every **540 seconds — nine minutes**. Assigning a new `src` reloads the iframe
document, and the browser exits fullscreen the moment the fullscreen element is
destroyed. On a two-hour lecture that is a dozen unexplained fullscreen drops.

The refresh buys nothing while the deck is up. `functions/content.ts` serves the
deck as **one self-contained HTML document**; the token gates that single fetch
and is never used again by the loaded document.

### Fix

Keep minting on the timer — the token must be fresh for a *real* reload — but
stop force-feeding it to the iframe.

- Hold the newly minted URL in a `pendingSource` ref instead of calling
  `setSource` unconditionally.
- Apply it to the iframe only when the frame genuinely needs to (re)load: first
  mount, `contentItemId` change, manual retry, or recovery from a refresh
  failure.
- **Never** apply it while `document.fullscreenElement` is set. A
  `fullscreenchange` listener applies any held source once the professor leaves
  fullscreen himself.
- Preserve pitfall #32's behaviour in full: the replacement URL still carries the
  last known slide as a hash, so a genuine reload returns to the current slide
  rather than slide 1; a failed mint still keeps the existing document visible
  with a bilingual warning rather than blanking the projector.

### Verification

Enter fullscreen on a live deck and stay there past the twelve-minute mark. The
deck must not reload and fullscreen must not drop. Then exit fullscreen and
confirm the held token is applied without losing the slide.

---

## 5. The previous question, with "Continue with the class", waiting on exit

**Reported:** *"when it jumps out of the full screen, I see this previous
question that I did in my page and it has this button that continue with the
class."*

### Cause

After a poll is revealed, `CheckpointPanel` stays in its `revealed` branch, which
renders the question, the result bars, and a **Continue with the class** button
(`run.checkpoint.continue`). It is retired only by `continueCheckpoint()`.

Automatically, `continueCheckpoint()` has exactly one trigger, in `RunClass.tsx`:

```
if (isLive && previous && !current) void continueCheckpoint(true, previous);
```

— `bridge.checkpoint` going from set to null, which happens when the deck reports
it resumed past an authored checkpoint. **Only a deck carrying the full engine
sends checkpoint messages.** Imported lectures — every lecture after Week 1, by
design under migration 0036 — carry only the slide-reporter shim injected by
`functions/content.ts`, which reports position and nothing else. `bridge.checkpoint`
is permanently null for them, so `previous` is never set and the panel is never
retired.

Plan-driven polls (`ClassQuestionPlanBoard` → `planAutoAsk`) are exactly the path
those decks use. So the panel holds the last question until the professor clicks,
and the first time he sees it is when fullscreen drops.

### Fix

A revealed round retires itself. Two triggers, either sufficient:

1. **The professor moved on** — he advanced past the poll slide *after* the
   reveal. This reuses the machinery `autoRevealReason` already relies on:
   `previousRevealSlide` / `countAdvance` / `advancesSinceAsked`, restarted at the
   moment of reveal. It deliberately does **not** key off the round's
   `checkpoint_after_slide`, which is always null for a plan-driven round —
   `course-pulse` treats `plan_checkpoint_id` and `checkpoint_after_slide` as
   mutually exclusive, so `activeCheckpoint` is null on exactly the path this
   fixes.
2. **The reveal window elapsed** — reusing the same reveal-display window the
   students' phones already honour (`revealDisplayMinutes`, pitfall #8), so the
   cockpit and the phones stop showing the question at the same moment instead of
   disagreeing.

The symmetry is the point: the cockpit already ends a question by itself when the
professor plainly moved on (that is what auto-reveal does). This applies the same
judgement one step later, to the reveal.

Retiring runs the existing `continueCheckpoint` path, so it closes the round
server-side and returns the panel to `idle`. It is guarded by
`checkpointLifecycleSequence` exactly as the manual path is, so a late reply
cannot resurrect a retired round (pitfall #33), and `checkpointContinueInFlight`
prevents a double close.

The manual **Continue** button stays. This adds an automatic path; it removes no
control.

---

## 6. Pausing a class instead of ending it

**Requested:** *"when I don't get to finish the class, it would be good to have
this option of pausing the class, not ending it. When it's paused it's not shown
in the review, and it's not concluded, so it can be resumed in the next
session."*

### What already exists

The backend supports this today. `course-session-management` declares:

```
live:   ["paused", "closed"],
paused: ["live", "continued", "closed"],
```

and `updateSessionState` already pauses the session's `activity_instances` when
moving to `paused`. Only `closed` runs `close_class_session_with_review`, which
is what creates the review release and posts the grade — so **a paused class is
already absent from Review and already ungraded**. Exactly the requested
semantics, with no schema or RPC work.

`course-pulse`'s student view (`current`) does not require `live`; it returns
`session_state` and works normally against a paused session. Only `pushRound`
requires `live`, which is correct: no new questions go out while paused.

The SPA simply never exposes any of it.

### Fix

**Instructor:** `src/api/session.ts` gains `pauseClassSession()` and
`resumeClassSession()`. Run Class shows **Pause class** beside End class while
live, and **Resume class** on the pre-live panel when the session is `paused`.

Before pausing, any open or revealed pulse round is closed — the same courtesy
`onEndClass` already performs — so no phone is left holding a question nobody
will ever reveal.

**Student:** `Today.tsx` currently treats `paused` as live
(`["live","paused"].includes(session.state)`), so a paused class would announce
itself as live. Split them: `paused` gets its own bilingual "class paused"
treatment and does **not** claim to be live.

`Live.tsx` reads the `session_state` the poll already returns and, when it is
`paused`, renders a **"Class paused — stay on this screen"** card while
continuing to poll. When the professor resumes, students land back in the
question flow with nothing to tap. This ranks above the waiting branch and below
the `checked_in` gate, matching the existing branch order.

**Attendance is per day; engagement and grading stay per class.** The professor
was explicit (2026-08-12): *"attendance can be day based not class based… you can
keep track of the class if they were present during the class, and then the date
too… also the engagement you calculate should be based on the class, not date…
maybe today I finish half way and the next class I finish the remaining half and
also a new class."*

Three consequences, and only the first needs schema work:

1. **`class_attendance` needs a date.** Its unique constraint is today
   `(class_session_id, profile_id)` — one row per student per class, which
   cannot express "present on both days". A new migration adds a stored
   `attendance_date` (the local class date of `checked_in_at`) and moves the
   constraint to `(class_session_id, profile_id, attendance_date)`. The existing
   "first scan wins" behaviour is preserved *within* a day, so a re-scan after a
   page reload still keeps the true arrival time; a scan on a later day creates a
   second row rather than being discarded. Students therefore rescan the QR on
   the resumed day — that scan is precisely what records presence for that day.
   Backfill sets `attendance_date` from each existing row's `checked_in_at`, so
   no historical row changes meaning.

2. **Grading and engagement are already per class** — every score,
   participation event, and grade row keys on `class_session_id`, which a pause
   does not change. Nothing to do; verified rather than assumed.

3. **One day can hold two sessions.** A resumed half and a brand-new lecture may
   both belong to the same date. `selectLiveSessionId` /
   `firstLiveSessionId` in `src/features/join/sessionState.ts` currently take the
   first session whose state is `live` **or** `paused`, ordered by planned date —
   which would hand a student the older paused session while the new lecture is
   the one actually running. Prefer `live` over `paused`, falling back to
   `paused` only when nothing is live. The stored joined-session id still wins
   over both, so a student who scanned into a specific class stays in it.

New strings in EN + ES pairs.

### Verification

Pause a live class: the open question closes, students see the paused card, Run
Class offers Resume, and the class appears in neither Review nor the gradebook.
Resume it: students return to the question flow without rescanning, and a poll
can be pushed again.

---

## Out of scope

Rehearsal reset, grading, the end-of-class quiz, the reflection, and the
generation pipeline. None of the six reports trace to any of them.

## Sequencing

Work spans both repos. `course-auth-context` and `course-session-join` change
together with a shared helper, and edge functions do not deploy on push — they
need `npx supabase functions deploy <name>` from `mzareei.github.io`. No new
migration is required by any of the six fixes, so pitfall #39's
migration-before-function ordering does not bind here; if that changes during
implementation, it applies.

`docs/05-status.md` and `docs/07-pitfalls.md` get updated in the same commits as
the work, per CLAUDE.md.
