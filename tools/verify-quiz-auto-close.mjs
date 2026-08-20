// The end-of-class quiz used to stay open until the professor remembered to
// close it. It now closes itself when the clock runs out or when every student
// who checked in today has submitted.
//
// Two traps live in here:
//
// 1. The denominator is CHECK-INS, not the roster. section_enrollments counts
//    every absent student, so "everyone has finished" is unreachable against
//    it — the same mistake pitfall "`enrolled` is the roster, not the room"
//    (docs/07-pitfalls.md) records for the pulse questions.
//
// 2. Closing at the deadline used to REJECT a submission arriving a second
//    later, losing every answer a student had given. Invisible and generous,
//    nobody hit it; visible and tight, they will.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backendPath, backendUrl, skipWithoutBackend } from "./lib/backend-root.mjs";

// readFileSync takes a path; import() takes a URL. Two helpers on purpose —
// both anchored on the backend root, which CI puts somewhere of its own.
const fn = (name) => backendPath(`supabase/functions/${name}`);
const backend = (name) => backendUrl(`supabase/functions/${name}`);

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

if (skipWithoutBackend("verify-quiz-auto-close")) process.exit(0);

const {
  OPEN_INSTANCE_STATES, CLOSABLE_STATES, SUBMITTED_STATUSES, GRACE_SECONDS,
  EVERYONE_CLOSE_FLOOR_MS, decideQuizClose, closeReasonFor, withinSubmitGrace
} = await import(backend("_shared/quiz-close.ts").href);

const at = (iso) => new Date(iso);
const T0 = "2026-08-14T18:00:00.000Z";
const T_END = "2026-08-14T18:10:00.000Z";

const base = {
  state: "live",
  // Ten minutes before T0 — far past EVERYONE_CLOSE_FLOOR_MS by the time any
  // existing assertion below evaluates "everyone", so the floor added in this
  // round never changes what those assertions mean.
  startsAt: "2026-08-14T17:50:00.000Z",
  endsAt: T_END,
  presentCount: 18,
  submittedCount: 3,
  now: at(T0)
};

// ------------------------------------------------------------ nothing to do
assert.equal(decideQuizClose(base), null, "a running quiz mid-flight stays open");
assert.equal(
  decideQuizClose({ ...base, state: "closed", submittedCount: 18 }),
  null,
  "an already-closed quiz is never closed twice"
);

// ---------------------------------------------------------------- the timer
assert.equal(
  decideQuizClose({ ...base, now: at(T_END) }),
  "time",
  "the quiz closes the instant the deadline is reached"
);
assert.equal(
  decideQuizClose({ ...base, now: at("2026-08-14T18:09:59.000Z") }),
  null,
  "one second before the deadline it is still open"
);
assert.equal(
  decideQuizClose({ ...base, endsAt: null, now: at("2030-01-01T00:00:00.000Z") }),
  null,
  "an instance with no deadline never closes on time"
);

// ------------------------------------------------------------- everyone done
assert.equal(
  decideQuizClose({ ...base, submittedCount: 18 }),
  "everyone",
  "the quiz closes when every checked-in student has submitted"
);
assert.equal(
  decideQuizClose({ ...base, submittedCount: 17 }),
  null,
  "one student still working holds the quiz open"
);
assert.equal(
  decideQuizClose({ ...base, submittedCount: 19 }),
  "everyone",
  "more submissions than check-ins still counts as everyone"
);

// THE trap. An empty room must not read as "everyone has finished" and close
// the quiz the moment the professor starts it.
assert.equal(
  decideQuizClose({ ...base, presentCount: 0, submittedCount: 0 }),
  null,
  "nobody checked in must never mean everybody finished"
);

// Both conditions at once reads better as the happy one.
assert.equal(
  decideQuizClose({ ...base, submittedCount: 18, now: at(T_END) }),
  "everyone",
  "when the room finishes exactly as time runs out, say everyone finished"
);

// ---------------------------------------------------- the completeness floor
// A count-only rule closes an almost-empty room the moment the professor
// starts it, if a couple of quick students submit before the rest have even
// checked in. The pulse questions hit this exact bug (docs/07-pitfalls.md,
// "`enrolled` is the roster, not the room": "guard the completeness rule with
// a floor as well") and fixed it with a floor; the quiz needs the same one.
assert.equal(EVERYONE_CLOSE_FLOOR_MS, 60_000, "the floor is sixty seconds");

assert.equal(
  decideQuizClose({
    ...base,
    startsAt: "2026-08-14T17:59:30.000Z", // opened 30s before "now"
    submittedCount: 18,
    now: at(T0)
  }),
  null,
  "a room that finishes inside the floor stays open"
);
assert.equal(
  decideQuizClose({
    ...base,
    startsAt: "2026-08-14T17:58:30.000Z", // opened 90s before "now"
    submittedCount: 18,
    now: at(T0)
  }),
  "everyone",
  "the same room past the floor closes"
);
assert.equal(
  decideQuizClose({
    ...base,
    startsAt: null,
    submittedCount: 18,
    now: at(T0)
  }),
  "everyone",
  "a null start time never blocks the everyone branch"
);
assert.equal(
  decideQuizClose({
    ...base,
    startsAt: "2026-08-14T18:09:45.000Z", // opened 15s before the deadline
    submittedCount: 18,
    now: at(T_END)
  }),
  "time",
  "the deadline still closes regardless of the floor"
);

assert.equal(
  closeReasonFor({ presentCount: 18, submittedCount: 18 }),
  "everyone",
  "a closed quiz where everyone submitted reports 'everyone'"
);
assert.equal(
  closeReasonFor({ presentCount: 18, submittedCount: 11 }),
  "time",
  "a closed quiz with stragglers reports 'time'"
);

// ------------------------------------------------------------- submit grace
assert.equal(GRACE_SECONDS, 60, "the grace is the spec's sixty seconds");
assert.equal(
  withinSubmitGrace({ endsAt: T_END, startedAt: T0, now: at("2026-08-14T18:10:30.000Z") }),
  true,
  "a submission thirty seconds late is still accepted"
);
// The lower bound. A grace is a window AFTER a deadline; without this the
// function is true for the whole quiz, so a manual "Close it now" would keep
// taking submissions until ends_at and the per-attempt limit would never fire.
assert.equal(
  withinSubmitGrace({ endsAt: T_END, startedAt: T0, now: at("2026-08-14T18:05:00.000Z") }),
  false,
  "there is no grace before the deadline — that window is the quiz itself"
);
assert.equal(
  withinSubmitGrace({ endsAt: T_END, startedAt: T0, now: at(T_END) }),
  false,
  "at the deadline exactly the quiz is still open on its own terms, not on grace"
);
assert.equal(
  withinSubmitGrace({ endsAt: T_END, startedAt: T0, now: at("2026-08-14T18:11:30.000Z") }),
  false,
  "a submission ninety seconds late is outside the grace"
);
assert.equal(
  withinSubmitGrace({
    endsAt: T_END,
    startedAt: "2026-08-14T18:10:20.000Z",
    now: at("2026-08-14T18:10:30.000Z")
  }),
  false,
  "the grace finishes work already begun; it never lets a new attempt start late"
);
assert.equal(
  withinSubmitGrace({ endsAt: null, startedAt: T0, now: at(T_END) }),
  false,
  "no deadline means no grace to be inside of"
);

// ------------------------------------------- the grace after a MANUAL close
// A quiz can stop before ends_at — the professor pressing "Close the quiz" is
// the ordinary way. Keying the grace to ends_at alone gave those students no
// grace whatsoever: refused with "Activity is closed." and every answer they
// had given thrown away. The stop time is the EARLIER of ends_at and the moment
// the instance was closed.
const T_CLOSE = "2026-08-14T18:04:00.000Z"; // six minutes before T_END

assert.equal(
  withinSubmitGrace({
    endsAt: T_END,
    closedAt: T_CLOSE,
    startedAt: T0,
    now: at("2026-08-14T18:04:30.000Z")
  }),
  true,
  "a manual close before the deadline still takes a submission thirty seconds later"
);
// The property the lower bound was added to protect, and the reason this cannot
// simply fall back to ends_at: a manual close must stop taking submissions
// within sixty seconds, not at 18:10 when the original clock would have run out.
assert.equal(
  withinSubmitGrace({
    endsAt: T_END,
    closedAt: T_CLOSE,
    startedAt: T0,
    now: at("2026-08-14T18:05:30.000Z")
  }),
  false,
  "ninety seconds after a manual close is outside the grace — the close stops it, not ends_at"
);
assert.equal(
  withinSubmitGrace({
    endsAt: T_END,
    closedAt: T_CLOSE,
    startedAt: "2026-08-14T18:04:20.000Z", // opened the quiz after it was closed
    now: at("2026-08-14T18:04:30.000Z")
  }),
  false,
  "an attempt started after the close gets nothing — the grace finishes work already begun"
);
assert.equal(
  withinSubmitGrace({
    endsAt: T_END,
    closedAt: T_CLOSE,
    startedAt: T0,
    now: at("2026-08-14T18:03:59.000Z")
  }),
  false,
  "before the close there is no grace — the quiz is still open on its own terms"
);
// A close that lands a moment AFTER the deadline (the auto-close firing late)
// must not push the window out past the deadline it fired for.
assert.equal(
  withinSubmitGrace({
    endsAt: T_END,
    closedAt: "2026-08-14T18:10:02.000Z",
    startedAt: T0,
    now: at("2026-08-14T18:11:30.000Z")
  }),
  false,
  "a close after the deadline never extends the window — ends_at stays the ceiling"
);
assert.equal(
  withinSubmitGrace({ endsAt: T_END, closedAt: null, startedAt: T0, now: at("2026-08-14T18:10:30.000Z") }),
  true,
  "no close time means the deadline is the stop time, exactly as before"
);

assert.deepEqual(
  [...SUBMITTED_STATUSES].sort(),
  ["late", "submitted"],
  "a late attempt counts as finished — it is graded work"
);
assert.ok(
  OPEN_INSTANCE_STATES.includes("live") && !OPEN_INSTANCE_STATES.includes("closed"),
  "the open states match the ones course-class-quiz already reuses"
);

// --------------------------------------------- a paused quiz has no clock
// Pausing the class sets every running instance to `paused`, and the resume path
// does not put it back. `paused` is in OPEN_INSTANCE_STATES because there it
// means "not finished", which is right — but a timer must never close a quiz
// while the room is stopped. It fired from any student's poll, so a five-minute
// pause ended the quiz and lost every answer in progress with nobody pressing
// anything.
assert.ok(
  OPEN_INSTANCE_STATES.includes("paused"),
  "paused still counts as not-finished for the callers that mean that"
);
assert.ok(
  !CLOSABLE_STATES.includes("paused"),
  "a paused quiz is not closable — the clock is not running while the room is stopped"
);
assert.ok(
  CLOSABLE_STATES.includes("open") && CLOSABLE_STATES.includes("live"),
  "a running quiz is still closable"
);
assert.equal(
  decideQuizClose({ ...base, state: "paused", now: at(T_END) }),
  null,
  "a paused instance past its deadline is NOT closed"
);
assert.equal(
  decideQuizClose({ ...base, state: "paused", now: at("2026-08-14T19:00:00.000Z") }),
  null,
  "and it stays open however long the pause runs"
);
assert.equal(
  decideQuizClose({ ...base, state: "paused", submittedCount: 18 }),
  null,
  "not even everyone-has-submitted closes a quiz while the class is paused"
);

// ------------------------------------------------ resuming undoes the pause
// Pausing sets every running instance to `paused`; until now nothing set it
// back. `paused` is not in CLOSABLE_STATES (asserted above), so without a
// resume branch the instance stayed `paused` forever — never reaching
// `closed` — and Live.tsx gates the exit ticket on quiz.state === "closed",
// stranding the whole room for the rest of the class after any pause that
// touched a running quiz. The filter matters as much as the state: reviving
// a `closed` instance on resume would reopen a finished quiz for answers.
const sessionManagement = readFileSync(fn("course-session-management/index.ts"), "utf8");
check(
  /if \(input\.nextState === "live"\) \{[\s\S]{0,250}state: "live"[\s\S]{0,250}\.in\(\s*"state",\s*\[\s*"paused"\s*\]\s*\)/.test(
    sessionManagement
  ),
  "resuming a class must move activity instances back to live, filtered to only the ones a pause put to sleep"
);

// ------------------------------------------------------ both polls close it
// Whichever poll arrives first does the closing, so a reloaded or backgrounded
// Run Class page cannot hold the quiz open.
const classQuiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");
const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
const closeSource = readFileSync(fn("_shared/quiz-close.ts"), "utf8");

check(
  /quiz-close\.ts/.test(classQuiz) && /maybeAutoCloseInstance/.test(classQuiz),
  "the instructor poll must run the auto-close check"
);
check(
  /quiz-close\.ts/.test(pulse) && /maybeAutoCloseInstance/.test(pulse),
  "the student poll must run the auto-close check too"
);
check(
  /maybeAutoCloseInstance\([\s\S]{0,500}classDateFor/.test(classQuiz),
  "the instructor poll must hand the check today's class date"
);
check(
  /maybeAutoCloseInstance\([\s\S]{0,500}classDateFor/.test(pulse),
  "the student poll must hand the check today's class date"
);

// The denominator lives in the shared module, so that is where to assert it.
check(
  /class_attendance/.test(closeSource) && /attendance_date/.test(closeSource),
  "the completeness denominator must be today's check-ins"
);
check(
  !/from\(["']section_enrollments["']\)/.test(closeSource),
  "the roster must never reach the completeness check — an absent student would make 'everyone finished' unreachable"
);
check(
  /withinSubmitGrace/.test(attempt),
  "the submit path must honour the sixty-second grace"
);
check(
  /"late"/.test(attempt),
  "a submission inside the grace must be stored as late, not rejected"
);

// The pure rule above is only worth having if the callers actually hand it the
// close time. Without updated_at in the SELECT, closedAt is silently undefined
// and every manual close is back to no grace at all.
check(
  /\.select\("id, activity_template_id[^"]*updated_at/.test(attempt),
  "loadActivityInstance must SELECT updated_at — the grace cannot see the stop time without it"
);
check(
  (attempt.match(/closedAt:/g) || []).length >= 2,
  "both the submit gate and the per-attempt time limit must pass the close time"
);
check(
  /String\(instance\.state\) !== "closed"[\s\S]{0,120}return null/.test(attempt),
  "updated_at may only be read as a stop time on a CLOSED instance — on a running one it is an unrelated edit"
);
check(
  /CLOSABLE_STATES/.test(closeSource) && /decideQuizClose[\s\S]{0,400}CLOSABLE_STATES/.test(closeSource),
  "decideQuizClose must gate on CLOSABLE_STATES, not on the not-finished list"
);

// ------------------------------------------- the player owns the handoff
// The class poll is what flips the state to closed, and it raced the player's
// own auto-submit clock. When the poll won, Live.tsx unmounted the player
// mid-submit and the attempt was never sent — no error, no rank, no quiz mark.
// The player must be TOLD the quiz closed and must be the one to say it is done.
const player = readFileSync("src/features/quiz/Player.tsx", "utf8");
const live = readFileSync("src/screens/student/Live.tsx", "utf8");

check(
  /quizClosed/.test(player) && /onFinished/.test(player),
  "the player must take the close as a prop and report when it is finished"
);
check(
  /quizClosed=\{/.test(live) && /onFinished=\{/.test(live),
  "Live must hand the player the close and listen for the finish"
);
check(
  // Since the 2026-08-20 kick incident the hold is its own arm ABOVE the
  // gates: a started-but-unfinished player keeps the screen through the
  // close, poll errors, and everything else, until it reports done.
  /quizUnfinished/.test(live) && /heldQuizId[\s\S]{0,600}?<QuizPlayer/.test(live),
  "Live must keep the player mounted for a STARTED-BUT-UNFINISHED instance, not only while the state still says live"
);
check(
  /if \(!quizClosed\) return;[\s\S]{0,900}?submitNow\(/.test(player),
  "a closed quiz must make the player submit straight away, not wait for its own clock tick"
);
check(
  /if \(!quizClosed\) return;[\s\S]{0,900}?submitting\.current/.test(player),
  "the close-driven submit must go through the SAME latch as the deadline one — two latches race each other"
);

if (failures.length) {
  console.error("quiz auto-close verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-quiz-auto-close: OK");
