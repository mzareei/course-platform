# End-of-class quiz timer and podium — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the end-of-class quiz a visible total countdown, a 30-second floor per question, two automatic closing conditions, a place shown to every student, and a top-3 podium with opt-in name reveal.

**Architecture:** Three new pure modules in the backend's `_shared/` hold the rules (question timing, close decision, ranking) so both edge functions and the Node verifiers can execute them. The edge functions do the database work and call the pure rules. The frontend holds no timing or ranking constants of its own — the server stamps every question with its own `seconds` and every student with their own rank.

**Tech Stack:** Deno edge functions (Supabase), Preact + TypeScript SPA (Vite), Postgres migrations, Node `.mjs` verifier scripts as the test suite.

**Spec:** `docs/superpowers/specs/2026-08-14-end-of-class-quiz-timer-and-podium-design.md`

## Global Constraints

- **Two repos.** Frontend is `~/Documents/GitHub/course-platform` (this repo). Backend is `~/Documents/GitHub/mzareei.github.io`, holding `supabase/functions/` and `supabase/migrations/`. Most tasks commit in **both**; each task says which.
- **NOTHING DEPLOYS AND NOTHING IS PUSHED UNTIL TASK 14.** There is one Supabase project and no staging, so every `functions deploy` and `db push` changes live class software the moment it runs. The professor decided all of it lands in a single pass at the end. Tasks 1–13 commit locally only. If a task's text ever seems to ask you to deploy, push, or run a migration, it is wrong — do not.
- **Edge functions do not deploy on git push** (Cloudflare Pages builds the frontend; the functions never ship that way). Task 14 deploys them explicitly with `npx supabase functions deploy <name>` from the backend repo, and applies migrations with `npx supabase db push`.
- **Both repos work directly on `main`,** by the professor's decision. Commit freely; never push.
- **Supabase project ref:** `ojmbupftdikwmlqvibwt`.
- **Every user-facing string is EN + ES**, added in pairs to `src/i18n/strings.ts`. `tools/verify-i18n.mjs` enforces it.
- **The browser never queries a table.** RLS is on with zero policies; edge functions are the only door.
- **Read the actual `return json({...})`** in an edge function before trusting a TypeScript interface. Cross-service field-name mismatches are invisible to the compiler and have shipped several times.
- **The professor never writes quiz questions.** Nothing in this plan adds authoring.
- **Tests are verifier scripts.** `npm run verify` runs every `tools/verify-*.mjs`. A single one: `node tools/verify-<name>.mjs`. Exit 0 = pass. There is no unit-test runner and none is being added.
- **Node 26 imports `.ts` directly**, so verifiers can `await import()` a Deno-free `_shared` module and test real behavior. Modules under test in this plan import nothing from `client.ts` or `Deno` — keep them pure so this stays true.
- **`npm run build`** (typecheck + vite build) must pass before the final task is done.
- Never render deck HTML with `srcdoc` or `blob:`.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

### Backend — `~/Documents/GitHub/mzareei.github.io`

| File | Responsibility |
|---|---|
| `supabase/functions/_shared/question-timing.ts` | **New, pure.** How many seconds one question gets, and what a whole quiz should total. |
| `supabase/functions/_shared/quiz-close.ts` | **New, pure + one db helper.** Whether a running quiz should close now, and why. |
| `supabase/functions/_shared/quiz-rank.ts` | **New, pure.** Turning attempts into places, and places into a podium. |
| `supabase/migrations/0053_quiz_name_reveal.sql` | **New.** The `name_revealed` column. |
| `supabase/functions/course-class-quiz/index.ts` | Derived total at start; `present`/`closed_reason` in status; auto-close; new `podium` action. |
| `supabase/functions/course-activity-attempt/index.ts` | Per-question `seconds`; the 60s submit grace; new `set_name_reveal` action. |
| `supabase/functions/course-pulse/index.ts` | Auto-close on the student poll; `my_rank` in the quiz block. |

### Frontend — `~/Documents/GitHub/course-platform`

| File | Responsibility |
|---|---|
| `tools/verify-quiz-timing.mjs` | **New test.** Executes the timing rule; asserts the client holds no copy of it. |
| `tools/verify-quiz-auto-close.mjs` | **New test.** Executes the close decision; asserts both polls call it and the grace exists. |
| `tools/verify-quiz-podium.mjs` | **New test.** Executes ranking; asserts names are withheld server-side. |
| `src/features/quiz/Player.tsx` | Uses the server's `seconds`; submits at the instance deadline. |
| `src/features/quiz/clock.ts` | **New.** `M:SS` formatting, shared by the phone's clock and the professor's countdown. |
| `src/features/quiz/Podium.tsx` | **New.** Renders a top-3 list. Used by the box and the room layer. |
| `src/features/quiz/RankBanner.tsx` | **New.** One student's place, medal, and reveal button. |
| `src/features/live/ClassroomPodiumLayer.tsx` | **New.** Fullscreen podium for the room, mirroring `ClassroomQuestionLayer`. |
| `src/screens/instructor/EndOfClass.tsx` | Countdown, checked-in count, close reason, podium, fullscreen control. |
| `src/screens/student/Live.tsx` | `RankBanner` above the reflection and on the done screen. |
| `src/api/quiz.ts`, `src/api/pulse.ts` | Types and call wrappers. |
| `src/i18n/strings.ts` | New strings, EN + ES pairs. |
| `src/styles/app.css` | Podium and rank-banner styles. |

---

## Task 1: The question timing rule

**Files:**
- Create: `~/Documents/GitHub/mzareei.github.io/supabase/functions/_shared/question-timing.ts`
- Test: `~/Documents/GitHub/course-platform/tools/verify-quiz-timing.mjs` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `BASE_SECONDS = 30`, `LONG_SECONDS = 45`, `LONG_THRESHOLD_CHARS = 320`, `CUSHION_SECONDS = 120`, `MIN_TOTAL_SECONDS = 60`, `MAX_TOTAL_SECONDS = 3600`
  - `interface TimedQuestion { prompt?: string | null; prompt_es?: string | null; options?: Array<{ option_text?: string | null; option_text_es?: string | null }> | null }`
  - `readingLoad(question: TimedQuestion): number`
  - `secondsForQuestion(question: TimedQuestion): number`
  - `estimateTotalSeconds(pool: TimedQuestion[], questionCount: number): number`

- [ ] **Step 1: Write the failing test**

Create `tools/verify-quiz-timing.mjs` in the **frontend** repo:

```javascript
// The end-of-class quiz used to give an easy question 20 seconds. A room of
// second-language readers cannot read a prompt, four options and decide in 20
// seconds, so the floor is now 30 and only genuinely long questions get 45.
//
// The rule lives in the backend and is executed here rather than grepped: a
// threshold is a number, and a number that is never run is a number nobody
// checked. The client must hold no copy of it — the two repos deploy
// independently, so a duplicated constant drifts silently.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// readFileSync resolves against the working directory (the repo root, the way
// every other verifier reads src/…). import() resolves against THIS MODULE's
// URL, which is tools/ — one level deeper. Two helpers, deliberately, because
// getting them confused silently imports the wrong folder.
const fn = (name) => `../mzareei.github.io/supabase/functions/${name}`;
const backend = (name) =>
  new URL(`../../mzareei.github.io/supabase/functions/${name}`, import.meta.url);

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

// ------------------------------------------------------------------- the rule
if (!existsSync(fn("_shared"))) {
  console.log("verify-quiz-timing: backend repo not checked out, skipping");
  process.exit(0);
}

const {
  BASE_SECONDS, LONG_SECONDS, LONG_THRESHOLD_CHARS, CUSHION_SECONDS,
  MIN_TOTAL_SECONDS, MAX_TOTAL_SECONDS,
  readingLoad, secondsForQuestion, estimateTotalSeconds
} = await import(backend("_shared/question-timing.ts").href);

const q = (prompt, options = [], extra = {}) => ({
  prompt,
  options: options.map((option_text) => ({ option_text })),
  ...extra
});

// The floor. This is the whole point of the change.
assert.equal(BASE_SECONDS, 30, "no question may be given fewer than 30 seconds");
assert.equal(LONG_SECONDS, 45, "the long-question ceiling is 45 seconds");
assert.equal(
  secondsForQuestion(q("What is a firewall?", ["A wall", "A filter", "A door", "A log"])),
  30,
  "a short question gets the 30-second base"
);
assert.equal(
  secondsForQuestion(q("x".repeat(400), ["a", "b", "c", "d"])),
  45,
  "a question past the reading threshold gets 45 seconds"
);
assert.equal(
  secondsForQuestion(q("x".repeat(100), ["y".repeat(80), "y".repeat(80), "y".repeat(80), "y".repeat(80)])),
  45,
  "options count toward reading load, not just the prompt"
);
assert.equal(
  secondsForQuestion(q("", [])),
  30,
  "an empty question still gets the base, never zero"
);

// Spanish is measured too, and the longer language wins. Spanish renders
// 15-20% longer than English; a borderline question read in Spanish must not
// get less time than the rule intends.
assert.equal(
  secondsForQuestion({
    prompt: "x".repeat(100),
    prompt_es: "y".repeat(400),
    options: []
  }),
  45,
  "a question that is long only in Spanish still gets 45 seconds"
);
assert.equal(
  readingLoad({ prompt: "abc", prompt_es: null, options: [{ option_text: "de" }] }),
  5,
  "reading load is prompt plus every option, in characters"
);

// Missing/odd shapes must not throw — this runs on live class data.
assert.equal(secondsForQuestion({}), 30, "a question with no fields gets the base");
assert.equal(secondsForQuestion({ prompt: null, options: null }), 30, "nulls are tolerated");

// --------------------------------------------------------------- the total
// Worst case, not average. The all-finished trigger means the countdown is a
// backstop, so an over-generous total costs nothing while a tight one cuts a
// student off mid-question. The asymmetry is entirely one-sided.
const shortQ = q("short", ["a", "b"]);
const longQ = q("x".repeat(400), ["a", "b"]);

assert.equal(
  estimateTotalSeconds([shortQ, shortQ, shortQ, shortQ], 4),
  4 * 30 + CUSHION_SECONDS,
  "an all-short quiz totals the base times the count, plus the cushion"
);
assert.equal(
  estimateTotalSeconds([longQ, longQ, longQ, longQ], 4),
  4 * 45 + CUSHION_SECONDS,
  "an all-long quiz totals the ceiling times the count, plus the cushion"
);
assert.equal(
  estimateTotalSeconds([shortQ, shortQ, longQ, longQ], 2),
  2 * 45 + CUSHION_SECONDS,
  "a mixed pool is sized for the student who draws the LONGEST questions"
);
assert.equal(
  estimateTotalSeconds([shortQ, longQ], 5),
  30 + 45 + CUSHION_SECONDS,
  "asking for more questions than the pool holds sizes to the pool"
);
assert.equal(
  estimateTotalSeconds([], 10),
  MIN_TOTAL_SECONDS,
  "an empty pool clamps to the floor rather than returning the bare cushion"
);
assert.equal(
  estimateTotalSeconds(Array.from({ length: 200 }, () => longQ), 200),
  MAX_TOTAL_SECONDS,
  "an absurd quiz clamps to the one-hour ceiling"
);
assert.equal(CUSHION_SECONDS, 120, "the cushion is the professor's two minutes");

// ------------------------------------------------------ no second copy of it
// The server stamps each question with its own `seconds`; the player reads that
// field. A constant table in the client is the drift this prevents.
const player = readFileSync("src/features/quiz/Player.tsx", "utf8");
check(
  !/SECONDS_BY_DIFFICULTY/.test(player),
  "the client must not keep a difficulty-to-seconds table"
);
check(
  !/\b(20|30|45)\s*\*\s*1000/.test(player),
  "the client must not compute a question deadline from a literal number of seconds"
);
check(
  /question\.seconds|current\.seconds|\.seconds\b/.test(player),
  "the player must take each question's time from the server's `seconds` field"
);

// The two callers must both go through the shared rule.
const classQuiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
check(
  /question-timing\.ts/.test(classQuiz) && /estimateTotalSeconds/.test(classQuiz),
  "course-class-quiz must size the instance with the shared estimate"
);
check(
  /question-timing\.ts/.test(attempt) && /secondsForQuestion/.test(attempt),
  "course-activity-attempt must stamp each question with the shared rule"
);
check(
  !/defaultTimeLimitSeconds\s*=\s*600/.test(classQuiz),
  "the flat 10-minute default must be gone, not merely unused"
);

if (failures.length) {
  console.error("quiz timing verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-quiz-timing: OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/verify-quiz-timing.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `question-timing.ts`.

- [ ] **Step 3: Write the module**

Create `supabase/functions/_shared/question-timing.ts` in the **backend** repo:

```typescript
// How long one quiz question is worth, and how long a whole quiz should run.
//
// The old table gave an easy question 20 seconds. A room reading its second
// language cannot take in a prompt, four options and a decision in 20 seconds,
// and the professor watched them run out. The floor is 30; only a genuinely
// long question earns 45.
//
// Length, not the generator's difficulty tag, decides. A hard question can be
// one line ("Which of these is NOT symmetric?") and an easy one can be a
// paragraph of scenario — the tag measures how hard it is to answer, and this
// measures how long it takes to READ. Reading is what runs out the clock.
//
// Pure on purpose: no Deno, no database, no imports. Both edge functions call
// it, and the Node verifier in the frontend repo imports and executes it.

export const BASE_SECONDS = 30;
export const LONG_SECONDS = 45;
/** Prompt + options, in characters, past which a question is "long". */
export const LONG_THRESHOLD_CHARS = 320;
/** Slack on the whole quiz for the student whose phone was slow to open it. */
export const CUSHION_SECONDS = 120;
export const MIN_TOTAL_SECONDS = 60;
export const MAX_TOTAL_SECONDS = 3600;

export interface TimedQuestion {
  prompt?: string | null;
  prompt_es?: string | null;
  options?: Array<{ option_text?: string | null; option_text_es?: string | null }> | null;
}

function lengthOf(value: unknown): number {
  return typeof value === "string" ? value.length : 0;
}

/**
 * Characters a student has to read to answer, in whichever language reads
 * longer. Spanish runs 15-20% longer than English, so measuring only English
 * would quietly give the Spanish reader of a borderline question less time
 * than the rule intends.
 */
export function readingLoad(question: TimedQuestion): number {
  const options = Array.isArray(question?.options) ? question.options : [];
  const english = lengthOf(question?.prompt)
    + options.reduce((sum, option) => sum + lengthOf(option?.option_text), 0);
  const spanish = lengthOf(question?.prompt_es)
    + options.reduce((sum, option) => sum + lengthOf(option?.option_text_es), 0);
  return Math.max(english, spanish);
}

export function secondsForQuestion(question: TimedQuestion): number {
  return readingLoad(question) > LONG_THRESHOLD_CHARS ? LONG_SECONDS : BASE_SECONDS;
}

/**
 * What to put on the clock for a quiz of `questionCount` questions drawn from
 * `pool`.
 *
 * Sized for the WORST case — the student who happens to draw every long
 * question — not the average. The quiz also closes the moment every student
 * present has submitted, so in a normal class the clock never runs out at all
 * and an over-generous total costs nothing. An under-generous one cuts a
 * student off mid-question. The asymmetry only points one way.
 */
export function estimateTotalSeconds(pool: TimedQuestion[], questionCount: number): number {
  const questions = Array.isArray(pool) ? pool : [];
  const count = Math.max(0, Math.floor(Number(questionCount) || 0));
  const longest = questions
    .map(secondsForQuestion)
    .sort((a, b) => b - a)
    .slice(0, count || questions.length);
  const total = longest.reduce((sum, seconds) => sum + seconds, 0) + CUSHION_SECONDS;
  return Math.min(MAX_TOTAL_SECONDS, Math.max(MIN_TOTAL_SECONDS, total));
}
```

- [ ] **Step 4: Run test to verify the rule passes**

Run: `node tools/verify-quiz-timing.mjs`
Expected: still FAIL, but now only on the `check(...)` list at the end — "the client must not keep a difficulty-to-seconds table", "course-class-quiz must size the instance…". Every `assert` above must pass. Those `check` failures are Tasks 5, 7 and 10; leave them failing.

If any `assert` throws, the module is wrong — fix it before moving on.

- [ ] **Step 5: Commit (backend)**

```bash
cd ~/Documents/GitHub/mzareei.github.io
git add supabase/functions/_shared/question-timing.ts
git commit -m "$(cat <<'EOF'
Add the shared question timing rule: 30s floor, 45s for long questions

Length decides, not the difficulty tag: a hard question can be one line and
an easy one a paragraph of scenario. Reading is what runs out the clock.
Measured in whichever language reads longer so a Spanish reader of a
borderline question is not quietly given less time.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Commit (frontend)**

```bash
cd ~/Documents/GitHub/course-platform
git add tools/verify-quiz-timing.mjs
git commit -m "$(cat <<'EOF'
Verify the question timing rule by executing it

A threshold is a number, and a number that is never run is a number nobody
checked. The verifier imports the backend rule and runs it, rather than
grepping for the constant.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The auto-close decision

**Files:**
- Create: `~/Documents/GitHub/mzareei.github.io/supabase/functions/_shared/quiz-close.ts`
- Test: `~/Documents/GitHub/course-platform/tools/verify-quiz-auto-close.mjs` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `OPEN_INSTANCE_STATES = ["open", "live", "paused"]`
  - `SUBMITTED_STATUSES = ["submitted", "late"]`
  - `GRACE_SECONDS = 60`
  - `type QuizCloseReason = "time" | "everyone"`
  - `EVERYONE_CLOSE_FLOOR_MS = 60_000`
  - `decideQuizClose(input: { state: string; startsAt: string | null; endsAt: string | null; presentCount: number; submittedCount: number; now: Date }): QuizCloseReason | null`
  - `closeReasonFor(input: { presentCount: number; submittedCount: number }): QuizCloseReason`
  - `withinSubmitGrace(input: { endsAt: string | null; startedAt: string | null; now: Date }): boolean`

- [ ] **Step 1: Write the failing test**

Create `tools/verify-quiz-auto-close.mjs` in the **frontend** repo:

```javascript
// The end-of-class quiz used to stay open until the professor remembered to
// close it. It now closes itself when the clock runs out or when every student
// who checked in today has submitted.
//
// Two traps live in here:
//
// 1. The denominator is CHECK-INS, not the roster. section_enrollments counts
//    every absent student, so "everyone has finished" is unreachable against
//    it — the same mistake recorded in docs/07-pitfalls.md under
//    "`enrolled` is the roster, not the room". (Cited by title: the numbering
//    in that file collides — ## 57 through ## 69 each appear twice.)
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
  OPEN_INSTANCE_STATES, SUBMITTED_STATUSES, GRACE_SECONDS,
  decideQuizClose, closeReasonFor, withinSubmitGrace
} = await import(backend("_shared/quiz-close.ts").href);

const at = (iso) => new Date(iso);
const T0 = "2026-08-14T18:00:00.000Z";
const T_END = "2026-08-14T18:10:00.000Z";

const base = {
  state: "live",
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
  !/section_enrollments/.test(closeSource),
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/verify-quiz-auto-close.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `quiz-close.ts`.

- [ ] **Step 3: Write the module**

Create `supabase/functions/_shared/quiz-close.ts` in the **backend** repo:

```typescript
// When a running end-of-class quiz should close itself, and why.
//
// The professor used to close it by hand, which meant it stayed open while he
// was answering a question at the front of the room. Two conditions end it
// now: the clock runs out, or everyone who is actually in the room has
// submitted.
//
// The completeness denominator is CHECK-INS, never the roster.
// section_enrollments includes every absent student, so "everyone has
// finished" would be unreachable against it — the same mistake recorded for
// the pulse questions, recorded in docs/07-pitfalls.md as "`enrolled` is the
// roster, not the room". That entry carries a second rule this module also
// obeys: guard completeness with a floor, or one student tapping instantly
// ends the activity for everyone still working.
//
// The decision is pure so it can be executed by the verifier; the one function
// that touches the database is kept at the bottom and does no deciding.

export const OPEN_INSTANCE_STATES = ["open", "live", "paused"];
export const SUBMITTED_STATUSES = ["submitted", "late"];
/** How long after the deadline a submission already in progress is still taken. */
export const GRACE_SECONDS = 60;

export type QuizCloseReason = "time" | "everyone";

function millis(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Which of the two conditions ended a quiz that is already closed. Derived
 * rather than stored: it drives one line of text on the professor's screen and
 * nothing later depends on it, so it does not earn a column.
 */
export function closeReasonFor(
  input: { presentCount: number; submittedCount: number }
): QuizCloseReason {
  const present = Math.max(0, Number(input?.presentCount) || 0);
  const submitted = Math.max(0, Number(input?.submittedCount) || 0);
  return present > 0 && submitted >= present ? "everyone" : "time";
}

/** The reason to close this instance right now, or null to leave it running. */
export function decideQuizClose(input: {
  state: string;
  endsAt: string | null;
  presentCount: number;
  submittedCount: number;
  now: Date;
}): QuizCloseReason | null {
  if (!OPEN_INSTANCE_STATES.includes(String(input?.state))) return null;

  const present = Math.max(0, Number(input?.presentCount) || 0);
  const submitted = Math.max(0, Number(input?.submittedCount) || 0);

  // Checked first so a room that finishes exactly as the clock expires is told
  // the true and kinder reason. An EMPTY room must never read as a finished
  // one — without the `present > 0` guard the quiz would close in the same
  // second the professor started it.
  if (present > 0 && submitted >= present) return "everyone";

  const endsAt = millis(input?.endsAt);
  const now = input?.now instanceof Date ? input.now.getTime() : Date.now();
  if (endsAt !== null && now >= endsAt) return "time";

  return null;
}

/**
 * Whether a submission arriving after the deadline is still taken.
 *
 * The instance closes exactly at `ends_at` so student screens move on to the
 * exit ticket without waiting. This grace lives in the submit path alone: work
 * already begun gets finished, but `started_at` after the deadline means the
 * attempt was never legitimately open and gets no grace at all.
 */
export function withinSubmitGrace(input: {
  endsAt: string | null;
  startedAt: string | null;
  now: Date;
}): boolean {
  const endsAt = millis(input?.endsAt);
  if (endsAt === null) return false;
  const startedAt = millis(input?.startedAt);
  if (startedAt === null || startedAt >= endsAt) return false;
  const now = input?.now instanceof Date ? input.now.getTime() : Date.now();
  // A grace exists only AFTER a deadline. Without this lower bound the function
  // is true for the whole quiz window, and two things break: the professor's
  // "Close it now" keeps accepting submissions until ends_at (closeQuiz sets
  // state but never touches ends_at), and the per-attempt time limit becomes
  // unreachable because its early-return fires from the moment an attempt
  // starts.
  if (now <= endsAt) return false;
  return now <= endsAt + GRACE_SECONDS * 1000;
}

/**
 * Counts the room and the submissions, decides, and writes the close.
 *
 * Called from BOTH polls — the instructor's status poll and every student's
 * live poll — so whichever arrives first ends the quiz. A professor whose
 * laptop is asleep, or whose Run Class tab was reloaded, does not hold a quiz
 * open over a room that has finished.
 *
 * Returns the instance state as it now stands plus the counts, so callers can
 * report them without querying again.
 */
export async function maybeAutoCloseInstance(
  // deno-lint-ignore no-explicit-any
  db: any,
  instance: { id: string; state: string; starts_at: string | null; ends_at: string | null; class_session_id: string | null },
  classDateFor: () => string
): Promise<{ state: string; present: number; submitted: number; closed_reason: QuizCloseReason | null }> {
  const [{ count: present }, { data: attempts, error }] = await Promise.all([
    instance.class_session_id
      ? db.from("class_attendance").select("id", { count: "exact", head: true })
          .eq("class_session_id", instance.class_session_id)
          .eq("attendance_date", classDateFor())
      : Promise.resolve({ count: 0 }),
    db.from("student_attempts").select("id, status").eq("activity_instance_id", instance.id)
  ]);
  if (error) throw error;

  const submitted = (attempts || [])
    .filter((row: { status: string }) => SUBMITTED_STATUSES.includes(String(row.status)))
    .length;
  const presentCount = present ?? 0;

  const reason = decideQuizClose({
    state: String(instance.state),
    endsAt: instance.ends_at,
    presentCount,
    submittedCount: submitted,
    now: new Date()
  });

  if (!reason) {
    return {
      state: String(instance.state),
      present: presentCount,
      submitted,
      closed_reason: OPEN_INSTANCE_STATES.includes(String(instance.state))
        ? null
        : closeReasonFor({ presentCount, submittedCount: submitted })
    };
  }

  const { error: updateError } = await db
    .from("activity_instances")
    .update({ state: "closed", updated_at: new Date().toISOString() })
    .eq("id", instance.id)
    .in("state", OPEN_INSTANCE_STATES);
  if (updateError) throw updateError;

  return { state: "closed", present: presentCount, submitted, closed_reason: reason };
}
```

Note the `.in("state", OPEN_INSTANCE_STATES)` on the update: two polls landing in the same instant both decide to close, and this makes the second one a no-op rather than a second write.

- [ ] **Step 4: Run test to verify the rule passes**

Run: `node tools/verify-quiz-auto-close.mjs`
Expected: still FAIL, but only on the trailing `check(...)` list (Tasks 5, 7, 9). Every `assert` must pass.

- [ ] **Step 5: Commit (backend)**

```bash
cd ~/Documents/GitHub/mzareei.github.io
git add supabase/functions/_shared/quiz-close.ts
git commit -m "$(cat <<'EOF'
Add the shared quiz auto-close decision

Closes on the deadline, or when every student who checked in today has
submitted. The denominator is check-ins, never the roster: an absent student
would otherwise make "everyone has finished" unreachable, the same mistake
docs/07-pitfalls.md records under
"`enrolled` is the roster, not the room".

An empty room must not read as a finished one, so the everyone-branch is
guarded on present > 0 — without it the quiz would close in the same second
the professor started it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Commit (frontend)**

```bash
cd ~/Documents/GitHub/course-platform
git add tools/verify-quiz-auto-close.mjs
git commit -m "$(cat <<'EOF'
Verify the quiz auto-close decision by executing it

Pins the two traps: an empty room must never read as a finished one, and a
submission arriving a second after the deadline must be graded, not thrown
away.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The ranking rule

**Files:**
- Create: `~/Documents/GitHub/mzareei.github.io/supabase/functions/_shared/quiz-rank.ts`
- Test: `~/Documents/GitHub/course-platform/tools/verify-quiz-podium.mjs` (create)

**Interfaces:**
- Consumes: `SUBMITTED_STATUSES` from `_shared/quiz-close.ts` (Task 2).
- Produces:
  - `PODIUM_PLACES = 3`
  - `interface RankableAttempt { profile_id: string; status: string; score_final: number | null; submitted_at: string | null }`
  - `interface RankedAttempt extends RankableAttempt { rank: number }`
  - `rankAttempts(attempts: RankableAttempt[]): RankedAttempt[]`
  - `podiumCut(ranked: RankedAttempt[], places?: number): RankedAttempt[]`
  - `rankOf(ranked: RankedAttempt[], profileId: string): { rank: number; of: number; is_top3: boolean } | null`

- [ ] **Step 1: Write the failing test**

Create `tools/verify-quiz-podium.mjs` in the **frontend** repo:

```javascript
// After the quiz closes, every student sees their place and the top three go
// on the professor's podium by student ID.
//
// The rule that matters most here is the one about names: a student's real
// name is WITHHELD BY THE SERVER unless they opted in. Sending the name and
// hiding it in the client would put every classmate's name in a response any
// student's phone can read.
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
  console.log("verify-quiz-podium: backend repo not checked out, skipping");
  process.exit(0);
}

const { PODIUM_PLACES, rankAttempts, podiumCut, rankOf } =
  await import(backend("_shared/quiz-rank.ts").href);

const a = (profile_id, score_final, submitted_at, status = "submitted") =>
  ({ profile_id, score_final, submitted_at, status });

const T = (m) => `2026-08-14T18:${String(m).padStart(2, "0")}:00.000Z`;

// ------------------------------------------------------------------ ordering
const ranked = rankAttempts([
  a("c", 70, T(3)),
  a("a", 95, T(5)),
  a("b", 88, T(2))
]);
assert.deepEqual(
  ranked.map((r) => [r.profile_id, r.rank]),
  [["a", 1], ["b", 2], ["c", 3]],
  "highest score_final first, regardless of who submitted earliest"
);

// score_final already folds in the speed bonus, so faster-and-correct wins on
// its own. submitted_at only orders WITHIN a shared place.
const tied = rankAttempts([a("late", 90, T(9)), a("early", 90, T(1)), a("third", 50, T(2))]);
assert.deepEqual(
  tied.map((r) => [r.profile_id, r.rank]),
  [["early", 1], ["late", 1], ["third", 3]],
  "equal scores share a place, and the next student's number skips past them"
);

// --------------------------------------------------------- who gets ranked
const mixed = rankAttempts([
  a("finished", 80, T(4)),
  a("abandoned", null, null, "started"),
  a("was_late", 60, T(9), "late")
]);
assert.deepEqual(
  mixed.map((r) => r.profile_id),
  ["finished", "was_late"],
  "only submitted and late attempts are ranked"
);
assert.equal(
  mixed.length,
  2,
  "a student who opened the quiz and abandoned it is not ranked last, they are not ranked"
);
assert.deepEqual(
  rankAttempts([a("x", null, T(1))]).map((r) => r.rank),
  [1],
  "a submitted attempt with no score yet still holds a place"
);
assert.deepEqual(rankAttempts([]), [], "no submissions rank nobody");

// ------------------------------------------------------------------- podium
assert.equal(PODIUM_PLACES, 3, "the podium is a top three");
assert.deepEqual(
  podiumCut(rankAttempts([a("a", 90, T(1)), a("b", 80, T(1)), a("c", 70, T(1)), a("d", 60, T(1))]))
    .map((r) => r.profile_id),
  ["a", "b", "c"],
  "the podium takes the first three places"
);
assert.deepEqual(
  podiumCut(rankAttempts([a("a", 90, T(1)), a("b", 80, T(1))])).map((r) => r.profile_id),
  ["a", "b"],
  "two submissions make a two-place podium, not an empty slot"
);
assert.deepEqual(podiumCut(rankAttempts([])), [], "an empty quiz has an empty podium");

// A tie spanning third place shows everyone holding it. Truncating to exactly
// three would drop a student who earned the same score as the one shown.
assert.deepEqual(
  podiumCut(rankAttempts([
    a("a", 90, T(1)), a("b", 80, T(1)), a("c", 70, T(1)), a("d", 70, T(2)), a("e", 60, T(1))
  ])).map((r) => r.profile_id),
  ["a", "b", "c", "d"],
  "a tie for third puts four students on the podium"
);

// -------------------------------------------------------------- one student
const board = rankAttempts([a("a", 90, T(1)), a("b", 80, T(1)), a("c", 70, T(1)), a("d", 60, T(1))]);
assert.deepEqual(
  rankOf(board, "c"),
  { rank: 3, of: 4, is_top3: true },
  "a student's own place counts only the students who finished"
);
assert.deepEqual(
  rankOf(board, "d"),
  { rank: 4, of: 4, is_top3: false },
  "fourth place is not on the podium"
);
assert.equal(rankOf(board, "nobody"), null, "a student who did not submit has no place");

// ------------------------------------------------- the server withholds names
const classQuiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");

check(
  /quiz-rank\.ts/.test(classQuiz) && /podiumCut/.test(classQuiz),
  "the podium action must use the shared ranking rule"
);
check(
  /quiz-rank\.ts/.test(pulse) && /rankOf/.test(pulse),
  "the student's own place must use the same rule, not a second one"
);
check(
  /name_revealed\s*\?/.test(classQuiz) || /name_revealed[\s\S]{0,120}:\s*null/.test(classQuiz),
  "the podium must send a name ONLY when that student opted in"
);
check(
  /set_name_reveal/.test(attempt),
  "students need an action to opt in"
);
// Deliberately not a bare token match. `/podiumCut|top 3|PODIUM_PLACES/` would
// pass on an unused import or a stray comment while the actual refusal was
// missing — and the thing being gated is a privacy control: without it any
// student can flip their own name onto the screen at the front of the room.
// Match the refusal itself, following a real podiumCut call.
check(
  /podiumCut\([\s\S]{0,400}?throw new Error\("Only the top three can be named on the podium\./.test(attempt),
  "set_name_reveal must REFUSE a caller who is not on the podium, after a real podiumCut — not merely mention one"
);
check(
  /throw new Error\("The quiz is still running\./.test(attempt),
  "set_name_reveal must refuse while the quiz is still running"
);

// The client must not be the thing hiding a name.
const podium = existsSync("src/features/quiz/Podium.tsx")
  ? readFileSync("src/features/quiz/Podium.tsx", "utf8")
  : "";
check(podium.length > 0, "src/features/quiz/Podium.tsx must exist");
check(
  !/full_name|preferred_name/.test(podium),
  "the client must never receive a full name to decide about"
);

if (failures.length) {
  console.error("quiz podium verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-quiz-podium: OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/verify-quiz-podium.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `quiz-rank.ts`.

- [ ] **Step 3: Write the module**

Create `supabase/functions/_shared/quiz-rank.ts` in the **backend** repo:

```typescript
// Turning finished quiz attempts into places.
//
// Ranked on score_final, which already folds in the speed bonus — so a faster
// correct answer wins on its own and no separate tiebreak rule is needed.
// submitted_at only orders students WITHIN a shared place, so the display is
// stable rather than arbitrary.
//
// Only finished work is ranked. A student who opened the quiz and abandoned it
// is not ranked last — they are not ranked at all, and the "of 24" a student
// reads is the number of people who actually finished.
//
// Pure: no Deno, no database. The verifier imports and executes it.
import { SUBMITTED_STATUSES } from "./quiz-close.ts";

export const PODIUM_PLACES = 3;

export interface RankableAttempt {
  profile_id: string;
  status: string;
  score_final: number | null;
  submitted_at: string | null;
}

export interface RankedAttempt extends RankableAttempt {
  rank: number;
}

function scoreOf(attempt: RankableAttempt): number {
  return Number(attempt?.score_final ?? 0) || 0;
}

function submittedMillis(attempt: RankableAttempt): number {
  const parsed = attempt?.submitted_at ? new Date(attempt.submitted_at).getTime() : NaN;
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

/** Finished attempts, best first, with equal scores sharing a place. */
export function rankAttempts(attempts: RankableAttempt[]): RankedAttempt[] {
  const finished = (Array.isArray(attempts) ? attempts : [])
    .filter((attempt) => SUBMITTED_STATUSES.includes(String(attempt?.status)));

  const sorted = [...finished].sort((left, right) => {
    const byScore = scoreOf(right) - scoreOf(left);
    if (byScore !== 0) return byScore;
    return submittedMillis(left) - submittedMillis(right);
  });

  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((attempt, index) => {
    const score = scoreOf(attempt);
    // Standard competition ranking: two students at #2 are followed by #4, so
    // the number a student reads is genuinely "how many did better".
    if (lastScore === null || score !== lastScore) {
      lastRank = index + 1;
      lastScore = score;
    }
    return { ...attempt, rank: lastRank };
  });
}

/**
 * The podium.
 *
 * Everyone holding a place inside the cut, which means a tie spanning third
 * puts four students on it. Truncating to exactly three would silently drop a
 * student who earned the same score as the one being celebrated.
 */
export function podiumCut(ranked: RankedAttempt[], places = PODIUM_PLACES): RankedAttempt[] {
  return (Array.isArray(ranked) ? ranked : []).filter((entry) => entry.rank <= places);
}

/** One student's own place, or null if they did not finish. */
export function rankOf(
  ranked: RankedAttempt[],
  profileId: string
): { rank: number; of: number; is_top3: boolean } | null {
  const rows = Array.isArray(ranked) ? ranked : [];
  const mine = rows.find((entry) => String(entry.profile_id) === String(profileId));
  if (!mine) return null;
  return { rank: mine.rank, of: rows.length, is_top3: mine.rank <= PODIUM_PLACES };
}
```

- [ ] **Step 4: Run test to verify the rule passes**

Run: `node tools/verify-quiz-podium.mjs`
Expected: still FAIL, but only on the trailing `check(...)` list (Tasks 6, 8, 9, 12). Every `assert` must pass.

- [ ] **Step 5: Commit (backend)**

```bash
cd ~/Documents/GitHub/mzareei.github.io
git add supabase/functions/_shared/quiz-rank.ts
git commit -m "$(cat <<'EOF'
Add the shared quiz ranking rule

Ranked on score_final, which already folds in the speed bonus, so a faster
correct answer wins without a separate tiebreak. Equal scores share a place
and a tie spanning third puts four students on the podium — truncating to
exactly three would drop a student who earned the same score as the one
being celebrated.

Only finished attempts are ranked, so a student who abandoned the quiz is
not ranked last; they are not ranked at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Commit (frontend)**

```bash
cd ~/Documents/GitHub/course-platform
git add tools/verify-quiz-podium.mjs
git commit -m "$(cat <<'EOF'
Verify the quiz ranking rule and the name-withholding boundary

The rule that matters most: a real name is withheld by the SERVER unless the
student opted in. Sending it and hiding it in the client would put every
classmate's name in a response any phone can read.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The `name_revealed` column

**Files:**
- Create: `~/Documents/GitHub/mzareei.github.io/supabase/migrations/0053_quiz_name_reveal.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `student_attempts.name_revealed boolean not null default false`, read by Tasks 6 and 9, written by Task 8.

- [ ] **Step 1: Write the migration**

```sql
-- Consent to have your real name shown on the class podium.
--
-- On the ATTEMPT, not the profile, and deliberately: the question a student is
-- answering is "do you want your name shown for this quiz, in front of this
-- room, today" — not "may we always name you". A new quiz starts anonymous
-- again, which is the honest reading of the tap.
--
-- Default false so a quiz that ran before this migration, and a student who
-- never answers, both stay anonymous.
alter table public.student_attempts
  add column if not exists name_revealed boolean not null default false;

comment on column public.student_attempts.name_revealed is
  'Student opted in to having their real name shown on the class podium for THIS attempt. Per-quiz consent; never inherited by a later attempt.';
```

- [ ] **Step 2: Do NOT apply it**

The migration is **not** pushed here. There is one Supabase project and no staging, so `db push` would alter the live database mid-build. Task 14 applies it in the single deployment pass, before the functions that read the column go up.

Check the file is syntactically sound by eye instead: one `alter table`, one `comment on column`, `if not exists` present so a re-run is harmless. Nothing to run.

- [ ] **Step 3: Confirm nothing was applied**

```bash
cd ~/Documents/GitHub/mzareei.github.io
git status --short supabase/migrations/
```

Expected: `0053_quiz_name_reveal.sql` shows as a new untracked file and nothing else. If you find yourself having run `db push`, say so in your report — it is not a disaster (the column is additive with a default) but Task 14 needs to know.

- [ ] **Step 4: Commit (backend)**

```bash
cd ~/Documents/GitHub/mzareei.github.io
git add supabase/migrations/0053_quiz_name_reveal.sql
git commit -m "$(cat <<'EOF'
Add student_attempts.name_revealed for per-quiz podium consent

On the attempt rather than the profile: the question is "show my name for
this quiz, in front of this room, today", not "may we always name you". A
new quiz starts anonymous again.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Derived total, room count, and auto-close in `course-class-quiz`

**Files:**
- Modify: `~/Documents/GitHub/mzareei.github.io/supabase/functions/course-class-quiz/index.ts`
- Test: `tools/verify-quiz-timing.mjs`, `tools/verify-quiz-auto-close.mjs` (both already written)

**Interfaces:**
- Consumes: `estimateTotalSeconds` (Task 1); `maybeAutoCloseInstance`, `closeReasonFor` (Task 2); `classDateFor` from `_shared/attendance.ts`.
- Produces: `quizStatus` now returns `present: number` and `closed_reason: "time" | "everyone" | null` alongside its existing fields.

- [ ] **Step 1: Run the two tests to see the checks that must go green**

Run: `node tools/verify-quiz-timing.mjs; node tools/verify-quiz-auto-close.mjs`
Expected: both FAIL listing, among others, "course-class-quiz must size the instance with the shared estimate", "the flat 10-minute default must be gone", "the instructor poll must run the auto-close check", "the completeness denominator must be today's check-ins".

- [ ] **Step 2: Add the imports and drop the flat default**

At the top of `course-class-quiz/index.ts`, beside the existing `askedQuestionIds` import:

```typescript
import { classDateFor } from "../_shared/attendance.ts";
import { estimateTotalSeconds } from "../_shared/question-timing.ts";
import { closeReasonFor, maybeAutoCloseInstance } from "../_shared/quiz-close.ts";
```

Delete this line entirely:

```typescript
const defaultTimeLimitSeconds = 600;
```

- [ ] **Step 3: Make the question pool carry its text**

Replace `bankQuestionCounts` with a function that returns the questions themselves. The count is now `pool.length`, so every existing caller keeps working:

```typescript
/** The questions this class session may still be asked, with the text the
 *  timing rule needs to size them.
 *
 *  Ids alone are not enough any more: the quiz clock is the sum of the longest
 *  questions a student could draw, so the prompts and options have to come back
 *  with them. Runs once per "Start the quiz", so the wider query is fine.
 *
 *  The asked-question subtraction is unchanged and still has to match
 *  course-activity-attempt's selector exactly — sizing the instance off the raw
 *  bank while the selector filters would hand a student a quiz that ends before
 *  its own progress indicator does. */
async function bankQuestionPool(
  db: Db,
  courseId: string,
  contentItemId: string,
  classSessionId?: string
) {
  const { data: bank, error } = await db
    .from("question_banks")
    .select("id")
    .eq("course_id", courseId)
    .eq("content_item_id", contentItemId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!bank) return [];

  const { data: rows, error: questionError } = await db
    .from("questions")
    .select("id, prompt, prompt_es")
    .eq("question_bank_id", bank.id)
    .eq("status", "active");
  if (questionError) throw questionError;

  const questions = rows || [];
  const asked = await askedQuestionIds(db, classSessionId);
  const pool = withoutAsked(questions, asked, (row) => String(row.id));
  if (!pool.length) return [];

  const { data: options, error: optionError } = await db
    .from("question_options")
    .select("question_id, option_text, option_text_es")
    .in("question_id", pool.map((row) => String(row.id)));
  if (optionError) throw optionError;

  const byQuestion = new Map<string, Array<Record<string, unknown>>>();
  for (const option of options || []) {
    const key = String(option.question_id);
    if (!byQuestion.has(key)) byQuestion.set(key, []);
    byQuestion.get(key)!.push(option);
  }

  return pool.map((row) => ({
    id: String(row.id),
    prompt: row.prompt,
    prompt_es: row.prompt_es,
    options: byQuestion.get(String(row.id)) || []
  }));
}
```

- [ ] **Step 4: Size the instance from the questions**

In `startQuiz`, replace the `available` / `timeLimit` lines:

```typescript
  const pool = await bankQuestionPool(db, courseId, item.id, sessionId);
  if (!pool.length) throw new Error("This lecture has no question bank yet.");

  const { templateId } = await ensureQuizTemplate(db, item);
  const questionCount = Math.min(pool.length, Math.max(1, Number(body.question_count) || defaultQuestionCount));
  // The clock is the sum of the longest questions this student could draw, plus
  // the professor's two-minute cushion — not a flat ten minutes that was
  // generous for a short quiz and tight for a long one. An explicit override
  // from the caller still wins.
  const timeLimit = Number(body.time_limit_seconds)
    ? Math.min(3600, Math.max(60, Number(body.time_limit_seconds)))
    : estimateTotalSeconds(pool, questionCount);
```

Leave the rest of `startQuiz` unchanged — `ends_at` is already `now + timeLimit`.

- [ ] **Step 5: Auto-close and report the room in `quizStatus`**

Replace the body of `quizStatus` after `loadInstanceForActor`:

```typescript
  const instance = await loadInstanceForActor(db, courseId, instanceId, isGlobalOwner, permittedSectionIds);

  // Closing happens here rather than on a schedule: this poll and every
  // student's poll both run it, so whichever arrives first ends the quiz and a
  // reloaded Run Class tab cannot hold it open over a finished room.
  const closed = await maybeAutoCloseInstance(
    db,
    {
      id: String(instance.id),
      state: String(instance.state),
      starts_at: (instance as Record<string, unknown>).starts_at as string | null,
      ends_at: instance.ends_at as string | null,
      class_session_id: (instance as Record<string, unknown>).class_session_id as string | null
    },
    classDateFor
  );

  const { count: enrolled } = await db
    .from("section_enrollments").select("id", { count: "exact", head: true })
    .eq("section_id", instance.section_id).eq("role", "student").eq("status", "active");
  const { data: attempts, error: attemptError } = await db
    .from("student_attempts").select("id, status, score_final")
    .eq("activity_instance_id", instanceId);
  if (attemptError) throw attemptError;

  const submitted = (attempts || []).filter((a) => ["submitted", "late"].includes(String(a.status)));
  return {
    instance_id: instance.id,
    state: closed.state,
    ends_at: instance.ends_at,
    question_count: instance.question_count,
    enrolled: enrolled ?? 0,
    // The roster is who COULD have come; `present` is who is in the room. The
    // completeness message has to speak in the second one.
    present: closed.present,
    started: (attempts || []).length,
    submitted: submitted.length,
    closed_reason: closed.state === "closed"
      ? (closed.closed_reason
         ?? closeReasonFor({ presentCount: closed.present, submittedCount: submitted.length }))
      : null,
    average_score: submitted.length
      ? Math.round((submitted.reduce((sum, a) => sum + Number(a.score_final || 0), 0) / submitted.length) * 10) / 10
      : null
  };
```

`loadInstanceForActor` must also select `class_session_id`. Change its `.select(...)` to:

```typescript
    .select("id, section_id, class_session_id, state, starts_at, ends_at, question_count, course_sections!inner(course_id)")
```

- [ ] **Step 6: Run both tests**

Run: `node tools/verify-quiz-timing.mjs; node tools/verify-quiz-auto-close.mjs`
Expected: `verify-quiz-timing` still fails only on the two client checks (Task 10). `verify-quiz-auto-close` still fails only on "the student poll must run the auto-close check too" (Task 9) and the two grace checks (Task 7).

- [ ] **Step 7: Commit (backend) — do NOT deploy**

```bash
cd ~/Documents/GitHub/mzareei.github.io
git add supabase/functions/course-class-quiz/index.ts
git commit -m "$(cat <<'EOF'
Size the quiz clock from its questions and let it close itself

The flat ten minutes was generous for a short quiz and tight for a long one.
The clock is now the sum of the longest questions a student could draw plus
a two-minute cushion, and status reports how many are in the room rather
than only how many are on the roster.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: The `podium` action

**Files:**
- Modify: `~/Documents/GitHub/mzareei.github.io/supabase/functions/course-class-quiz/index.ts`
- Test: `tools/verify-quiz-podium.mjs`

**Interfaces:**
- Consumes: `rankAttempts`, `podiumCut` (Task 3); `name_revealed` (Task 4).
- Produces: action `podium`, input `{ class_session_id }` or `{ activity_instance_id }`, output:
  ```
  { instance_id: string | null,
    entries: Array<{ rank: number; profile_id: string; student_identifier: string | null;
                     score_final: number | null; name_revealed: boolean; name: string | null }> }
  ```

- [ ] **Step 1: Run the test to see the checks that must go green**

Run: `node tools/verify-quiz-podium.mjs`
Expected: FAIL including "the podium action must use the shared ranking rule" and "the podium must send a name ONLY when that student opted in".

- [ ] **Step 2: Add the import and the route**

Import beside the others:

```typescript
import { podiumCut, rankAttempts } from "../_shared/quiz-rank.ts";
```

Add a case in the `switch (body.action)` block, next to `"summary"`:

```typescript
      case "podium": {
        if (!isTeacher) throw new Error("Quiz results are not allowed for this role.");
        return json(await quizPodium(db, courseId, body, isGlobalOwner, permittedSectionIds));
      }
```

- [ ] **Step 3: Write the handler**

```typescript
/** The top three of the last quiz this class ran, for the celebration screen.
 *
 *  A real name is WITHHELD HERE unless that student opted in. Sending every
 *  podium name and hiding two of them in the client would put a classmate's
 *  name in a response the professor's browser — and anything with his session —
 *  can read. The student ID is the public identity; the name is the exception
 *  they granted. */
async function quizPodium(
  db: Db,
  courseId: string,
  body: Record<string, unknown>,
  isGlobalOwner: boolean,
  permittedSectionIds: string[]
) {
  let instanceId = "";
  if (body.activity_instance_id) {
    instanceId = cleanUuid(body.activity_instance_id, "activity instance id");
    await loadInstanceForActor(db, courseId, instanceId, isGlobalOwner, permittedSectionIds);
  } else {
    const sessionId = cleanUuid(body.class_session_id, "class session id");
    const session = await loadSession(db, courseId, sessionId);
    if (!isGlobalOwner && !permittedSectionIds.includes(String(session.section_id))) {
      throw new Error("You are not allowed to manage quizzes for this class section.");
    }
    const { data: instances, error } = await db
      .from("activity_instances")
      .select("id, state")
      .eq("class_session_id", sessionId)
      .eq("state", "closed")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    instanceId = String((instances || [])[0]?.id || "");
  }
  if (!instanceId) return { instance_id: null, entries: [] };

  const { data: attempts, error: attemptError } = await db
    .from("student_attempts")
    .select("profile_id, status, score_final, submitted_at, name_revealed")
    .eq("activity_instance_id", instanceId);
  if (attemptError) throw attemptError;

  const top = podiumCut(rankAttempts((attempts || []) as never));
  if (!top.length) return { instance_id: instanceId, entries: [] };

  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id, full_name, preferred_name, student_identifier")
    .in("id", top.map((entry) => String(entry.profile_id)));
  if (profileError) throw profileError;
  const byId = new Map((profiles || []).map((p) => [String(p.id), p]));

  return {
    instance_id: instanceId,
    entries: top.map((entry) => {
      const person = byId.get(String(entry.profile_id)) || {};
      const revealed = Boolean((entry as Record<string, unknown>).name_revealed);
      return {
        rank: entry.rank,
        profile_id: entry.profile_id,
        student_identifier: person.student_identifier || null,
        score_final: entry.score_final,
        name_revealed: revealed,
        name: revealed ? (person.preferred_name || person.full_name || null) : null
      };
    })
  };
}
```

- [ ] **Step 4: Run the test**

Run: `node tools/verify-quiz-podium.mjs`
Expected: still FAIL, but no longer on "the podium action must use the shared ranking rule" or the name-withholding check. Remaining failures belong to Tasks 8, 9 and 12.

- [ ] **Step 5: Commit (backend) — do NOT deploy**

```bash
cd ~/Documents/GitHub/mzareei.github.io
git add supabase/functions/course-class-quiz/index.ts
git commit -m "$(cat <<'EOF'
Add the quiz podium action

Student ID is the public identity; a real name is withheld by the server
unless that student opted in. Sending every name and hiding two in the
client would put a classmate's name in a readable response.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Per-question `seconds` and the submit grace

**Files:**
- Modify: `~/Documents/GitHub/mzareei.github.io/supabase/functions/course-activity-attempt/index.ts`
- Test: `tools/verify-quiz-timing.mjs`, `tools/verify-quiz-auto-close.mjs`

**Interfaces:**
- Consumes: `secondsForQuestion` (Task 1); `withinSubmitGrace` (Task 2).
- Produces: every question in `start_attempt`'s `questions[]` now carries `seconds: number`.

- [ ] **Step 1: Run the tests to see the checks that must go green**

Run: `node tools/verify-quiz-timing.mjs; node tools/verify-quiz-auto-close.mjs`
Expected: failures include "course-activity-attempt must stamp each question with the shared rule", "the submit path must honour the sixty-second grace".

- [ ] **Step 2: Add the imports**

```typescript
import { secondsForQuestion } from "../_shared/question-timing.ts";
import { withinSubmitGrace } from "../_shared/quiz-close.ts";
```

- [ ] **Step 3: Stamp each question**

At the end of `loadQuestionsForInstance`, the returned object already builds `options`. Change the final `return` so each question carries its own time. Build the options first so the timing rule can see them:

```typescript
  return selectedQuestions.map((question) => {
    const options = maybeShuffle(
      optionsByQuestion.get(String(question.id)) || [],
      String(instance.randomization_policy || "none").includes("options")
    );
    return {
      id: question.id,
      prompt: question.prompt,
      prompt_es: question.prompt_es,
      question_type: question.question_type,
      difficulty: question.difficulty,
      topic_tags: question.topic_tags || [],
      points: question.points,
      // The phone holds no timing rule of its own. Two repos deploy
      // independently, so a constant kept on both sides drifts silently — the
      // server decides and the player obeys.
      seconds: secondsForQuestion({
        prompt: question.prompt as string | null,
        prompt_es: question.prompt_es as string | null,
        options: options as Array<{ option_text?: string | null; option_text_es?: string | null }>
      }),
      options
    };
  });
```

- [ ] **Step 4: Let a submission land inside the grace**

In `submitAttempt`, replace the `assertActivityOpen(instance)` call with a submit-specific gate, and keep the strict one on the start path:

```typescript
  assertActivityOpenForSubmit(instance, attempt);
```

Add the function beside `assertActivityOpen`:

```typescript
/**
 * The submit path's gate, deliberately laxer than the start path's.
 *
 * assertActivityOpen rejected anything arriving after ends_at, which threw away
 * every answer a student had given if the clock ran out mid-question. Nobody
 * hit it while the deadline was invisible and generous; a visible, tight,
 * self-closing deadline makes it likely.
 *
 * The grace finishes work already begun. An attempt whose started_at is after
 * the deadline was never legitimately open and gets nothing — that check lives
 * in withinSubmitGrace, so starting late is still refused by assertActivityOpen
 * on the start path.
 */
function assertActivityOpenForSubmit(
  instance: Record<string, unknown>,
  attempt: Record<string, unknown>
) {
  const now = new Date();
  if (instance.starts_at && new Date(String(instance.starts_at)) > now) {
    throw new Error("Activity is not open yet.");
  }
  const stillOpen = openStates.includes(String(instance.state))
    && (!instance.ends_at || new Date(String(instance.ends_at)) >= now);
  if (stillOpen) return;

  if (withinSubmitGrace({
    endsAt: (instance.ends_at as string | null) ?? null,
    startedAt: (attempt.started_at as string | null) ?? null,
    now
  })) return;

  throw new Error("Activity is closed.");
}
```

The existing line that decides the stored status already marks these correctly:

```typescript
const status = instance.ends_at && new Date(instance.ends_at) < new Date() ? "late" : "submitted";
```

This makes `late` reachable for the first time — it has always existed in the `student_attempts` check constraint and in this line, but the strict gate threw before it could ever be assigned.

- [ ] **Step 5: Let the attempt time limit respect the grace too**

`assertAttemptWithinTimeLimit` runs on the same path and would throw first for a student whose per-attempt deadline passed. Add the grace to its early return:

```typescript
function assertAttemptWithinTimeLimit(attempt: Record<string, unknown>, instance: Record<string, unknown>) {
  const status = String(attempt.status || "");
  if (["submitted", "locked", "late"].includes(status) || attempt.submitted_at) {
    return;
  }
  // Same sixty seconds as the instance grace: a student finishing the last
  // question as their own clock expires must not lose the whole attempt.
  if (withinSubmitGrace({
    endsAt: (instance.ends_at as string | null) ?? null,
    startedAt: (attempt.started_at as string | null) ?? null,
    now: new Date()
  })) return;

  const deadline = attemptDeadlineAt(attempt, instance);
  if (deadline && new Date(deadline) <= new Date()) {
    throw new Error("Activity time limit has expired.");
  }
}
```

- [ ] **Step 6: Run both tests**

Run: `node tools/verify-quiz-timing.mjs; node tools/verify-quiz-auto-close.mjs`
Expected: `verify-quiz-auto-close` now fails only on "the student poll must run the auto-close check too" (Task 9). `verify-quiz-timing` fails only on the two client checks (Task 10).

- [ ] **Step 7: Commit (backend) — do NOT deploy**

```bash
cd ~/Documents/GitHub/mzareei.github.io
git add supabase/functions/course-activity-attempt/index.ts
git commit -m "$(cat <<'EOF'
Stamp each quiz question with its own time; accept a submission in the grace

The server decides how long a question is worth and the phone obeys, so the
rule cannot drift across two independently deployed repos.

The submit path used to reject anything arriving after the deadline, which
threw away every answer a student had given if the clock ran out
mid-question. Sixty seconds of grace finishes work already begun; starting
late is still refused. This makes the 'late' status reachable for the first
time.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: The `set_name_reveal` action

**Files:**
- Modify: `~/Documents/GitHub/mzareei.github.io/supabase/functions/course-activity-attempt/index.ts`
- Test: `tools/verify-quiz-podium.mjs`

**Interfaces:**
- Consumes: `rankAttempts`, `podiumCut` (Task 3); `name_revealed` (Task 4).
- Produces: action `set_name_reveal`, input `{ attempt_id: string, revealed: boolean }`, output `{ attempt_id: string, name_revealed: boolean }`.

- [ ] **Step 1: Run the test**

Run: `node tools/verify-quiz-podium.mjs`
Expected: FAIL on "students need an action to opt in" and "set_name_reveal must refuse a student who is not actually on the podium".

- [ ] **Step 2: Add the import and the route**

```typescript
import { podiumCut, rankAttempts } from "../_shared/quiz-rank.ts";
```

This function dispatches with `if (body.action === …)` blocks, not a `switch`. Add one immediately after the `submit_attempt` block and before the `return json({ error: "Unknown action." }, { status: 400 })`:

```typescript
    if (body.action === "set_name_reveal") {
      const result = await setNameReveal(db, profile, {
        attemptId: cleanUuid(body.attempt_id, "attempt id"),
        revealed: body.revealed === true
      });
      return json(result);
    }
```

`revealed: body.revealed === true` rather than a truthy check: the string `"false"` is truthy, and this field arrives over JSON.

- [ ] **Step 3: Write the handler**

```typescript
/**
 * A student on the podium choosing to be named.
 *
 * Three guards, all of them load-bearing:
 *   - the attempt must be theirs, so a phone cannot reveal a classmate;
 *   - the attempt must actually be in the top three, so a phone cannot talk
 *     its way onto the celebration screen by calling this directly;
 *   - the quiz must be closed, so nobody advertises a place while the quiz is
 *     still being taken.
 *
 * Reversible on purpose. A student who says yes and immediately regrets it in
 * front of the room has to be able to take it back, and the podium reverts to
 * their student ID within one poll.
 */
async function setNameReveal(
  db: Db,
  profile: Record<string, unknown>,
  input: { attemptId: string; revealed: boolean }
) {
  const attempt = await loadAttempt(db, input.attemptId, String(profile.id));
  const instance = await loadActivityInstance(db, String(attempt.activity_instance_id));
  if (String(instance.state) !== "closed") {
    throw new Error("The quiz is still running.");
  }

  const { data: attempts, error } = await db
    .from("student_attempts")
    .select("profile_id, status, score_final, submitted_at")
    .eq("activity_instance_id", attempt.activity_instance_id);
  if (error) throw error;

  const top = podiumCut(rankAttempts((attempts || []) as never));
  if (!top.some((entry) => String(entry.profile_id) === String(profile.id))) {
    throw new Error("Only the top three can be named on the podium.");
  }

  const { data: updated, error: updateError } = await db
    .from("student_attempts")
    .update({ name_revealed: input.revealed, updated_at: new Date().toISOString() })
    .eq("id", input.attemptId)
    .eq("profile_id", profile.id)
    .select("id, name_revealed")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error("That attempt was not found.");

  return { attempt_id: updated.id, name_revealed: Boolean(updated.name_revealed) };
}
```

`loadAttempt(db, attemptId, profileId)` already exists in this file and already scopes to the caller — read it before use and confirm it throws when the attempt belongs to someone else. If it does not, add that check here rather than trusting the name.

- [ ] **Step 4: Run the test**

Run: `node tools/verify-quiz-podium.mjs`
Expected: still FAIL, but only on the Task 9 and Task 12 checks ("the student's own place must use the same rule", "src/features/quiz/Podium.tsx must exist").

- [ ] **Step 5: Commit (backend) — do NOT deploy**

```bash
cd ~/Documents/GitHub/mzareei.github.io
git add supabase/functions/course-activity-attempt/index.ts
git commit -m "$(cat <<'EOF'
Let a top-three student choose to be named on the podium

Three guards: the attempt must be theirs, it must actually be in the top
three, and the quiz must be closed. A phone cannot talk its way onto the
celebration screen by calling this directly.

Reversible — a student who says yes and regrets it in front of the room has
to be able to take it back.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Auto-close and `my_rank` on the student poll

**Files:**
- Modify: `~/Documents/GitHub/mzareei.github.io/supabase/functions/course-pulse/index.ts`
- Test: `tools/verify-quiz-auto-close.mjs`, `tools/verify-quiz-podium.mjs`

**Interfaces:**
- Consumes: `maybeAutoCloseInstance` (Task 2); `rankAttempts`, `rankOf` (Task 3).
- Produces: `loadCurrent`'s `quiz` block gains
  ```
  my_rank: { rank: number; of: number; is_top3: boolean; attempt_id: string; name_revealed: boolean } | null
  ```

- [ ] **Step 1: Run both tests**

Run: `node tools/verify-quiz-auto-close.mjs; node tools/verify-quiz-podium.mjs`
Expected: failures include "the student poll must run the auto-close check too" and "the student's own place must use the same rule, not a second one".

- [ ] **Step 2: Add the imports**

`classDateFor` is already imported in this file. Add:

```typescript
import { maybeAutoCloseInstance } from "../_shared/quiz-close.ts";
import { rankAttempts, rankOf } from "../_shared/quiz-rank.ts";
```

- [ ] **Step 3: Rewrite `loadCurrentQuiz`**

It currently takes `(db, sessionId)`. It now needs the caller's profile to answer "what was MY place", so change the call site in `loadCurrent` to `loadCurrentQuiz(db, sessionId, profileId)` and replace the function:

```typescript
/** Is there a quiz to take right now, has one closed, and where did this
 *  student come?
 *
 *  This poll closes the quiz as readily as the professor's does. Thirty
 *  students refreshing every three seconds are a far more reliable clock than
 *  one laptop that may be asleep, reloaded, or on a different tab — and the
 *  student staring at a finished quiz is exactly the person who needs it to
 *  move on. */
async function loadCurrentQuiz(db: Db, sessionId: string, profileId: string) {
  const { data: instances, error } = await db
    .from("activity_instances")
    .select("id, state, starts_at, ends_at, question_count, class_session_id")
    .eq("class_session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const instance = (instances || [])[0];
  if (!instance) return { instance_id: null, state: null, my_rank: null };

  const closed = await maybeAutoCloseInstance(
    db,
    {
      id: String(instance.id),
      state: String(instance.state),
      starts_at: instance.starts_at,
      ends_at: instance.ends_at,
      class_session_id: String(instance.class_session_id)
    },
    classDateFor
  );

  return {
    instance_id: instance.id,
    state: closed.state, // 'live' -> take it now; 'closed' -> reflection can open
    ends_at: instance.ends_at,
    question_count: instance.question_count,
    // Only once the quiz is over. A place published while the room is still
    // answering would tell a student how they are doing mid-quiz.
    my_rank: closed.state === "closed"
      ? await loadMyRank(db, String(instance.id), profileId)
      : null
  };
}

/** This student's own place, and the attempt id their phone needs to opt in to
 *  being named. Null for a student who never finished — they are not ranked
 *  last, they are not ranked. */
async function loadMyRank(db: Db, instanceId: string, profileId: string) {
  const { data: attempts, error } = await db
    .from("student_attempts")
    .select("id, profile_id, status, score_final, submitted_at, name_revealed")
    .eq("activity_instance_id", instanceId);
  if (error) throw error;

  const ranked = rankAttempts((attempts || []) as never);
  const place = rankOf(ranked, profileId);
  if (!place) return null;

  const mine = (attempts || []).find((row) => String(row.profile_id) === String(profileId));
  return {
    ...place,
    attempt_id: String(mine?.id || ""),
    name_revealed: Boolean(mine?.name_revealed)
  };
}
```

- [ ] **Step 4: Run both tests**

Run: `node tools/verify-quiz-auto-close.mjs; node tools/verify-quiz-podium.mjs`
Expected: `verify-quiz-auto-close` now **passes** completely. `verify-quiz-podium` fails only on "src/features/quiz/Podium.tsx must exist" and the client name check (Task 12).

- [ ] **Step 5: Commit (backend) — do NOT deploy**

```bash
cd ~/Documents/GitHub/mzareei.github.io
git add supabase/functions/course-pulse/index.ts
git commit -m "$(cat <<'EOF'
Close the quiz from the student poll too, and tell each student their place

Thirty phones refreshing every three seconds are a more reliable clock than
one laptop that may be asleep or reloaded — and the student staring at a
finished quiz is exactly the person who needs it to move on.

A place is published only once the quiz is closed; sending it earlier would
tell a student how they are doing mid-quiz.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: The player obeys the server's clock

**Files:**
- Create: `src/features/quiz/clock.ts`
- Modify: `src/features/quiz/Player.tsx`
- Modify: `src/api/quiz.ts`
- Modify: `src/i18n/strings.ts`
- Test: `tools/verify-quiz-timing.mjs`

**Interfaces:**
- Consumes: `seconds` on each question, `activity_instance.ends_at` (Task 7).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Run the test**

Run: `node tools/verify-quiz-timing.mjs`
Expected: FAIL on the three client checks.

- [ ] **Step 2: Add `seconds` to the question type**

In `src/api/quiz.ts`, add to `QuizQuestion`:

```typescript
  /** How long this question is worth, decided by the server. The client keeps
   *  no timing rule of its own — the two repos deploy independently, so a
   *  constant on both sides drifts silently. */
  seconds: number;
```

And add the reveal wrapper, used in Task 13:

```typescript
export function setQuizNameReveal(input: { attempt_id: string; revealed: boolean }) {
  return callFn<{ attempt_id: string; name_revealed: boolean }>(
    "course-activity-attempt",
    { action: "set_name_reveal", ...input }
  );
}
```

- [ ] **Step 3: Replace the client's timing table**

In `src/features/quiz/Player.tsx`, delete:

```typescript
const SECONDS_BY_DIFFICULTY: Record<string, number> = { easy: 20, medium: 30, hard: 45 };
const DEFAULT_SECONDS = 30;

function secondsFor(question: QuizQuestion) {
  return SECONDS_BY_DIFFICULTY[question.difficulty] || DEFAULT_SECONDS;
}
```

Replace with:

```typescript
// The server sends each question's own time. The fallback is the floor, never
// a table: if a stale deployment omits the field, a student gets the minimum
// the professor asked for rather than a number this file invented.
const FALLBACK_SECONDS = 30;

function secondsFor(question: QuizQuestion) {
  return Number(question.seconds) > 0 ? Number(question.seconds) : FALLBACK_SECONDS;
}
```

Update the header comment at the top of the file — it currently says "short easy questions get 20s". Replace that sentence with:

```
// each with its own countdown — thirty seconds for almost everything, and
// forty-five for a question that simply takes longer to read. The server
// decides and sends the number with the question; this file holds no timing
// rule of its own.
```

- [ ] **Step 4: Submit at the instance deadline**

The instance deadline already arrives on `start_attempt` and is currently ignored. Hold it:

```typescript
  const [instanceEndsAt, setInstanceEndsAt] = useState<number | null>(null);
```

In the load effect, beside `setQuestions(res.questions)`:

```typescript
        setInstanceEndsAt(
          res.activity_instance?.ends_at
            ? new Date(res.activity_instance.ends_at).getTime()
            : null
        );
```

Add an effect after the existing auto-advance one:

```typescript
  // The whole quiz has a deadline, not just each question. When it passes the
  // player stops feeding new questions and sends what the student has, landing
  // inside the server's sixty-second grace.
  //
  // A student who answered nothing submits nothing: the server refuses an empty
  // submission ("At least one response is required"), so auto-submitting a
  // blank attempt would put an error on the phone of someone who never started.
  useEffect(() => {
    const { answers: a, busy: isBusy, result: hasResult, resumed: hasResumed, error: hasError } = stateRef.current;
    if (!instanceEndsAt || hasResult || hasResumed || isBusy || hasError) return;
    if (now < instanceEndsAt) return;
    if (Object.keys(a).length === 0) {
      setResumed({ percent: null });
      return;
    }
    void submitNow(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, instanceEndsAt]);
```

`setResumed({ percent: null })` reuses the existing "you're done, no score to show" branch rather than adding a fourth terminal state to this component.

- [ ] **Step 5: Show the whole-quiz clock beside the question clock**

In the header row, after the existing per-question pill:

```tsx
          {instanceEndsAt !== null ? (
            <span class="pill hidden">
              {t("quiz.totalLeft", { time: clockText(Math.max(0, instanceEndsAt - now)) })}
            </span>
          ) : null}
```

The professor's countdown (Task 11) formats the same way, and an instructor screen reaching into a student component for a formatter is the wrong direction. Create `src/features/quiz/clock.ts`:

```typescript
// `M:SS`, for the phone's total clock and the professor's countdown alike.
// Its own module rather than an export from Player.tsx: the End of Class box
// is an instructor screen, and it should not have to import from the student's
// quiz player to format a number.
export function clockText(remainingMs: number) {
  const total = Math.max(0, Math.round(remainingMs / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
```

Import it in `Player.tsx`:

```typescript
import { clockText } from "./clock";
```

- [ ] **Step 6: Add the strings**

In `src/i18n/strings.ts`, matching the surrounding shape exactly (read a neighbouring pair first):

```typescript
  "quiz.totalLeft": { en: "{time} left in total", es: "{time} en total" },
```

- [ ] **Step 7: Run the test and typecheck**

Run: `node tools/verify-quiz-timing.mjs && npm run typecheck && node tools/verify-i18n.mjs`
Expected: `verify-quiz-timing: OK`, typecheck clean, i18n clean.

- [ ] **Step 8: Commit (frontend)**

```bash
cd ~/Documents/GitHub/course-platform
git add src/features/quiz/Player.tsx src/features/quiz/clock.ts src/api/quiz.ts src/i18n/strings.ts
git commit -m "$(cat <<'EOF'
Take question timing from the server; submit at the whole-quiz deadline

The 20-second tier is gone. The client keeps no timing table — the two repos
deploy independently and a constant on both sides drifts silently.

A student mid-question when the total clock expires now submits what they
have, inside the server's grace, instead of losing it. A student who
answered nothing submits nothing: the server refuses an empty attempt.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: The countdown in the End of Class box

**Files:**
- Modify: `src/screens/instructor/EndOfClass.tsx`
- Modify: `src/api/quiz.ts`
- Modify: `src/i18n/strings.ts`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `present`, `closed_reason` on `QuizStatus` (Task 5); `clockText` (Task 10).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Extend the status type**

In `src/api/quiz.ts`, add to `QuizStatus`:

```typescript
  /** Students in the room today — the roster is who COULD have come. The
   *  completeness message has to speak in this number. */
  present: number;
  closed_reason: "time" | "everyone" | null;
```

- [ ] **Step 2: Add a one-second clock to the box**

In `EndOfClass.tsx`, beside the existing state:

```typescript
  const [now, setNow] = useState(Date.now());
```

```typescript
  // The status poll is every four seconds; the countdown has to move every one.
  // It ticks locally and re-syncs to the server's ends_at on each poll, so a
  // sleeping laptop's drift is corrected rather than accumulated.
  useEffect(() => {
    if (!instanceId) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [instanceId]);
```

- [ ] **Step 3: Show the clock and the room**

Replace the `running` block's contents:

```tsx
        <div class="stack">
          <p class="big-number">
            {status?.submitted ?? 0}
            <span style="font-size:1rem;font-weight:600;color:var(--text-muted);">
              {" / "}{status?.present ?? "…"}
            </span>
          </p>
          <p class="hint">{t("endOfClass.submittedOfPresent", {
            started: status?.started ?? 0,
            present: status?.present ?? 0
          })}</p>
          {status?.ends_at ? (
            <p class={`quiz-countdown${remainingMs <= 60_000 ? " warn" : ""}`}
               role="timer"
               aria-live="off">
              {t("endOfClass.timeLeft", { time: clockText(remainingMs) })}
            </p>
          ) : null}
          <button class="btn" type="button" disabled={busy} onClick={onClose}>
            {busy ? t("endOfClass.closing") : t("endOfClass.close")}
          </button>
        </div>
```

with, above the `return`:

```typescript
  const remainingMs = status?.ends_at ? new Date(status.ends_at).getTime() - now : 0;
```

and the import:

```typescript
import { clockText } from "../../features/quiz/clock";
```

`aria-live="off"` is deliberate: a timer that announces itself every second makes a screen reader unusable for the whole quiz.

- [ ] **Step 4: Say why it ended**

In the `lastResult` block, beside the average:

```tsx
              {lastResult.closed_reason ? (
                <span class="hint">
                  {lastResult.closed_reason === "everyone"
                    ? t("endOfClass.closedEveryone")
                    : t("endOfClass.closedTime")}
                </span>
              ) : null}
```

- [ ] **Step 5: Add the strings**

```typescript
  "endOfClass.timeLeft": { en: "{time} left", es: "Quedan {time}" },
  "endOfClass.submittedOfPresent": {
    en: "{started} started · {present} checked in today",
    es: "{started} empezaron · {present} registrados hoy"
  },
  "endOfClass.closedEveryone": {
    en: "Closed — everyone in the room finished",
    es: "Cerrado: todos en el salón terminaron"
  },
  "endOfClass.closedTime": { en: "Closed — time ran out", es: "Cerrado: se acabó el tiempo" },
```

Remove `endOfClass.submittedOf` if nothing else uses it — check with `grep -rn "endOfClass.submittedOf" src/`, and if the only hit is the definition and the line just replaced, delete the pair.

- [ ] **Step 6: Style the countdown**

In `src/styles/app.css`, beside the other pill/number styles:

```css
.quiz-countdown {
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  font-size: 1.1rem;
  color: var(--text-muted);
}

.quiz-countdown.warn {
  color: var(--warn);
}
```

`--warn` is the token `.pill.warn` already uses (`app.css:388`), so the last minute reads in the same colour the rest of the app means by "hurry".

- [ ] **Step 7: Verify**

Run: `npm run typecheck && node tools/verify-i18n.mjs && npm run verify`
Expected: typecheck clean; i18n clean; `verify-quiz-timing` and `verify-quiz-auto-close` pass; `verify-quiz-podium` still fails on the Podium.tsx checks (Task 12).

- [ ] **Step 8: Commit (frontend)**

```bash
cd ~/Documents/GitHub/course-platform
git add src/screens/instructor/EndOfClass.tsx src/api/quiz.ts src/i18n/strings.ts src/styles/app.css
git commit -m "$(cat <<'EOF'
Show the quiz countdown and the room in the End of Class box

The deadline already existed and was already sent to this screen; it was
never displayed. The submitted count now reads against who checked in today
rather than the roster, so "everyone has finished" is a number that can
actually be reached.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: The podium, on the box and on the room's screen

**Files:**
- Create: `src/features/quiz/Podium.tsx`
- Create: `src/features/live/ClassroomPodiumLayer.tsx`
- Modify: `src/screens/instructor/EndOfClass.tsx`
- Modify: `src/api/quiz.ts`
- Modify: `src/i18n/strings.ts`
- Modify: `src/styles/app.css`
- Test: `tools/verify-quiz-podium.mjs`

**Interfaces:**
- Consumes: the `podium` action (Task 6).
- Produces:
  - `interface PodiumEntry { rank: number; profile_id: string; student_identifier: string | null; score_final: number | null; name_revealed: boolean; name: string | null }`
  - `classQuizPodium(input: { class_session_id: string }): Promise<{ instance_id: string | null; entries: PodiumEntry[] }>`
  - `<Podium entries={PodiumEntry[]} large={boolean} />`
  - `<ClassroomPodiumLayer entries={PodiumEntry[]} onClose={() => void} />`

- [ ] **Step 1: Run the test**

Run: `node tools/verify-quiz-podium.mjs`
Expected: FAIL on "src/features/quiz/Podium.tsx must exist".

- [ ] **Step 2: Add the API wrapper and type**

In `src/api/quiz.ts`:

```typescript
export interface PodiumEntry {
  rank: number;
  profile_id: string;
  student_identifier: string | null;
  score_final: number | null;
  name_revealed: boolean;
  /** Present only when that student opted in. The server withholds it
   *  otherwise — this is never a name the client is trusted to hide. */
  name: string | null;
}

export function classQuizPodium(input: { class_session_id: string }) {
  return callFn<{ instance_id: string | null; entries: PodiumEntry[] }>(
    "course-class-quiz",
    { action: "podium", ...input }
  );
}
```

- [ ] **Step 3: Write the Podium component**

Create `src/features/quiz/Podium.tsx`:

```tsx
// The top three of the end-of-class quiz.
//
// Student IDs, not names. A name appears only for a student who tapped "show
// my name" on their own phone, and the server is what withholds the others —
// this component never receives a name it is expected to hide.
//
// Ordered 2 · 1 · 3 so the winner stands in the middle, the way a podium
// actually looks. A tie for third can make this four entries, so the layout
// must not assume exactly three.
import type { PodiumEntry } from "../../api/quiz";
import { t } from "../../i18n";

/** Exported so RankBanner shows a student the same medal the professor's
 *  podium is showing the room. Two copies would drift the moment one is
 *  edited. */
export const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/** 2 · 1 · 3. A tie simply widens one of the three groups — podiumCut never
 *  returns a rank above 3, so there is no fourth bucket to append. */
function podiumOrder(entries: PodiumEntry[]) {
  const byRank = (rank: number) => entries.filter((entry) => entry.rank === rank);
  return [...byRank(2), ...byRank(1), ...byRank(3)];
}

export function Podium({ entries, large = false }: { entries: PodiumEntry[]; large?: boolean }) {
  if (!entries.length) return <p class="hint">{t("podium.empty")}</p>;

  return (
    <ol class={`quiz-podium${large ? " quiz-podium-large" : ""}`}>
      {podiumOrder(entries).map((entry) => (
        <li key={entry.profile_id} class={`quiz-podium-place rank-${entry.rank}`}>
          <span class="quiz-podium-medal" aria-hidden="true">{MEDALS[entry.rank] || "🎉"}</span>
          <span class="quiz-podium-rank">{t("podium.place", { rank: entry.rank })}</span>
          <span class="quiz-podium-id">
            {entry.student_identifier || t("podium.noId")}
          </span>
          {entry.name ? <span class="quiz-podium-name">{entry.name}</span> : null}
          {typeof entry.score_final === "number" ? (
            <span class="quiz-podium-score">{entry.score_final}%</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 4: Write the room layer**

Create `src/features/live/ClassroomPodiumLayer.tsx`.

It sits beside `ClassroomQuestionLayer` and borrows its focus and Escape handling, but **not** its fullscreen toggle. That layer offers a "go fullscreen" button because a pulse question shares the screen with the deck and the professor chooses when to take it over. The podium is already the thing the professor pressed to show, so a second press to make it fill the screen is a step with no decision in it — this one covers the viewport outright and leaves on Escape or the button.

Read `ClassroomQuestionLayer.tsx` before writing this so the focus handling matches; do not copy its `requestFullscreen` block.

```tsx
// The winners, on the screen the room is looking at.
//
// A fullscreen layer inside Run Class, not the /projector route: the
// single-screen-classroom decision made Run Class the only teaching display,
// and nothing links to /projector. A celebration built there would land on a
// screen the professor never opens.
//
// It never appears on its own. The professor presses to show it, so the room's
// screen does not change while he is still talking — including when the quiz
// closes early because everyone finished.
import { useEffect, useRef } from "preact/hooks";
import type { PodiumEntry } from "../../api/quiz";
import { Podium } from "../quiz/Podium";
import { t } from "../../i18n";

export function ClassroomPodiumLayer({
  entries,
  onClose
}: {
  entries: PodiumEntry[];
  onClose: () => void;
}) {
  const layerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    layerRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <section
      ref={layerRef}
      class="classroom-podium-layer"
      data-testid="classroom-podium-layer"
      aria-live="polite"
      tabindex={-1}
    >
      <div class="classroom-podium-shell">
        <p class="eyebrow">{t("podium.classroomEyebrow")}</p>
        <h2>{t("podium.classroomTitle")}</h2>
        <Podium entries={entries} large />
        <div class="classroom-podium-actions">
          <button class="btn" type="button" onClick={onClose}>
            {t("podium.backToClass")}
          </button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire both into the End of Class box**

In `EndOfClass.tsx`:

```typescript
import { classQuizPodium, type PodiumEntry } from "../../api/quiz";
import { Podium } from "../../features/quiz/Podium";
import { ClassroomPodiumLayer } from "../../features/live/ClassroomPodiumLayer";
```

```typescript
  const [podium, setPodium] = useState<PodiumEntry[]>([]);
  const [showingPodium, setShowingPodium] = useState(false);
```

```typescript
  // Polled rather than fetched once: a top-three student may tap "show my name"
  // a minute after the quiz closes, and the podium has to pick it up without
  // the professor reloading anything.
  useEffect(() => {
    if (instanceId) return; // a quiz is running; there is no podium yet
    const tick = () =>
      classQuizPodium({ class_session_id: sessionId })
        .then((res) => setPodium(res.entries))
        .catch(() => {});
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [sessionId, instanceId]);
```

Render, inside the `lastResult` branch after the row:

```tsx
          {podium.length ? (
            <div class="stack" style="gap: 0.6rem;">
              <h3>{t("podium.title")}</h3>
              <Podium entries={podium} />
              <button class="btn" type="button" onClick={() => setShowingPodium(true)}>
                {t("podium.showToClass")}
              </button>
            </div>
          ) : null}
```

And at the very end of the returned `<section>`:

```tsx
      {showingPodium ? (
        <ClassroomPodiumLayer entries={podium} onClose={() => setShowingPodium(false)} />
      ) : null}
```

- [ ] **Step 6: Add the strings**

```typescript
  "podium.title": { en: "Top of the class", es: "Los mejores de la clase" },
  "podium.empty": { en: "No one finished the quiz.", es: "Nadie terminó el examen." },
  "podium.place": { en: "#{rank}", es: "#{rank}" },
  "podium.noId": { en: "Student", es: "Estudiante" },
  "podium.showToClass": { en: "Show the winners to the class", es: "Mostrar a los ganadores a la clase" },
  "podium.backToClass": { en: "Back to class", es: "Volver a la clase" },
  "podium.classroomEyebrow": { en: "End of class quiz", es: "Examen de fin de clase" },
  "podium.classroomTitle": { en: "Top of the class", es: "Los mejores de la clase" },
```

- [ ] **Step 7: Style it**

In `src/styles/app.css`. Read the existing `.classroom-question-layer` rules first and match the fullscreen approach they use:

```css
.quiz-podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
  flex-wrap: wrap;
}

.quiz-podium-place {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius);
  background: var(--surface-2);
  min-width: 7rem;
}

/* First place stands taller, the way a podium actually looks. */
.quiz-podium-place.rank-1 { padding-block: 1.4rem; }
.quiz-podium-place.rank-2 { padding-block: 1rem; }

.quiz-podium-medal { font-size: 1.6rem; line-height: 1; }
.quiz-podium-rank { font-size: 0.8rem; color: var(--text-muted); }
.quiz-podium-id { font-weight: 700; font-variant-numeric: tabular-nums; }
.quiz-podium-name { font-size: 0.85rem; color: var(--text-muted); }
.quiz-podium-score { font-size: 0.9rem; font-weight: 650; }

.quiz-podium-large .quiz-podium-place { min-width: 11rem; font-size: 1.4rem; }
.quiz-podium-large .quiz-podium-medal { font-size: 3.5rem; }

.classroom-podium-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: var(--surface);
  padding: 2rem;
}

.classroom-podium-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  text-align: center;
  max-width: 60rem;
}
```

`--surface`, `--surface-2` and `--radius` are the stylesheet's own tokens and both themes redefine them, so the podium follows dark mode without a second rule. The layer paints an opaque `--surface` on purpose: the room must not read Run Class's private counts through a translucent celebration.

- [ ] **Step 8: Run the test**

Run: `node tools/verify-quiz-podium.mjs && npm run typecheck && node tools/verify-i18n.mjs`
Expected: `verify-quiz-podium: OK`, typecheck clean, i18n clean.

- [ ] **Step 9: Commit (frontend)**

```bash
cd ~/Documents/GitHub/course-platform
git add src/features/quiz/Podium.tsx src/features/live/ClassroomPodiumLayer.tsx \
        src/screens/instructor/EndOfClass.tsx src/api/quiz.ts \
        src/i18n/strings.ts src/styles/app.css
git commit -m "$(cat <<'EOF'
Add the top-three podium to the End of Class box and the room's screen

A fullscreen layer inside Run Class rather than the /projector route: the
single-screen-classroom decision made Run Class the only teaching display
and nothing links to /projector, so a celebration built there would land on
a screen nobody opens.

It never appears on its own — the professor presses to show it, so the
room's screen does not change while he is still talking.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: The student's place, above the exit ticket

**Files:**
- Create: `src/features/quiz/RankBanner.tsx`
- Modify: `src/screens/student/Live.tsx`
- Modify: `src/api/pulse.ts`
- Modify: `src/i18n/strings.ts`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `my_rank` on the poll's quiz block (Task 9); `setQuizNameReveal` (Task 10).
- Produces: `<RankBanner rank={QuizRank} onRevealed={(revealed: boolean) => void} />`

- [ ] **Step 1: Add the type**

In `src/api/pulse.ts`, add the interface above `StudentPulseView`:

```typescript
export interface QuizRank {
  rank: number;
  of: number;
  is_top3: boolean;
  /** The phone needs this to opt in to being named. */
  attempt_id: string;
  name_revealed: boolean;
}
```

Then extend the existing `quiz` block inside `StudentPulseView`, which currently reads:

```typescript
  quiz: {
    instance_id: string | null;
    state: string | null;
    ends_at?: string | null;
    question_count?: number | null;
  };
```

Add one line to it:

```typescript
    /** Null while the quiz runs, and for a student who never submitted. */
    my_rank?: QuizRank | null;
```

Optional, like its two neighbours: the field is absent until `course-pulse` is deployed, and a required field would make the SPA's type lie about a response that has already shipped.

- [ ] **Step 2: Write the banner**

Create `src/features/quiz/RankBanner.tsx`:

```tsx
// Where this student came in the end-of-class quiz.
//
// Shown above the exit ticket AND kept on the done screen afterwards: a
// student who writes their paragraph quickly would otherwise see their place
// for a few seconds and lose the reveal button with it — which is exactly when
// a top-three student is deciding whether to say yes.
//
// The reveal is reversible. Someone who says yes and regrets it in front of
// the room has to be able to take it back.
import { useState } from "preact/hooks";
import type { QuizRank } from "../../api/pulse";
import { setQuizNameReveal } from "../../api/quiz";
import { MEDALS } from "./Podium";
import { t, apiErrorText } from "../../i18n";

export function RankBanner({
  rank,
  onRevealed
}: {
  rank: QuizRank;
  onRevealed?: (revealed: boolean) => void;
}) {
  const [revealed, setRevealed] = useState(rank.name_revealed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const next = !revealed;
    try {
      const res = await setQuizNameReveal({ attempt_id: rank.attempt_id, revealed: next });
      setRevealed(res.name_revealed);
      onRevealed?.(res.name_revealed);
    } catch (e) {
      setError(apiErrorText(e, "podium.revealFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class={`quiz-rank-banner${rank.is_top3 ? " top3" : ""}`}>
      {rank.is_top3 ? (
        <span class="quiz-rank-medal" aria-hidden="true">{MEDALS[rank.rank] || "🎉"}</span>
      ) : null}
      <p class="quiz-rank-line">{t("podium.yourPlace", { rank: rank.rank, of: rank.of })}</p>
      {rank.is_top3 ? (
        <>
          <button class="btn quiet" type="button" disabled={busy} onClick={toggle}>
            {busy
              ? t("app.loading")
              : revealed
                ? t("podium.hideMyName")
                : t("podium.revealMyName")}
          </button>
          {revealed ? <p class="hint">{t("podium.nameShowing")}</p> : null}
        </>
      ) : null}
      {error ? <p class="error-text" role="alert">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: Put it on both screens**

In `src/screens/student/Live.tsx`, import it:

```typescript
import { RankBanner } from "../../features/quiz/RankBanner";
```

In branch 3 (the reflection), immediately inside the `<div class="card">`, above `<Reflection …>`:

```tsx
          {view.quiz.my_rank ? <RankBanner rank={view.quiz.my_rank} /> : null}
```

In branch 4 (the done screen), immediately inside `<div class="empty-state card">`, above the `<h3>`:

```tsx
          {view?.quiz?.my_rank ? <RankBanner rank={view.quiz.my_rank} /> : null}
```

- [ ] **Step 4: Add the strings**

```typescript
  "podium.yourPlace": { en: "You finished #{rank} of {of}", es: "Terminaste #{rank} de {of}" },
  "podium.revealMyName": { en: "Show my name to the class", es: "Mostrar mi nombre a la clase" },
  "podium.hideMyName": { en: "Hide my name again", es: "Ocultar mi nombre otra vez" },
  "podium.nameShowing": {
    en: "Your name is on the class screen.",
    es: "Tu nombre está en la pantalla de la clase."
  },
  "podium.revealFailed": {
    en: "That did not save. Try again.",
    es: "No se guardó. Inténtalo de nuevo."
  },
```

- [ ] **Step 5: Style it**

```css
.quiz-rank-banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.9rem;
  margin-bottom: 0.9rem;
  border-radius: var(--radius);
  background: var(--surface-2);
  text-align: center;
}

.quiz-rank-banner.top3 { background: var(--accent-soft); }
.quiz-rank-medal { font-size: 2.2rem; line-height: 1; }
.quiz-rank-line { font-weight: 700; font-size: 1.1rem; margin: 0; }
```

All three are existing tokens with dark-mode counterparts, so no second rule is needed.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && node tools/verify-i18n.mjs && npm run verify`
Expected: all clean; every verifier passes.

- [ ] **Step 7: Commit (frontend)**

```bash
cd ~/Documents/GitHub/course-platform
git add src/features/quiz/RankBanner.tsx src/screens/student/Live.tsx \
        src/api/pulse.ts src/i18n/strings.ts src/styles/app.css
git commit -m "$(cat <<'EOF'
Show each student their place above the exit ticket

Kept on the done screen too: a student who writes their paragraph quickly
would otherwise see their place for a few seconds and lose the reveal button
with it — exactly when a top-three student is deciding whether to say yes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Ship it and prove it in Group 402

**Files:** none — this task deploys and verifies.

**Interfaces:**
- Consumes: everything above.
- Produces: a working feature and updated docs.

- [ ] **Step 1: Full verification**

```bash
cd ~/Documents/GitHub/course-platform
npm run verify && npm run build
```

Expected: "All N verifiers passed", then a clean vite build. Treat any failure as a build failure — do not deploy.

- [ ] **Step 2: Deploy the backend — the whole thing, in this order**

This is the first moment anything in this plan touches the live platform. Tasks 1–13 committed locally and deployed nothing; everything ships here, in one pass, by the professor's decision.

**Check first that no class is running.** Deploying `course-pulse` mid-lecture interrupts a room of phones polling it every three seconds.

Order matters. The migration goes first: `course-class-quiz` and `course-pulse` both select `name_revealed`, and a function deployed ahead of its column throws on every poll.

```bash
cd ~/Documents/GitHub/mzareei.github.io
npx supabase db push
```

Expected: `0053_quiz_name_reveal.sql` applies. Confirm before continuing:

```bash
npx supabase db push --dry-run
```

Expected: no pending migrations. If `0053` is still listed, stop — do not deploy the functions.

Then the functions:

```bash
npx supabase functions deploy course-class-quiz
npx supabase functions deploy course-activity-attempt
npx supabase functions deploy course-pulse
```

Expected: three successful deploys. Edge functions do **not** deploy on git push — this step is the only thing that ships them.

- [ ] **Step 3: Push the frontend**

The backend must be up before this: Cloudflare Pages builds within a minute or two of the push, and an SPA that calls `podium` or `set_name_reveal` before those actions exist gives every student an error.

```bash
cd ~/Documents/GitHub/course-platform
git push
```

Wait for the Pages deployment to finish before testing.

- [ ] **Step 4: Test through the real entry points, in Group 402**

Group 402 is the QA section. **Never test against a live class or a real student session** — a class left open for hours is unfinished on purpose.

Sign in as a test student and reach the quiz by tapping through from the Today screen. Navigating straight to an internal route validates a path a real student cannot reach, which is exactly how a build once shipped where students could not join a live class at all.

Check, in order:

1. Start the quiz. The box shows a `M:SS` countdown that ticks, and "N checked in today" — not the roster size.
2. On the phone, a short question shows 30 seconds. Find a long one and confirm 45.
3. Submit as every checked-in test student. The quiz closes by itself, and the box says "everyone in the room finished".
4. Start another quiz and let the clock run out instead. It closes by itself and says "time ran out".
5. On a phone mid-question when the clock expires: the answers given are saved and graded, not lost.
6. Each phone shows "You finished #N of M" above the exit ticket, and still shows it after submitting the reflection.
7. The box shows the top three by student ID with scores.
8. Tap "show my name" on a top-three phone. The name appears on the box within a few seconds. Tap again — it disappears.
9. Press "Show the winners to the class". The room layer covers Run Class; "Back to class" returns.
10. A student who did not submit sees no rank, and their exit ticket still opens.

- [ ] **Step 5: Update the docs**

Update `docs/05-status.md` with what shipped. Add to `docs/07-pitfalls.md` the two traps this work turned up:

- The completeness denominator must be today's check-ins, never `section_enrollments` — an absent student makes "everyone finished" unreachable.
- `assertActivityOpen` rejected post-deadline submissions outright, so a student mid-question when the clock expired lost every answer. The `late` status existed but was unreachable. The submit path now has its own gate.

Both files are updated in the same commit as the work, per `CLAUDE.md`.

- [ ] **Step 6: Commit and push the docs**

```bash
cd ~/Documents/GitHub/course-platform
git add docs/05-status.md docs/07-pitfalls.md
git commit -m "$(cat <<'EOF'
Record the quiz timer, auto-close and podium in the docs

Two pitfalls worth keeping: the completeness denominator must be today's
check-ins rather than the roster, and the submit path needed its own gate
because the strict one threw away a student's answers at the deadline.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

```bash
cd ~/Documents/GitHub/mzareei.github.io
git push
```

---

## Notes for whoever executes this

- **`npm run verify` runs everything.** During a task, run only the one verifier that task is driving — the full suite is ~45 scripts and the feedback loop matters more than completeness until the end.
- **The three new verifiers fail loudly on purpose** while their backend counterpart is unwritten. That is the failing test, not a broken repo. They skip cleanly only when the backend repo is absent entirely.
- **Read the actual `return json({...})`** before trusting any TypeScript interface across the two repos. Field-name mismatches there are invisible to the compiler and have shipped several times.
- **The professor tests on his own phone and laptop during real class hours.** Deploy the backend before pushing the frontend, so the SPA never calls an action that does not exist yet.
