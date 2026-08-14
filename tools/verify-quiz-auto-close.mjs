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
import { existsSync, readFileSync } from "node:fs";

// readFileSync resolves against the working directory; import() resolves
// against this module's URL in tools/, one level deeper. Two helpers on
// purpose — confusing them silently imports the wrong folder.
const fn = (name) => `../mzareei.github.io/supabase/functions/${name}`;
const backend = (name) =>
  new URL(`../../mzareei.github.io/supabase/functions/${name}`, import.meta.url);

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

if (!existsSync(fn("_shared"))) {
  console.log("verify-quiz-auto-close: backend repo not checked out, skipping");
  process.exit(0);
}

const {
  OPEN_INSTANCE_STATES, SUBMITTED_STATUSES, GRACE_SECONDS, EVERYONE_CLOSE_FLOOR_MS,
  decideQuizClose, closeReasonFor, withinSubmitGrace
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

assert.deepEqual(
  [...SUBMITTED_STATUSES].sort(),
  ["late", "submitted"],
  "a late attempt counts as finished — it is graded work"
);
assert.ok(
  OPEN_INSTANCE_STATES.includes("live") && !OPEN_INSTANCE_STATES.includes("closed"),
  "the open states match the ones course-class-quiz already reuses"
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

if (failures.length) {
  console.error("quiz auto-close verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-quiz-auto-close: OK");
