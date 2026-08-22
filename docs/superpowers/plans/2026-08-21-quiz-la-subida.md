# La Subida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-running end-of-class quiz clock with a room-wide lockstep clock, reveal each answer on the phone during a shared ten-second break, and rebuild the room's screen as a climb toward the piñata.

**Architecture:** The activity instance's `started_at` becomes the single schedule every phone obeys — round *k* answers for 40 s from `started_at + k×50 s`, then breaks for 10 s. Correct answers earn candy (doubled inside the first 20 s), candy drives a racer's height on the screen, and correct answers alone crack the piñata. All timing and scoring rules live in pure modules the Node verifier imports and executes; the phone holds no rule of its own.

**Tech Stack:** Preact + TypeScript + Vite (frontend), Deno edge functions + Supabase/Postgres (backend), Node `assert` verifiers as the test harness. No test runner — `tools/verify-*.mjs` scripts are the tests.

**Spec:** `docs/superpowers/specs/2026-08-21-quiz-la-subida-design.md`

## Global Constraints

- **Two repos.** Frontend `~/Documents/GitHub/Tec Hub/course-platform`; backend `~/Documents/GitHub/Tec Hub/mzareei.github.io`. Both are on `main` — **branch before the first commit in each** (`feat/la-subida`).
- **Tests are verifiers.** There is no jest/vitest. A "failing test" means a new assertion in `tools/verify-quiz-race.mjs`; run it with `node tools/verify-quiz-race.mjs` from the frontend repo. It exits 0 and prints `verify-quiz-race passed` when green.
- **Pure modules are executed, not grepped.** Anything with arithmetic goes in a module with no Deno/DB imports so the verifier can `import()` it. Wiring may be grepped.
- **Every user-visible string goes through `t()` with an EN and an ES value.** `tools/verify-i18n.mjs` enforces this. Deliberately-Spanish strings go on that verifier's identical-strings allowlist.
- **Deliberately Spanish in both languages:** the piñata song lines, chants, *la porra*, *¡SE ROMPIÓ!*, *¡Casi!*, *La Subida*, racer names.
- **Banned commentary words**, in any generated line: `slow, slowest, last, behind, late, lento, lenta, última, último, atrás, rezagado, tarde`.
- **Nothing negative is ever shown per-student on the room's screen** — no dimming a wrong answer, no shrinking, no label for a miss.
- **Candy never reaches a grade.** No grading path may read `candy`.
- **Edge functions do not deploy on push.** Each changed function needs `npx supabase functions deploy <name>`; migrations need `npx supabase db push`.
- **Never test against group 402** — it holds ~26 real students. Use 501 or 502, and check People first.
- **Commit messages carry no co-author line.**
- Final gate for every task: `npm run verify && npm run typecheck && npm run build` green in the frontend repo.

---

### Task 1: Fair shuffle and the 4/3/3 deal

Today `maybeShuffle` uses `values.sort(() => Math.random() - 0.5)`, which is measurably biased — the correct option lands in some positions more often than others. And `selectQuestions` draws round-robin across easy/medium/hard, producing both an uneven count and a patterned difficulty order. Both are replaced here.

**Files:**
- Create: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/_shared/shuffle.ts`
- Modify: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-activity-attempt/index.ts` (`selectQuestions`, `maybeShuffle`, and the `loadQuestionsForInstance` call site around line 952)
- Test: `tools/verify-quiz-race.mjs` (frontend repo)

**Interfaces:**
- Consumes: nothing.
- Produces: `shuffle<T>(values: T[]): T[]` — a new array, Fisher-Yates. `dealQuestions(pool: Question[], quota: {easy:number; medium:number; hard:number}): Question[]` — exactly `easy+medium+hard` items where the pool allows, backfilled from other tiers when a tier is short, in randomized order. `QUOTA = { easy: 4, medium: 3, hard: 3 }`.

- [ ] **Step 1: Branch both repos**

```bash
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git checkout -b feat/la-subida
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && git checkout -b feat/la-subida
```

- [ ] **Step 2: Write the failing test**

Append to `tools/verify-quiz-race.mjs`, before the final success log:

```javascript
// ------------------------------------------------- fair shuffle
{
  const { shuffle } = await import(backend("_shared/shuffle.ts").href);

  // A biased shuffle leaves element 0 near the front far more often than 1/4.
  // Over 40k trials on 4 items, each position should hold ~10000 (±5%).
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 40000; i++) {
    const out = shuffle(["a", "b", "c", "d"]);
    counts[out.indexOf("a")] += 1;
  }
  for (const c of counts) {
    assert.ok(Math.abs(c - 10000) < 500, `fair shuffle: position count ${c} is within 5% of 10000`);
  }

  // The old approach must actually fail that bar — otherwise the test proves nothing.
  const biased = [0, 0, 0, 0];
  for (let i = 0; i < 40000; i++) {
    const out = ["a", "b", "c", "d"].sort(() => Math.random() - 0.5);
    biased[out.indexOf("a")] += 1;
  }
  assert.ok(
    biased.some((c) => Math.abs(c - 10000) >= 500),
    "the sort-based shuffle is biased; if this passes the test is not measuring bias"
  );

  assert.deepEqual(shuffle([]).length, 0, "empty input is safe");
  const source = [1, 2, 3, 4, 5];
  const copy = shuffle(source);
  assert.equal(copy.length, 5, "length is preserved");
  assert.deepEqual([...copy].sort(), [1, 2, 3, 4, 5], "membership is preserved");
  assert.deepEqual(source, [1, 2, 3, 4, 5], "the input array is not mutated");
}

// ------------------------------------------------- the 4/3/3 deal
{
  const { dealQuestions, QUOTA } = await import(backend("_shared/shuffle.ts").href);
  assert.deepEqual(QUOTA, { easy: 4, medium: 3, hard: 3 }, "the mix is 4 easy, 3 medium, 3 hard");

  const pool = [];
  for (let i = 0; i < 12; i++) pool.push({ id: `e${i}`, difficulty: "easy" });
  for (let i = 0; i < 12; i++) pool.push({ id: `m${i}`, difficulty: "medium" });
  for (let i = 0; i < 12; i++) pool.push({ id: `h${i}`, difficulty: "hard" });

  const dealt = dealQuestions(pool, QUOTA);
  assert.equal(dealt.length, 10, "ten questions are dealt");
  const byTier = (t) => dealt.filter((q) => q.difficulty === t).length;
  assert.equal(byTier("easy"), 4, "four easy");
  assert.equal(byTier("medium"), 3, "three medium");
  assert.equal(byTier("hard"), 3, "three hard");
  assert.equal(new Set(dealt.map((q) => q.id)).size, 10, "no question is dealt twice");

  // Order is shuffled, not easy-then-medium-then-hard. Over 40 deals the
  // difficulty sequence must not be constant.
  const sequences = new Set();
  for (let i = 0; i < 40; i++) sequences.add(dealQuestions(pool, QUOTA).map((q) => q.difficulty).join(","));
  assert.ok(sequences.size > 5, "two students do not meet the same difficulty order");

  // A short tier backfills rather than serving fewer than ten.
  const shortPool = [
    ...pool.filter((q) => q.difficulty === "easy"),
    ...pool.filter((q) => q.difficulty === "medium"),
    { id: "h0", difficulty: "hard" }
  ];
  const backfilled = dealQuestions(shortPool, QUOTA);
  assert.equal(backfilled.length, 10, "a short hard tier still yields ten questions");
  assert.equal(backfilled.filter((q) => q.difficulty === "hard").length, 1, "it uses the one hard question available");

  // A pool smaller than the quota yields the whole pool, not a crash.
  assert.equal(dealQuestions([{ id: "x", difficulty: "easy" }], QUOTA).length, 1, "a tiny pool yields what exists");
}
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd ~/Documents/GitHub/Tec\ Hub/course-platform && node tools/verify-quiz-race.mjs`
Expected: FAIL — `Cannot find module .../_shared/shuffle.ts`

- [ ] **Step 4: Write the module**

Create `supabase/functions/_shared/shuffle.ts` in the backend repo:

```typescript
// A real shuffle, and the quiz's difficulty mix.
//
// The old `values.sort(() => Math.random() - 0.5)` is not a shuffle: the
// comparator is inconsistent, so the result is measurably biased and a student
// who notices "the answer is rarely first" is reading a real signal. Fisher-Yates
// is the fix, and the verifier proves the old approach fails the same test.
//
// Pure on purpose: no Deno, no database. The Node verifier imports and runs it.

/** Fisher-Yates. Returns a new array; the input is never mutated. */
export function shuffle<T>(values: T[]): T[] {
  const out = Array.isArray(values) ? [...values] : [];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

export interface Tiered {
  difficulty?: string | null;
}

/** The class quiz is always ten questions: four easy, three medium, three hard. */
export const QUOTA = { easy: 4, medium: 3, hard: 3 } as const;

export type Quota = { easy: number; medium: number; hard: number };

/**
 * Deal `quota` questions from `pool`, shuffled within each tier and then
 * shuffled again as a whole so no two students meet the same difficulty order.
 *
 * A tier that cannot fill its share backfills from whatever is left rather than
 * serving a short quiz — a class that is thin on hard questions still gets ten.
 */
export function dealQuestions<T extends Tiered>(pool: T[], quota: Quota = QUOTA): T[] {
  const all = Array.isArray(pool) ? pool : [];
  const want = Math.max(0, (quota.easy || 0) + (quota.medium || 0) + (quota.hard || 0));
  if (want === 0 || all.length === 0) return [];

  const tiers: Record<string, T[]> = { easy: [], medium: [], hard: [] };
  const other: T[] = [];
  for (const question of all) {
    const bucket = tiers[String(question.difficulty)];
    if (bucket) bucket.push(question);
    else other.push(question);
  }

  const picked: T[] = [];
  const leftovers: T[] = [];
  for (const tier of ["easy", "medium", "hard"] as const) {
    const shuffled = shuffle(tiers[tier]);
    picked.push(...shuffled.slice(0, quota[tier] || 0));
    leftovers.push(...shuffled.slice(quota[tier] || 0));
  }

  // Backfill a short tier from every question not already dealt.
  const spare = shuffle([...leftovers, ...shuffle(other)]);
  while (picked.length < want && spare.length > 0) picked.push(spare.shift() as T);

  // Shuffle the whole hand so the order is not easy-then-medium-then-hard.
  return shuffle(picked);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd ~/Documents/GitHub/Tec\ Hub/course-platform && node tools/verify-quiz-race.mjs`
Expected: PASS

- [ ] **Step 6: Wire it into the deal**

In `supabase/functions/course-activity-attempt/index.ts`:

Add to the imports at the top of the file:

```typescript
import { shuffle, dealQuestions, QUOTA } from "../_shared/shuffle.ts";
```

Delete the whole `selectQuestions` function and the whole `maybeShuffle` function (around lines 1001–1035).

Replace the call site (around line 952) — it currently reads:

```typescript
  const selectedQuestions = selectQuestions(pool, Number(instance.question_count || 0), String(instance.randomization_policy || "none"));
```

with:

```typescript
  // The class quiz is always the 4/3/3 mix in a shuffled order. `question_count`
  // stays on the instance for the schedule and the piñata's denominator, but it
  // no longer decides the deal — the quota does.
  const selectedQuestions = dealQuestions(pool, QUOTA);
```

Replace the option shuffle a few lines below — it currently reads:

```typescript
    const options = maybeShuffle(
      optionsByQuestion.get(String(question.id)) || [],
      String(instance.randomization_policy || "none").includes("options")
    );
```

with:

```typescript
    // Options are always shuffled for a class quiz, with a real shuffle: two
    // students on the same question never see the same letter order.
    const options = shuffle(optionsByQuestion.get(String(question.id)) || []);
```

- [ ] **Step 7: Assert the wiring**

Append to the same verifier block:

```javascript
// ------------------------------------------------- the deal is wired in
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /dealQuestions\(pool, QUOTA\)/, "the deal uses the 4/3/3 quota");
  assert.match(attempt, /shuffle\(optionsByQuestion\.get/, "options use the fair shuffle");
  assert.doesNotMatch(attempt, /maybeShuffle/, "the biased shuffle is gone");
  assert.doesNotMatch(attempt, /function selectQuestions/, "round-robin selection is gone");
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node tools/verify-quiz-race.mjs`
Expected: PASS

- [ ] **Step 9: Commit both repos**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && git add supabase/functions/_shared/shuffle.ts supabase/functions/course-activity-attempt/index.ts && git commit -m "fix: replace biased shuffle with Fisher-Yates and deal a fixed 4/3/3 mix"
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add tools/verify-quiz-race.mjs && git commit -m "test: prove the shuffle is fair and the deal is 4/3/3 in random order"
```

---

### Task 2: The room clock

The single schedule every phone obeys, plus what "fast" means. Backend owns the constants; the frontend renders absolute timestamps the server sends and never invents a duration.

**Files:**
- Create: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/_shared/rounds.ts`
- Modify: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/_shared/question-timing.ts` (total-time sizing only)
- Test: `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `ANSWER_SECONDS = 40`, `BREAK_SECONDS = 10`, `ROUND_SECONDS = 50`, `GOLDEN_SECONDS = 20`, `CANDY_CORRECT = 1`, `CANDY_GOLDEN = 2`; `windowFor(startedAtMs, index, questionCount): RoundWindow`; `roundAt(startedAtMs, nowMs, questionCount): RoundWindow`; `candyFor({ correct, msIntoRound }): number`; `totalSecondsFor(questionCount): number`. `RoundWindow = { index: number; phase: "answering" | "break" | "done"; answerStart: number; answerEnd: number; breakEnd: number }` — all times ms epoch.

- [ ] **Step 1: Write the failing test**

Append to `tools/verify-quiz-race.mjs`:

```javascript
// ------------------------------------------------- the room clock
{
  const {
    ANSWER_SECONDS, BREAK_SECONDS, ROUND_SECONDS, GOLDEN_SECONDS,
    CANDY_CORRECT, CANDY_GOLDEN, windowFor, roundAt, candyFor, totalSecondsFor
  } = await import(backend("_shared/rounds.ts").href);

  assert.equal(ANSWER_SECONDS, 40, "forty seconds to answer");
  assert.equal(BREAK_SECONDS, 10, "ten seconds of break");
  assert.equal(ROUND_SECONDS, 50, "a round is fifty seconds");
  assert.equal(GOLDEN_SECONDS, 20, "a golden candy needs an answer inside twenty seconds");

  const T0 = 1_700_000_000_000;

  const first = windowFor(T0, 0, 10);
  assert.equal(first.answerStart, T0, "round 0 answers from the anchor");
  assert.equal(first.answerEnd, T0 + 40_000, "round 0 stops taking answers at 40s");
  assert.equal(first.breakEnd, T0 + 50_000, "round 0 ends at 50s");

  const fifth = windowFor(T0, 4, 10);
  assert.equal(fifth.answerStart, T0 + 200_000, "round 4 starts at 200s");
  assert.equal(fifth.answerEnd, T0 + 240_000, "round 4 stops taking answers at 240s");

  assert.equal(roundAt(T0, T0, 10).index, 0, "at the anchor we are in round 0");
  assert.equal(roundAt(T0, T0, 10).phase, "answering", "and we are answering");
  assert.equal(roundAt(T0, T0 + 39_999, 10).phase, "answering", "still answering at 39.999s");
  assert.equal(roundAt(T0, T0 + 40_000, 10).phase, "break", "the break starts at 40s");
  assert.equal(roundAt(T0, T0 + 49_999, 10).phase, "break", "and runs to 49.999s");
  assert.equal(roundAt(T0, T0 + 50_000, 10).index, 1, "round 1 starts at 50s");
  assert.equal(roundAt(T0, T0 + 50_000, 10).phase, "answering", "answering again");

  // A late joiner lands on the live round, not at the start.
  const late = roundAt(T0, T0 + 265_000, 10);
  assert.equal(late.index, 5, "arriving at 4:25 lands in round 5");
  assert.equal(late.phase, "answering", "with answering still open");

  // Past the end.
  assert.equal(roundAt(T0, T0 + 500_000, 10).phase, "done", "the quiz is done after ten rounds");
  assert.equal(roundAt(T0, T0 + 499_999, 10).phase, "break", "the last break runs to the final millisecond");
  // A clock that is behind the anchor must not produce a negative round.
  assert.equal(roundAt(T0, T0 - 5_000, 10).index, 0, "before the anchor we are in round 0");

  // Candy.
  assert.equal(CANDY_CORRECT, 1, "a correct answer is one candy");
  assert.equal(CANDY_GOLDEN, 2, "correct and fast is two");
  assert.equal(candyFor({ correct: true, msIntoRound: 19_999 }), 2, "inside twenty seconds is golden");
  assert.equal(candyFor({ correct: true, msIntoRound: 20_000 }), 1, "at twenty seconds it is not");
  assert.equal(candyFor({ correct: true, msIntoRound: null }), 1, "no timestamp means no golden candy");
  assert.equal(candyFor({ correct: false, msIntoRound: 500 }), 0, "a fast wrong answer earns nothing");
  assert.equal(candyFor({ correct: false, msIntoRound: null }), 0, "an unanswered question earns nothing");

  // Whole-quiz sizing: ten rounds of fifty seconds plus the existing cushion.
  assert.equal(totalSecondsFor(10), 560, "ten rounds is 8:20 plus a 60s cushion");
  assert.equal(totalSecondsFor(0), 60, "no questions clamps to the floor");
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — `Cannot find module .../_shared/rounds.ts`

- [ ] **Step 3: Write the module**

Create `supabase/functions/_shared/rounds.ts` in the backend repo:

```typescript
// The room clock.
//
// Before this, every phone ran its own countdown from the moment its student
// tapped "Let's go", so no two students were ever on the same question and the
// room's screen played to an audience of one. Now the activity instance's
// started_at is the only anchor: round k takes answers for ANSWER_SECONDS from
// started_at + k*ROUND_SECONDS, then the room breaks for BREAK_SECONDS while
// every phone reveals its own answer and every eye goes to the screen.
//
// This module also owns what "fast" means, because "fast" is measured against
// the round's start and nothing else should get to define it.
//
// Pure on purpose: no Deno, no database. The Node verifier imports and runs it.

import { CUSHION_SECONDS, MIN_TOTAL_SECONDS, MAX_TOTAL_SECONDS } from "./question-timing.ts";

export const ANSWER_SECONDS = 40;
export const BREAK_SECONDS = 10;
export const ROUND_SECONDS = ANSWER_SECONDS + BREAK_SECONDS;

/** Answer correctly inside this many seconds of the round and the candy doubles. */
export const GOLDEN_SECONDS = 20;

export const CANDY_CORRECT = 1;
export const CANDY_GOLDEN = 2;

const ANSWER_MS = ANSWER_SECONDS * 1000;
const ROUND_MS = ROUND_SECONDS * 1000;

export type RoundPhase = "answering" | "break" | "done";

export interface RoundWindow {
  /** 0-based round index. Clamped into range; never negative. */
  index: number;
  phase: RoundPhase;
  /** ms epoch */
  answerStart: number;
  answerEnd: number;
  breakEnd: number;
}

const clampCount = (value: number) => Math.max(1, Math.floor(Number(value) || 0) || 1);

/** The absolute window for one round. */
export function windowFor(startedAt: number, index: number, questionCount: number): RoundWindow {
  const count = clampCount(questionCount);
  const k = Math.max(0, Math.min(count - 1, Math.floor(Number(index) || 0)));
  const answerStart = startedAt + k * ROUND_MS;
  return {
    index: k,
    phase: "answering",
    answerStart,
    answerEnd: answerStart + ANSWER_MS,
    breakEnd: answerStart + ROUND_MS
  };
}

/** Where the room is right now. A phone that slept through four rounds lands
 *  on the live one in a single call, not one advance per tick. */
export function roundAt(startedAt: number, now: number, questionCount: number): RoundWindow {
  const count = clampCount(questionCount);
  const elapsed = Number(now) - Number(startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return windowFor(startedAt, 0, count);

  const raw = Math.floor(elapsed / ROUND_MS);
  if (raw >= count) {
    const finished = windowFor(startedAt, count - 1, count);
    return { ...finished, phase: "done" };
  }
  const window = windowFor(startedAt, raw, count);
  const within = elapsed - raw * ROUND_MS;
  return { ...window, phase: within < ANSWER_MS ? "answering" : "break" };
}

/**
 * What a student earned on one question. Speed pays here and NOWHERE else —
 * candy is the race, and the grade counts correctness only.
 *
 * `msIntoRound` is measured server-side from the round's start to the arrival of
 * the student's first answer for that question. A null means the server never
 * saw an answer in time, which is worth no bonus even if the answer was right.
 */
export function candyFor(input: { correct: boolean; msIntoRound: number | null }): number {
  if (!input.correct) return 0;
  const ms = input.msIntoRound;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return CANDY_CORRECT;
  return ms < GOLDEN_SECONDS * 1000 ? CANDY_GOLDEN : CANDY_CORRECT;
}

/** What to put on the instance's clock: every round, plus the existing cushion
 *  for the student whose phone was slow to open. */
export function totalSecondsFor(questionCount: number): number {
  const count = Math.max(0, Math.floor(Number(questionCount) || 0));
  const total = count > 0 ? count * ROUND_SECONDS + CUSHION_SECONDS : 0;
  return Math.min(MAX_TOTAL_SECONDS, Math.max(MIN_TOTAL_SECONDS, total));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tools/verify-quiz-race.mjs`
Expected: PASS

- [ ] **Step 5: Point the instance's clock at the new schedule**

In `supabase/functions/course-class-quiz/index.ts`, find where `estimateTotalSeconds` is called to size the instance and replace it with `totalSecondsFor(questionCount)`. Add the import:

```typescript
import { totalSecondsFor } from "../_shared/rounds.ts";
```

Locate the call with:

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && grep -n "estimateTotalSeconds" supabase/functions/course-class-quiz/index.ts
```

Replace the `estimateTotalSeconds(pool, questionCount)` expression with `totalSecondsFor(questionCount)` and drop the now-unused import of `estimateTotalSeconds` if nothing else in the file uses it. Leave `question-timing.ts` itself untouched — `secondsForQuestion` is no longer used for the clock but the module still exports the cushion constants this task imports.

- [ ] **Step 6: Assert the wiring**

Append to the verifier:

```javascript
{
  const classQuiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
  assert.match(classQuiz, /totalSecondsFor\(/, "the instance clock is sized from the round schedule");
  assert.doesNotMatch(classQuiz, /estimateTotalSeconds\(/, "the old per-question estimate no longer sizes the quiz");
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `node tools/verify-quiz-race.mjs`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && git add supabase/functions/_shared/rounds.ts supabase/functions/course-class-quiz/index.ts && git commit -m "feat: add the room clock — 40s answering, 10s break, golden candy inside 20s"
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add tools/verify-quiz-race.mjs && git commit -m "test: cover round windows, late joiners, candy values and quiz sizing"
```

---

### Task 3: The piñata cracks on correct answers

Today the piñata bursts on answers *given* at 85%, so it pops whether or not the class knew anything. It now takes damage from correct answers and bursts at 70%.

**Files:**
- Modify: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/_shared/pinata.ts`
- Test: `tools/verify-quiz-race.mjs` (replace the existing "piñata maths" block)

**Interfaces:**
- Consumes: nothing.
- Produces: `BURST_PERCENT = 70`; `pinataState({ correct, started, questionCount, closedReason }) → { correct, total, percent, burst }`. Note the input field is renamed from `hits` to `correct` and the returned `hits` becomes `correct`.

- [ ] **Step 1: Rewrite the failing test**

In `tools/verify-quiz-race.mjs`, replace the entire existing `// ---- piñata maths` block with:

```javascript
// ------------------------------------------------- piñata maths
{
  const { BURST_PERCENT, pinataState } = await import(backend("_shared/pinata.ts").href);
  assert.equal(BURST_PERCENT, 70, "the piñata bursts at 70% of answers correct");

  assert.equal(pinataState({ correct: 0, started: 0, questionCount: 10 }).percent, 0, "nobody started → 0%");
  assert.equal(pinataState({ correct: 130, started: 26, questionCount: 10 }).percent, 50, "130 of 260 → 50%");
  assert.equal(pinataState({ correct: 500, started: 26, questionCount: 10 }).percent, 100, "clamped to 100");
  assert.equal(pinataState({ correct: 182, started: 26, questionCount: 10 }).burst, true, "70% bursts");
  assert.equal(pinataState({ correct: 179, started: 26, questionCount: 10 }).burst, false, "68% does not");
  assert.equal(pinataState({ correct: 130, started: 26, questionCount: 10 }).total, 260, "the denominator is started × questions");
  assert.equal(
    pinataState({ correct: 10, started: 26, questionCount: 10, closedReason: "everyone" }).burst,
    true,
    "a room where everyone finished broke it, whatever the percent"
  );
  assert.equal(
    pinataState({ correct: 179, started: 26, questionCount: 10, closedReason: "time" }).burst,
    false,
    "closing by time does not burst below the threshold"
  );
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — `the piñata bursts at 70%` (actual 85)

- [ ] **Step 3: Rewrite the module**

Replace the whole contents of `supabase/functions/_shared/pinata.ts`:

```typescript
// How cracked the class piñata is. Pure on purpose: course-class-quiz (the
// room's screen) and course-pulse (each phone) both call it, and the frontend
// verifier executes it — one formula, one threshold, nowhere else.
//
// Damage is CORRECT answers, not answers given. The old formula counted every
// answer, so the piñata burst whether or not the class knew anything; the
// threshold came down from 85 to 70 to keep a real class within reach of it.

/** Bursts below 100% so a couple of students who never start cannot keep the
 *  piñata whole for a room that did the work. */
export const BURST_PERCENT = 70;

export function pinataState(input: {
  correct: number;
  started: number;
  questionCount: number;
  closedReason?: string | null;
}) {
  const questionCount = Math.max(1, Math.floor(Number(input.questionCount) || 0) || 1);
  const started = Math.max(0, Math.floor(Number(input.started) || 0));
  const correct = Math.max(0, Math.floor(Number(input.correct) || 0));
  const total = Math.max(1, started) * questionCount;
  const percent = started === 0 ? 0 : Math.max(0, Math.min(100, Math.floor((100 * correct) / total)));
  const burst = percent >= BURST_PERCENT || input.closedReason === "everyone";
  return { correct, total, percent, burst };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tools/verify-quiz-race.mjs`
Expected: PASS

- [ ] **Step 5: Fix the two callers**

`pinataState` is called in `course-class-quiz/index.ts` and `course-pulse/index.ts` with `hits:`. Find them and change the argument name to `correct:`, sourcing it from the sum of `correct_count` rather than `progress_answered`. Task 6 rewrites both call sites fully; for now change only the key so nothing is calling a removed field:

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && grep -rn "pinataState(" supabase/functions/
```

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && git add supabase/functions/_shared/pinata.ts supabase/functions/course-class-quiz/index.ts supabase/functions/course-pulse/index.ts && git commit -m "feat: crack the pinata on correct answers and burst at 70 percent"
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add tools/verify-quiz-race.mjs && git commit -m "test: pinata damage is correctness, not participation"
```

---

### Task 4: Migration, answer stamping, and round settling

Two integers per attempt (candy, correct count), one map of server-stamped answer times, and the rule that settles a round once its window has passed.

**Files:**
- Create: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/migrations/0057_quiz_la_subida.sql`
- Modify: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-activity-attempt/index.ts` (`reportProgress`)
- Create: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/_shared/settle.ts`
- Test: `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: `roundAt`, `windowFor`, `candyFor` from `_shared/rounds.ts`.
- Produces: `settleAttempt({ startedAt, now, questionCount, questions, answers, answerTimes, settledThrough }) → { candy, correctCount, settledThrough }` — pure, idempotent, recomputes from scratch every call so two concurrent callers cannot double-count. `questions: Array<{ id: string; correctOptionId: string | null }>` in dealt order; `answers: Record<questionId, optionId>`; `answerTimes: Record<questionId, number>` (ms epoch).

- [ ] **Step 1: Write the failing test**

Append to `tools/verify-quiz-race.mjs`:

```javascript
// ------------------------------------------------- settling a closed round
{
  const { settleAttempt } = await import(backend("_shared/settle.ts").href);
  const T0 = 1_700_000_000_000;
  const questions = [
    { id: "q0", correctOptionId: "a0" },
    { id: "q1", correctOptionId: "a1" },
    { id: "q2", correctOptionId: "a2" }
  ];

  // Round 0 answered correctly at 12s (golden), round 1 wrong, round 2 still open.
  const answers = { q0: "a0", q1: "wrong", q2: "a2" };
  const answerTimes = { q0: T0 + 12_000, q1: T0 + 50_000 + 30_000, q2: T0 + 100_000 + 5_000 };

  // At 130s: rounds 0 and 1 are closed, round 2 is still answering.
  const mid = settleAttempt({
    startedAt: T0, now: T0 + 130_000, questionCount: 3, questions, answers, answerTimes, settledThrough: -1
  });
  assert.equal(mid.correctCount, 1, "only round 0 was right and only rounds 0-1 are settled");
  assert.equal(mid.candy, 2, "answered correctly inside twenty seconds is a golden candy");
  assert.equal(mid.settledThrough, 1, "rounds 0 and 1 are settled");

  // At 160s every round is closed.
  const end = settleAttempt({
    startedAt: T0, now: T0 + 160_000, questionCount: 3, questions, answers, answerTimes, settledThrough: 1
  });
  assert.equal(end.correctCount, 2, "round 2 was also correct");
  assert.equal(end.candy, 3, "golden 2 plus a plain 1");
  assert.equal(end.settledThrough, 2, "all three rounds are settled");

  // Idempotent: calling again with the same clock changes nothing.
  const again = settleAttempt({
    startedAt: T0, now: T0 + 160_000, questionCount: 3, questions, answers, answerTimes, settledThrough: 2
  });
  assert.deepEqual(again, end, "settling twice is the same as settling once");

  // An answer that arrived after its round closed earns nothing.
  const late = settleAttempt({
    startedAt: T0, now: T0 + 160_000, questionCount: 3, questions,
    answers: { q0: "a0" }, answerTimes: { q0: T0 + 45_000 }, settledThrough: -1
  });
  assert.equal(late.correctCount, 0, "an answer stamped after the 40s window does not count");
  assert.equal(late.candy, 0, "and earns no candy");

  // Nothing answered at all.
  const nothing = settleAttempt({
    startedAt: T0, now: T0 + 160_000, questionCount: 3, questions, answers: {}, answerTimes: {}, settledThrough: -1
  });
  assert.equal(nothing.correctCount, 0, "no answers, no correctness");
  assert.equal(nothing.candy, 0, "no answers, no candy");
}

// ------------------------------------------------- migration 0057
{
  const migration = readFileSync(backendPath("supabase/migrations/0057_quiz_la_subida.sql"), "utf8");
  for (const needle of [
    "candy int not null default 0",
    "correct_count int not null default 0",
    "round_answer_times jsonb not null default",
    "settled_through int not null default -1"
  ]) {
    assert.ok(migration.includes(needle), `migration 0057 declares ${needle}`);
  }
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — `Cannot find module .../_shared/settle.ts`

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0057_quiz_la_subida.sql`:

```sql
-- La Subida: the room clock, candy, and correctness settled per round.
--
-- candy and correct_count are the race; the grade never reads them.
-- round_answer_times is stamped by the SERVER on the first answer it sees for
-- a question, so "fast" cannot be claimed by a client.
-- settled_through is the highest round index already folded into the two
-- counters; settling recomputes from scratch, so it is a cursor, not a lock.

alter table student_attempts
  add column if not exists candy int not null default 0,
  add column if not exists correct_count int not null default 0,
  add column if not exists round_answer_times jsonb not null default '{}'::jsonb,
  add column if not exists settled_through int not null default -1;
```

- [ ] **Step 4: Write the settle module**

Create `supabase/functions/_shared/settle.ts`:

```typescript
// What a student has earned so far.
//
// A round is settled once its answering window has passed. Settling happens on
// READ — when the room's screen polls, or when a phone polls — because a
// student who answers round 3 and then puts the phone down would otherwise
// never trigger the grading of round 3.
//
// Recomputed from scratch on every call rather than accumulated, so two callers
// landing in the same millisecond cannot double-count. `settledThrough` is a
// cursor for reporting, never a guard against re-running the maths.
//
// Pure on purpose: no Deno, no database. The Node verifier imports and runs it.

import { windowFor, candyFor } from "./rounds.ts";

export interface SettleQuestion {
  id: string;
  correctOptionId: string | null;
}

export function settleAttempt(input: {
  startedAt: number;
  now: number;
  questionCount: number;
  /** In dealt order — index k is round k for THIS student. */
  questions: SettleQuestion[];
  answers: Record<string, string>;
  /** question id -> ms epoch the server first saw an answer for it. */
  answerTimes: Record<string, number>;
  settledThrough: number;
}): { candy: number; correctCount: number; settledThrough: number } {
  const questions = Array.isArray(input.questions) ? input.questions : [];
  const answers = input.answers || {};
  const times = input.answerTimes || {};

  let candy = 0;
  let correctCount = 0;
  let settledThrough = -1;

  for (let k = 0; k < questions.length; k += 1) {
    const window = windowFor(input.startedAt, k, input.questionCount);
    // Still open — nothing about this round is decided yet.
    if (input.now < window.answerEnd) break;
    settledThrough = k;

    const question = questions[k];
    const chosen = answers[question.id];
    const stamped = Number(times[question.id]);
    const answeredInTime =
      Boolean(chosen) && Number.isFinite(stamped) && stamped < window.answerEnd;
    if (!answeredInTime) continue;

    const correct = Boolean(question.correctOptionId) && chosen === question.correctOptionId;
    if (correct) correctCount += 1;
    candy += candyFor({ correct, msIntoRound: stamped - window.answerStart });
  }

  return { candy, correctCount, settledThrough };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node tools/verify-quiz-race.mjs`
Expected: PASS

- [ ] **Step 6: Stamp answer times in `report_progress`**

In `course-activity-attempt/index.ts`, inside `reportProgress`, after the existing answer sanitising and before the update: for every question id present in the incoming `answers` map that is **not** already a key in the attempt's stored `round_answer_times`, add it with the server's current timestamp. Never overwrite an existing stamp — the first answer is the one that counts, and a student changing their mind must not reset their clock.

Add to the update payload alongside the existing progress fields:

```typescript
      round_answer_times: mergedAnswerTimes,
```

where `mergedAnswerTimes` is built as:

```typescript
  // First answer wins. A student who changes their choice keeps the timestamp
  // of when they first committed, so "fast" cannot be gamed by re-tapping.
  const existingTimes = (attempt.round_answer_times as Record<string, number>) || {};
  const stampedAt = Date.now();
  const mergedAnswerTimes = { ...existingTimes };
  for (const questionId of Object.keys(answers)) {
    if (mergedAnswerTimes[questionId] === undefined) mergedAnswerTimes[questionId] = stampedAt;
  }
```

Also add `round_answer_times, candy, correct_count, settled_through` to the column list in `loadAttempt`'s `.select(...)` (around line 1040) so the fields are available to callers.

- [ ] **Step 7: Assert the stamping**

Append to the verifier:

```javascript
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /round_answer_times/, "report_progress stamps answer times");
  assert.match(attempt, /mergedAnswerTimes\[questionId\] === undefined/, "the first answer's timestamp is never overwritten");
  assert.match(attempt, /candy, correct_count, settled_through/, "the attempt row exposes the race columns");
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node tools/verify-quiz-race.mjs`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && git add supabase/migrations/0057_quiz_la_subida.sql supabase/functions/_shared/settle.ts supabase/functions/course-activity-attempt/index.ts && git commit -m "feat: stamp answer times server-side and settle candy per closed round"
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add tools/verify-quiz-race.mjs && git commit -m "test: settling is idempotent and ignores answers stamped after the window"
```

---

### Task 5: Grading counts every question dealt

Two changes that both lower scores, on purpose. The denominator becomes the ten questions dealt rather than the ones answered, and the speed bonus comes off the grade entirely.

**Files:**
- Modify: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-activity-attempt/index.ts` (`gradeResponses`, `submitAttempt`, `maxSpeedBonusPercent` at line 15)
- Modify: `src/features/quiz/Player.tsx` (the `.filter((r) => r.selected_option_id)` in `submitNow`)
- Test: `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `submit_attempt` accepts responses with `selected_option_id: ""` for unanswered questions and counts their points in the total. `SubmitAttemptResponse.score.speed_bonus` stays in the payload as `0` so no caller breaks.

- [ ] **Step 1: Write the failing test**

Append to `tools/verify-quiz-race.mjs`:

```javascript
// ------------------------------------------------- grading counts all ten
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /maxSpeedBonusPercent = 0/, "speed no longer moves a grade");

  const player = readFileSync(new URL("../src/features/quiz/Player.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(
    player,
    /\.filter\(\(r\) => r\.selected_option_id\)/,
    "the player must submit every dealt question, including the unanswered ones"
  );
  assert.match(player, /selected_option_id: answers\[q\.id\] \|\| ""/, "unanswered questions submit an empty selection");
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — `speed no longer moves a grade`

- [ ] **Step 3: Zero the speed bonus**

In `course-activity-attempt/index.ts`, line 15:

```typescript
// Speed used to be worth up to 5% of the grade. Under the room clock every
// student finishes in the same second, so it measured nothing — and equal
// correctness must mean an equal grade. Speed now pays in candy, which is the
// race and never the gradebook. Kept as a zero rather than deleted so the
// score payload keeps its shape for existing callers.
const maxSpeedBonusPercent = 0;
```

- [ ] **Step 4: Submit every dealt question**

In `src/features/quiz/Player.tsx`, inside `submitNow`, the responses array currently reads:

```typescript
        responses: stateRef.current.questions
          .map((q) => ({ question_id: q.id, selected_option_id: finalAnswers[q.id] || "" }))
          .filter((r) => r.selected_option_id),
```

Replace with:

```typescript
        // Every dealt question is submitted, answered or not. A question the
        // student never reached is a question they got wrong, and the grade has
        // to say so — filtering the blanks out is what made five-of-ten with
        // four right score 80% instead of 40%.
        responses: stateRef.current.questions
          .map((q) => ({ question_id: q.id, selected_option_id: finalAnswers[q.id] || "" })),
```

- [ ] **Step 5: Count blank responses in the denominator**

In `gradeResponses`, `cleaned` already maps a missing selection to `null`, and `totalPoints += points` already runs for every row. The one thing to remove is the guard that rejects an all-blank submission. Find:

```typescript
  if (!graded.rows.length) throw new Error("At least one response is required.");
```

and replace with:

```typescript
  // A student who answered nothing now submits ten blanks and scores zero,
  // rather than being refused and left ungraded. Only a submission with no
  // rows at all — a stale client sending an empty array — is an error.
  if (!graded.rows.length) throw new Error("No questions were submitted.");
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node tools/verify-quiz-race.mjs && npm run typecheck`
Expected: PASS on both

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && git add supabase/functions/course-activity-attempt/index.ts && git commit -m "feat: grade against every question dealt and drop the speed bonus"
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add src/features/quiz/Player.tsx tools/verify-quiz-race.mjs && git commit -m "feat: submit unanswered questions so they count as wrong"
```

---

### Task 6: The read surfaces — `race` and `course-pulse`

Both callers settle every closed round before answering, and both return the room's round window so the screen and the phones tick against the same clock.

**Files:**
- Modify: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-class-quiz/index.ts` (`quizRace`)
- Modify: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-pulse/index.ts` (`my_race`, plus a new `round`)
- Modify: `src/api/quiz.ts` (`RaceRacer`, `RaceStatus`), `src/api/pulse.ts` (`MyRace`, `PulseQuizRound`)
- Test: `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: `settleAttempt`, `roundAt`, `pinataState`.
- Produces:
  - `RaceRacer = { racer_name: string; racer_emoji: string; candy: number; correct_count: number; finished: boolean; finish_place: number | null }` — `position`/`answered` are removed.
  - `RaceStatus` gains `round: { index: number; phase: "answering" | "break" | "done"; answer_ends_at: string; break_ends_at: string } | null` and `round_correct: number` (how many students got the round that just closed right, for the flash beat), and `pinata` becomes `{ name: string; correct: number; total: number; percent: number; burst: boolean }`.
  - `MyRace` gains `candy: number`, `correct_count: number`, and `last_result: { question_id: string; correct: boolean; correct_option_id: string; candy: number } | null` — the phone's reveal for the round that just closed, present only during a break.
  - `PulseQuizRound = { index: number; phase: string; answer_ends_at: string; break_ends_at: string; question_count: number }` on `view.quiz.round`.

- [ ] **Step 1: Write the failing test**

Append to `tools/verify-quiz-race.mjs`:

```javascript
// ------------------------------------------------- read surfaces
{
  const classQuiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
  assert.match(classQuiz, /settleAttempt\(/, "the race settles closed rounds before answering");
  assert.match(classQuiz, /round_correct/, "the race reports how many got the closed round right");
  assert.match(classQuiz, /roundAt\(/, "the race reports the room's round window");
  assert.doesNotMatch(classQuiz, /progress_position/, "racers are no longer placed by question position");

  const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");
  assert.match(pulse, /settleAttempt\(/, "the phone poll settles closed rounds too");
  assert.match(pulse, /last_result/, "the phone poll carries the reveal for the closed round");
  assert.match(pulse, /correct_option_id/, "the reveal names the correct option");

  const api = readFileSync(new URL("../src/api/quiz.ts", import.meta.url), "utf8");
  assert.match(api, /candy: number/, "RaceRacer carries candy");
  assert.match(api, /correct_count: number/, "RaceRacer carries the correct count");
  assert.doesNotMatch(api, /position: number;\n\s+answered: number/, "the old track fields are gone");
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — `the race settles closed rounds before answering`

- [ ] **Step 3: Rewrite `quizRace`**

In `course-class-quiz/index.ts`, add the imports:

```typescript
import { roundAt } from "../_shared/rounds.ts";
import { settleAttempt } from "../_shared/settle.ts";
```

In `quizRace`, after loading the instance and its attempts:

1. Load each attempt's `questions_json`, `progress_answers`, `round_answer_times`, `settled_through`, `candy`, `correct_count`.
2. For each attempt, call `settleAttempt` with the instance's `started_at` and the current time, mapping `questions_json` to `{ id, correctOptionId }`. The correct option id comes from a single `question_options` query over every dealt question id with `is_correct = true`.
3. Write back `candy`, `correct_count`, `settled_through` for any attempt whose values changed.
4. Compute `round_correct` as the number of attempts whose settled result for `roundAt(...).index` (or `index - 1` when the phase is `answering`) was correct.
5. Return racers as `{ racer_name, racer_emoji, candy, correct_count, finished, finish_place }`, and `pinata` from `pinataState({ correct: Σ correct_count, started, questionCount, closedReason })`.

Racer names remain secret: nothing in this payload maps a racer to a profile.

- [ ] **Step 4: Extend `course-pulse`**

In `course-pulse/index.ts`, in the quiz view:

1. Add `round` from `roundAt(startedAt, now, questionCount)`, serialising `answer_ends_at` and `break_ends_at` as ISO strings.
2. Settle the caller's own attempt and include `candy` and `correct_count` on `my_race`.
3. When the phase is `break`, include `last_result` for the round that just closed: the question id, whether the student's stored answer was correct, the correct option id, and the candy earned. Outside a break, `last_result` is `null` — the correct answer must never be available to a phone that is still answering that question.

- [ ] **Step 5: Update the frontend types**

In `src/api/quiz.ts`:

```typescript
export interface RaceRacer {
  racer_name: string;
  racer_emoji: string;
  /** Height on the climb — correctness plus speed. Never a grade. */
  candy: number;
  /** Size on the climb — cumulative, so a racer never shrinks. */
  correct_count: number;
  finished: boolean;
  finish_place: number | null;
}

export interface RaceRound {
  index: number;
  phase: "answering" | "break" | "done";
  answer_ends_at: string;
  break_ends_at: string;
}
```

and in `RaceStatus` replace the `pinata` line and add the two new fields:

```typescript
  round: RaceRound | null;
  /** How many students got the round that just closed right — the flash beat. */
  round_correct: number;
  pinata: { name: string; correct: number; total: number; percent: number; burst: boolean };
```

In `src/api/pulse.ts`:

```typescript
export interface PulseQuizRound {
  index: number;
  phase: "answering" | "break" | "done";
  answer_ends_at: string;
  break_ends_at: string;
  question_count: number;
}

export interface MyRace {
  racer_name: string;
  racer_emoji: string;
  finished: boolean;
  finish_place: number | null;
  pinata: { percent: number; burst: boolean };
  swinging: number;
  candy: number;
  correct_count: number;
  /** The reveal for the round that just closed. Null while answering — the
   *  correct answer never reaches a phone that could still use it. */
  last_result: {
    question_id: string;
    correct: boolean;
    correct_option_id: string;
    candy: number;
  } | null;
}
```

and add `round?: PulseQuizRound | null;` to the `quiz` object inside `StudentPulseView`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `node tools/verify-quiz-race.mjs && npm run typecheck`
Expected: `verify-quiz-race passed`; typecheck will report errors in `Player.tsx`, `PinataCard.tsx` and `ClassroomPinataLayer.tsx` — those are Tasks 7–11.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && git add supabase/functions/course-class-quiz/index.ts supabase/functions/course-pulse/index.ts && git commit -m "feat: race and pulse settle rounds and report the room clock"
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add src/api/quiz.ts src/api/pulse.ts tools/verify-quiz-race.mjs && git commit -m "feat: type the race around candy, correctness and the room round"
```

---

### Task 7: The phone runs on the room clock

The Next button goes, the carry-over clock goes, and the ten-second break becomes the reveal.

**Files:**
- Delete: `src/features/quiz/budget.ts`
- Create: `src/features/quiz/rounds.ts`
- Modify: `src/features/quiz/Player.tsx`, `src/screens/student/Live.tsx`
- Test: `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: `PulseQuizRound`, `MyRace` from Task 6.
- Produces: `src/features/quiz/rounds.ts` exporting `remainingMs(endsAtIso: string, now: number): number` and `isBreak(round: PulseQuizRound | null): boolean`. `QuizPlayer` gains a required `round: PulseQuizRound | null` prop.

- [ ] **Step 1: Write the failing test**

Append to `tools/verify-quiz-race.mjs`:

```javascript
// ------------------------------------------------- the phone obeys the room
{
  const { existsSync } = await import("node:fs");
  assert.ok(
    !existsSync(new URL("../src/features/quiz/budget.ts", import.meta.url)),
    "the carry-over budget is deleted"
  );
  const player = readFileSync(new URL("../src/features/quiz/Player.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(player, /from "\.\/budget"/, "nothing imports the carry-over budget");
  assert.doesNotMatch(player, /quiz\.next/, "there is no Next button — the room clock advances");
  assert.match(player, /round\.index/, "the player follows the room's round index");
  assert.match(player, /last_result/, "the break shows the student their result");
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — `the carry-over budget is deleted`

- [ ] **Step 3: Delete the budget and write the round helpers**

```bash
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git rm src/features/quiz/budget.ts
```

Create `src/features/quiz/rounds.ts`:

```typescript
// Reading the room's clock. The schedule itself belongs to the server — the two
// repos deploy independently, so a duration kept on both sides drifts silently.
// This file only converts what the server sent into what a countdown needs.
import type { PulseQuizRound } from "../../api/pulse";

/** Milliseconds left on a server-sent deadline, never negative. */
export function remainingMs(endsAtIso: string | null | undefined, now: number): number {
  if (!endsAtIso) return 0;
  const ends = new Date(endsAtIso).getTime();
  if (Number.isNaN(ends)) return 0;
  return Math.max(0, ends - now);
}

/** The room is between questions: phones reveal, eyes go to the screen. */
export function isBreak(round: PulseQuizRound | null | undefined): boolean {
  return Boolean(round && round.phase === "break");
}
```

- [ ] **Step 4: Rewrite the player's clock**

In `src/features/quiz/Player.tsx`:

1. Delete the `deadlines`/`positionAt`/`rebase` import and the `dl`, `t0`, `setDl`, `setT0` state along with the two effects that own them.
2. Add `round` to the props and render question `round.index` rather than a local `index`. Keep a local `index` state only as a fallback for a stale server that sends no round.
3. Replace the countdown pill's source with `remainingMs(round.answer_ends_at, now)`.
4. Remove the Next button entirely. The last question's Submit button also goes: the room clock ends the quiz and the existing `quizClosed` handoff submits. Keep the option buttons and the existing per-tap `ping`.
5. When `isBreak(round)` and `myRace?.last_result` is present, render the reveal instead of the question:

```tsx
  if (isBreak(round) && myRace?.last_result) {
    const result = myRace.last_result;
    const correctText = questions.find((q) => q.id === result.question_id)?.options
      .find((o) => o.id === result.correct_option_id);
    return (
      <div class="stack quiz-reveal">
        <p class="quiz-reveal-mark">{result.correct ? "✅" : "❌"}</p>
        <p class="quiz-reveal-answer">
          {t("quiz.correctAnswerWas", {
            answer: (lang.value === "es" && correctText?.option_text_es) || correctText?.option_text || ""
          })}
        </p>
        {result.candy > 0 ? <p class="hint">{t("quiz.earnedCandy", { candy: result.candy })}</p> : null}
        <p class="quiz-reveal-lookup">{t("quiz.lookUp")}</p>
      </div>
    );
  }
```

6. In `Live.tsx`, pass `round={pulse?.view?.quiz?.round ?? null}` into `QuizPlayer`.

- [ ] **Step 5: Add the strings**

In `src/i18n/strings.ts`:

```typescript
  "quiz.correctAnswerWas": { en: "The answer was: {answer}", es: "La respuesta era: {answer}" },
  "quiz.earnedCandy": { en: "+{candy} 🍬", es: "+{candy} 🍬" },
  "quiz.lookUp": { en: "👀 Look up at the screen!", es: "👀 ¡Mira la pantalla!" },
```

Add `quiz.earnedCandy` to the identical-strings allowlist in `tools/verify-i18n.mjs`.

- [ ] **Step 6: Run the tests**

Run: `node tools/verify-quiz-race.mjs && node tools/verify-i18n.mjs && npm run typecheck`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add -A src/features/quiz src/screens/student/Live.tsx src/i18n/strings.ts tools/ && git commit -m "feat: the phone follows the room clock and reveals the answer in the break"
```

---

### Task 8: The review list after submit

Ten seconds is not enough to read an explanation, so every explanation is collected for the student to read while the exit ticket is open.

**Files:**
- Create: `src/features/quiz/ReviewList.tsx`
- Modify: `src/features/quiz/Player.tsx` (render it in the done state), `src/i18n/strings.ts`, `src/styles/app.css`
- Test: `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: `QuizQuestion` from `src/api/quiz.ts`; `explanation` / `explanation_es` must be added to the `QuizQuestion` type and to the `questions` select in `course-activity-attempt`'s `loadQuestionsForInstance`.
- Produces: `<ReviewList questions={QuizQuestion[]} answers={Record<string,string>} correct={Record<string,string>} />`.

- [ ] **Step 1: Write the failing test**

```javascript
// ------------------------------------------------- the review list
{
  const review = readFileSync(new URL("../src/features/quiz/ReviewList.tsx", import.meta.url), "utf8");
  assert.match(review, /explanation/, "the review shows explanations where the bank has them");
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /explanation, explanation_es/, "the server sends explanations with the questions");
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — no such file

- [ ] **Step 3: Send explanations with the questions**

In `course-activity-attempt/index.ts`, in `loadQuestionsForInstance`, extend the questions select:

```typescript
    .select("id, prompt, prompt_es, question_type, difficulty, topic_tags, points, explanation, explanation_es")
```

and add `explanation: question.explanation, explanation_es: question.explanation_es,` to the returned object. Add the two optional fields to `QuizQuestion` in `src/api/quiz.ts`.

- [ ] **Step 4: Write the component**

Create `src/features/quiz/ReviewList.tsx`:

```tsx
// Every question, what the student chose, what was right, and why — read after
// submitting, while the exit ticket is open. The ten-second break is enough to
// see a ✅ or an ❌; it is not enough to read a paragraph, so the paragraphs
// wait here.
import type { QuizQuestion } from "../../api/quiz";
import { t, lang } from "../../i18n";

export function ReviewList({
  questions,
  answers,
  correct
}: {
  questions: QuizQuestion[];
  answers: Record<string, string>;
  /** question id -> correct option id */
  correct: Record<string, string>;
}) {
  const es = lang.value === "es";
  return (
    <div class="stack quiz-review" data-testid="quiz-review">
      <h3>{t("quiz.reviewTitle")}</h3>
      {questions.map((question, index) => {
        const chosen = question.options.find((o) => o.id === answers[question.id]);
        const right = question.options.find((o) => o.id === correct[question.id]);
        const wasCorrect = Boolean(chosen && right && chosen.id === right.id);
        const explanation = (es && question.explanation_es) || question.explanation;
        return (
          <div class="card muted quiz-review-item" key={question.id}>
            <p class="eyebrow">
              {wasCorrect ? "✅" : "❌"} {t("quiz.questionN", { n: index + 1, total: questions.length })}
            </p>
            <p class="quiz-review-prompt">{(es && question.prompt_es) || question.prompt}</p>
            <p class="hint">
              {chosen
                ? t("quiz.youChose", { answer: (es && chosen.option_text_es) || chosen.option_text })
                : t("quiz.youSkipped")}
            </p>
            {!wasCorrect && right ? (
              <p class="quiz-review-answer">
                {t("quiz.correctAnswerWas", { answer: (es && right.option_text_es) || right.option_text })}
              </p>
            ) : null}
            {explanation ? <p class="quiz-review-why">{explanation}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Add the strings and styles**

`src/i18n/strings.ts`:

```typescript
  "quiz.reviewTitle": { en: "How it went", es: "Cómo te fue" },
  "quiz.youChose": { en: "You chose: {answer}", es: "Elegiste: {answer}" },
  "quiz.youSkipped": { en: "You did not answer this one.", es: "Esta no la respondiste." },
```

`src/styles/app.css`:

```css
/* The post-quiz review: read at leisure while the exit ticket is open. */
.quiz-review-item { padding: 0.7rem 0.85rem; }
.quiz-review-prompt { font-weight: 650; margin: 0.2rem 0; }
.quiz-review-answer { color: var(--text); font-weight: 600; margin: 0.2rem 0; }
.quiz-review-why { color: var(--text-muted); font-size: 0.9rem; margin: 0.3rem 0 0; }
```

- [ ] **Step 6: Render it in the done state**

In `Player.tsx`, in both the `resumed` and `result` branches, render `<ReviewList …/>` under the existing `PinataCard`. The correct-option map comes from the submit response — extend `SubmitAttemptResponse` with `correct: Record<string, string>` and have `submit_attempt` return it. A resumed attempt that never re-submits shows no review; that is acceptable and does not need a fallback.

- [ ] **Step 7: Run the tests**

Run: `node tools/verify-quiz-race.mjs && node tools/verify-i18n.mjs && npm run typecheck`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && git add supabase/functions/course-activity-attempt/index.ts && git commit -m "feat: return explanations and the correct options after submit"
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add -A src tools && git commit -m "feat: add the post-quiz review with explanations"
```

---

### Task 9: La Subida — the climb

The track becomes a climb. This task builds the static screen; Task 10 makes it move.

**Files:**
- Modify: `src/features/live/ClassroomPinataLayer.tsx` (substantial rewrite), `src/styles/app.css`, `src/i18n/strings.ts`
- Test: `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: `RaceStatus`, `RaceRacer`, `RaceRound` from Task 6.
- Produces: `MAX_CANDY = 20` and `sizeFor(correctCount: number): number` (`1 + 0.2 × correct`, capped at 3) exported from `src/features/live/subida.ts` so the verifier can execute them.

- [ ] **Step 1: Write the failing test**

```javascript
// ------------------------------------------------- the climb
{
  const { MAX_CANDY, sizeFor, heightFor } = await import(
    new URL("../src/features/live/subida.ts", import.meta.url).href
  );
  assert.equal(MAX_CANDY, 20, "ten questions at two candy each");
  assert.equal(sizeFor(0), 1, "a racer starts at base size");
  assert.equal(Math.round(sizeFor(5) * 100) / 100, 2, "five correct is double size");
  assert.equal(sizeFor(10), 3, "ten correct is triple size");
  assert.equal(sizeFor(50), 3, "size is capped, never unbounded");
  assert.ok(sizeFor(3) > sizeFor(2), "size only ever grows with correct answers");
  assert.equal(heightFor(0), 0, "no candy is the ground");
  assert.equal(heightFor(20), 100, "the ceiling is the piñata");
  assert.equal(heightFor(10), 50, "half the candy is half the rope");
  assert.equal(heightFor(999), 100, "height is clamped");

  const layer = readFileSync(new URL("../src/features/live/ClassroomPinataLayer.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(layer, /pinata-col-label/, "the column track is gone");
  assert.doesNotMatch(layer, /difficulty/, "difficulty never appears on the room's screen");
  assert.match(layer, /subida-rope/, "every racer has a rope");
  assert.match(layer, /subida-rail/, "the top three are always on screen");
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — no `subida.ts`

- [ ] **Step 3: Write the pure module**

Create `src/features/live/subida.ts`:

```typescript
// The two numbers the climb is drawn from, kept apart on purpose.
//
// HEIGHT is candy — correctness plus speed. SIZE is correct answers, cumulative,
// so nothing on this screen ever shrinks: a small animal beside a large one has
// answered less, it is not a student being pointed at.

/** Ten questions, two candy each at best. */
export const MAX_CANDY = 20;

/** Nobody grows past three times base — a bigger leader crowds the room out. */
export const MAX_SIZE = 3;

/** Multiplier on the base emoji size. Cumulative: it never goes down. */
export function sizeFor(correctCount: number): number {
  const correct = Math.max(0, Math.floor(Number(correctCount) || 0));
  return Math.min(MAX_SIZE, 1 + 0.2 * correct);
}

/** Percent of the way up the rope. */
export function heightFor(candy: number): number {
  const value = Math.max(0, Math.floor(Number(candy) || 0));
  return Math.max(0, Math.min(100, (value / MAX_CANDY) * 100));
}
```

- [ ] **Step 4: Rebuild the layer's markup**

Rewrite `ClassroomPinataLayer.tsx`'s render. Structure, in order:

- `<header class="subida-top">` — left: `Ronda {index+1} de {question_count}` in an eyebrow and the round countdown from `remainingMs(round.answer_ends_at, now)` in `M:SS`, large; centre: the piñata figure, its damage bar, its lecture name and percent; right: counts — answered this round, candy in the room, present, and blindfolded when non-zero.
- `<div class="subida-field">` — one absolutely-positioned `.subida-rope` per racer at `left: {2.6 + i*3.78}%`, one `.subida-racer` per racer at `bottom: {heightFor(candy)}%` with `font-size: {16 * sizeFor(correct_count)}px` and `z-index: {10 + correct_count}`, and an empty `.subida-floats` layer for Task 10.
- `<div class="subida-lanes">` below the ground line — one vertical name per rope, fixed, `transform: rotate(90deg)`.
- `<aside class="subida-rail">` — the permanent top three by candy, with 🥇🥈🥉, emoji, racer name and candy count.
- The existing commentary line and the footer buttons, unchanged.

Racers are ordered by their stable index in the payload so a racer never changes lane between polls. Sort only inside the rail.

- [ ] **Step 5: Write the styles**

Replace the `.pinata-track` / `.pinata-col` / `.pinata-racer` rules in `src/styles/app.css` with:

```css
/* La Subida — the climb toward the piñata, on the room's screen. */
.subida-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.subida-clock { font-size: 3rem; font-weight: 800; line-height: 1; margin: 0; font-variant-numeric: tabular-nums; }
.subida-field { position: relative; flex: 1; min-height: 0; }
.subida-rope { position: absolute; bottom: 0; width: 1px; height: 100%; background: rgba(255,255,255,0.055); }
.subida-racer { position: absolute; transform: translate(-50%, 0); line-height: 1;
  transition: bottom 640ms cubic-bezier(.34,1.3,.64,1), font-size 460ms ease; }
.subida-lanes { position: relative; height: 76px; }
.subida-lane-name { position: absolute; top: 2px; transform-origin: left top;
  transform: rotate(90deg) translateY(-50%); font-size: 0.46rem; color: #7a8399; white-space: nowrap; }
.subida-rail { position: absolute; right: 0.75rem; top: 6.5rem; width: 142px;
  background: #182034; border-radius: 12px; padding: 0.55rem 0.62rem; }
.subida-rail-row { display: flex; align-items: center; gap: 0.38rem; padding: 0.18rem 0; }
.subida-rail-name { font-size: 0.6rem; line-height: 1.15; flex: 1; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.subida-rail-candy { font-size: 0.62rem; color: #ffd166; font-weight: 700; }
@media (prefers-reduced-motion: reduce) { .subida-racer { transition: none; } }
```

- [ ] **Step 6: Add the strings**

```typescript
  "subida.roundOf": { en: "Round {n} of {total}", es: "Ronda {n} de {total}" },
  "subida.answeredThisRound": { en: "{count} of {total} answered", es: "{count} de {total} respondieron" },
  "subida.candyInRoom": { en: "{count} candy in the room", es: "{count} dulces en el salón" },
  "subida.rail": { en: "Out in front", es: "Van arriba" },
```

- [ ] **Step 7: Run the tests**

Run: `node tools/verify-quiz-race.mjs && node tools/verify-i18n.mjs && npm run typecheck && npm run build`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add -A src tools && git commit -m "feat: rebuild the room's screen as La Subida with ropes, sizes and a permanent top three"
```

---

### Task 10: The three beats and the floating text

Each round's ten-second break is choreographed: the flash, the climb, the spotlight — plus text that rises out of each animal.

**Files:**
- Modify: `src/features/live/ClassroomPinataLayer.tsx`, `src/styles/app.css`, `src/i18n/strings.ts`
- Create: `src/features/live/floats.ts`
- Test: `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: `RaceStatus`, `sizeFor`, `heightFor`.
- Produces: `src/features/live/floats.ts` exporting `FloatSpec = { key: string; racerIndex: number; text: string; color: string; vertical: boolean; delayMs: number }` and `floatsFor(prev: RaceRacer[], next: RaceRacer[], prevTop3: string[], nextTop3: string[]): FloatSpec[]`.

- [ ] **Step 1: Write the failing test**

```javascript
// ------------------------------------------------- floating text
{
  const { floatsFor, RISE_MS, HOLD_MS, FADE_MS } = await import(
    new URL("../src/features/live/floats.ts", import.meta.url).href
  );
  assert.ok(RISE_MS >= 2000, "labels drift slowly enough to read from the back of a room");
  assert.ok(HOLD_MS + FADE_MS < 10_000, "a label is gone before the next round starts");

  const racer = (name, candy, correct) => ({
    racer_name: name, racer_emoji: "🐢", candy, correct_count: correct, finished: false, finish_place: null
  });

  const prev = [racer("Tortuga Veloz", 2, 2), racer("Jaguar Ninja", 4, 3), racer("Rana Zen", 0, 0)];
  const next = [racer("Tortuga Veloz", 4, 3), racer("Jaguar Ninja", 4, 3), racer("Rana Zen", 0, 0)];

  const specs = floatsFor(prev, next, ["Jaguar Ninja"], ["Tortuga Veloz", "Jaguar Ninja"]);

  const gained = specs.filter((s) => s.text === "+2");
  assert.equal(gained.length, 1, "only the racer who earned candy gets a number");
  assert.equal(gained[0].vertical, false, "candy numbers read flat");
  assert.equal(gained[0].racerIndex, 0, "the number belongs to the racer who earned it");

  const streak = specs.find((s) => s.text.includes("seguidas"));
  assert.ok(streak, "a streak reaching three is called out");
  assert.equal(streak.vertical, true, "phrases are set vertically so they stay in their lane");

  const promoted = specs.find((s) => s.text.includes("top 3"));
  assert.ok(promoted, "entering the top three is called out");
  assert.equal(promoted.vertical, true, "and it is a phrase, so it is vertical");

  // Nothing negative, ever.
  const words = specs.map((s) => s.text.toLowerCase()).join(" ");
  for (const banned of ["slow", "last", "behind", "lento", "último", "atrás", "tarde"]) {
    assert.ok(!words.includes(banned), `no label may say "${banned}"`);
  }
  // A racer who earned nothing is silent, not marked.
  assert.equal(specs.filter((s) => s.racerIndex === 2).length, 0, "a racer who missed gets no label at all");
  // Falling out of the top three is never announced.
  const demoted = floatsFor(prev, prev, ["Tortuga Veloz", "Jaguar Ninja"], ["Jaguar Ninja"]);
  assert.equal(demoted.length, 0, "dropping out of the top three produces no label");
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — no `floats.ts`

- [ ] **Step 3: Write the module**

Create `src/features/live/floats.ts`:

```typescript
// The text that rises out of an animal and fades.
//
// Two rules the verifier enforces. Numbers read flat and phrases are rotated,
// because twenty-six lanes sit about nineteen pixels apart and a horizontal
// phrase covers three or four neighbouring ropes — it would appear to belong to
// the wrong animal. And nothing negative ever floats: no label for a wrong
// answer, a broken streak, or a drop out of the top three.
import type { RaceRacer } from "../../api/quiz";

/** Slow enough to read from the back of a room. */
export const RISE_MS = 2600;
export const HOLD_MS = 1500;
export const FADE_MS = 1100;
/** Twenty-six numbers landing at once reads as a wall; staggered it reads as a wave. */
export const STAGGER_MS = 45;

export interface FloatSpec {
  key: string;
  racerIndex: number;
  text: string;
  color: string;
  vertical: boolean;
  delayMs: number;
}

const CANDY_COLOR = "#7ee7a6";
const GOLDEN_COLOR = "#ffd166";
const STREAK_COLOR = "#ff9d5c";
const TOP3_COLOR = "#c4a6ff";

export function floatsFor(
  prev: RaceRacer[],
  next: RaceRacer[],
  prevTop3: string[],
  nextTop3: string[]
): FloatSpec[] {
  const before = new Map(prev.map((racer) => [racer.racer_name, racer]));
  const specs: FloatSpec[] = [];
  const streaks = new Map<string, number>();

  next.forEach((racer, index) => {
    const was = before.get(racer.racer_name);
    if (!was) return;
    const gained = racer.candy - was.candy;
    if (gained <= 0) return;

    // The candy number, flat, staggered across the lanes.
    specs.push({
      key: `candy:${racer.racer_name}:${racer.correct_count}`,
      racerIndex: index,
      text: `+${gained}`,
      color: gained >= 2 ? GOLDEN_COLOR : CANDY_COLOR,
      vertical: false,
      delayMs: 40 + (index % 13) * STAGGER_MS
    });

    // A streak at every third correct answer, as a phrase, after the climb.
    const streak = racer.correct_count;
    if (streak > 0 && streak % 3 === 0) {
      const order = streaks.size;
      streaks.set(racer.racer_name, streak);
      specs.push({
        key: `streak:${racer.racer_name}:${streak}`,
        racerIndex: index,
        text: `🔥 ${streak} seguidas`,
        color: STREAK_COLOR,
        vertical: true,
        delayMs: 900 + order * 160
      });
    }
  });

  // Entering the top three is celebrated. Leaving it is not mentioned.
  const wasTop = new Set(prevTop3);
  for (const name of nextTop3) {
    if (wasTop.has(name)) continue;
    const index = next.findIndex((racer) => racer.racer_name === name);
    if (index < 0) continue;
    specs.push({
      key: `top3:${name}:${next[index].candy}`,
      racerIndex: index,
      text: "🚀 al top 3",
      color: TOP3_COLOR,
      vertical: true,
      delayMs: 1250
    });
  }

  return specs;
}
```

- [ ] **Step 4: Render the floats and the beats**

In `ClassroomPinataLayer.tsx`:

1. Keep the previous poll's racers in a ref. On each poll, call `floatsFor` and push the results into a `floats` state array, scheduling their removal after `HOLD_MS + FADE_MS + 200`.
2. Render each float in `.subida-floats` as an outer wrapper anchored at `left: {lane}%; bottom: calc({heightFor(candy)}% + {16 * sizeFor(correct) + 9}px)` — **the animal's height plus its own size plus a gap**, so a leader's label is never behind its own emoji. The wrapper carries the upward drift; an inner `<span>` carries the rotation for vertical labels.
3. Beat 1, on a poll where `round.phase` flips to `break`: add a green ring to every racer whose `correct_count` rose, for 900 ms. Racers whose count did not rise are left **untouched** — never dimmed. Jolt the piñata once.
4. Beat 2, 620 ms later: the racers' new `bottom` and `font-size` already animate via the CSS transition in Task 9; nothing extra is needed beyond letting the state update land here.
5. Beat 3, 1500 ms later: the spotlight card over the rail, showing the biggest single gainer of the round.

- [ ] **Step 5: Write the styles**

```css
.subida-floats { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.subida-float { position: absolute; height: 0; opacity: 1;
  transition: transform 2600ms linear, opacity 1100ms ease; }
.subida-float span { position: absolute; bottom: 0; left: 0; font-weight: 800; white-space: nowrap;
  text-shadow: 0 1px 4px rgba(0,0,0,0.95); }
.subida-float.flat span { font-size: 0.75rem; transform: translateX(-50%); }
.subida-float.vertical span { font-size: 0.6rem; writing-mode: vertical-rl;
  transform: rotate(180deg); margin-left: -5px; }
.subida-racer.hit { filter: drop-shadow(0 0 8px #4ade80); }
.subida-spot { position: absolute; right: 0.75rem; top: 6.5rem; width: 142px; background: #1b2338;
  border: 1px solid #ffd166; border-radius: 12px; padding: 0.6rem; text-align: center;
  transition: opacity 240ms ease, transform 240ms ease; }
@media (prefers-reduced-motion: reduce) {
  .subida-float { transition: opacity 400ms ease; transform: translateY(-28px) !important; }
  .subida-racer.hit { filter: none; }
}
```

- [ ] **Step 6: Run the tests**

Run: `node tools/verify-quiz-race.mjs && node tools/verify-i18n.mjs && npm run typecheck && npm run build`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add -A src tools && git commit -m "feat: choreograph the round break and float candy, streaks and promotions"
```

---

### Task 11: The finale and the racer podium

**Files:**
- Modify: `src/features/live/ClassroomPinataLayer.tsx`, `src/styles/app.css`, `src/i18n/strings.ts`
- Test: `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: `RaceStatus`, `sizeFor`, `heightFor`, the existing `podium` prop and `onShowPodium` callback.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

```javascript
// ------------------------------------------------- the finale
{
  const layer = readFileSync(new URL("../src/features/live/ClassroomPinataLayer.tsx", import.meta.url), "utf8");
  assert.match(layer, /subida-podium/, "the finale ends on a racer podium");
  assert.match(layer, /everyonePops|subida-pop/, "every animal pops at the close");
  assert.match(layer, /podium\.showToClass/, "the score podium is still one button away");
  const strings = readFileSync(new URL("../src/i18n/strings.ts", import.meta.url), "utf8");
  assert.match(strings, /subida\.wonThePinata/, "the winner line exists in both languages");
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — `the finale ends on a racer podium`

- [ ] **Step 3: Implement the finale**

When the poll reports `state === "closed"`, stop polling and run:

1. **Everyone pops** — every racer, including racers with zero candy, scales to 1.5× and back over 260 ms, staggered 38 ms apart, each with a `🍬` float. The burst belongs to the room; a finale that celebrated only the leaders would undo the care taken everywhere else.
2. **Candy rain** — reuse the existing `.pinata-rain` markup and `pinata-fall` keyframes for about four seconds. Skipped entirely under `prefers-reduced-motion`.
3. **The racer podium**, 1500 ms in — fade out the field, the ground, the lane names and the rail, and fade in three steps in the order second, first, third, with the racers ranked by candy. Each step shows the emoji large, the racer name, and the candy count. Line: `t("subida.wonThePinata", { name })`.

The footer keeps **Show the winners** (enabled once `podium.length`) and **Back to class**. The racer podium ranks by candy under secret names; the existing `ClassroomPodiumLayer` ranks by score under real names. They may list different students — that is expected, and neither replaces the other.

- [ ] **Step 4: Add the strings and styles**

```typescript
  "subida.wonThePinata": { en: "🏆 {name} took the piñata!", es: "🏆 ¡{name} se llevó la piñata!" },
  "subida.podiumTitle": { en: "The climb", es: "La subida" },
```

```css
.subida-podium { position: absolute; inset: 5.75rem 0 2.75rem; display: flex; align-items: flex-end;
  justify-content: center; gap: 1rem; transition: opacity 700ms ease; }
.subida-podium-step { display: flex; flex-direction: column; align-items: center; gap: 0.38rem; width: 132px; }
.subida-podium-block { width: 100%; border-radius: 10px 10px 0 0; display: flex; justify-content: center;
  align-items: flex-start; padding-top: 0.5rem; font-size: 1.25rem; background: #2b3550; color: #f2f5fc; }
.subida-podium-step.first .subida-podium-block { background: #ffd166; color: #5a4300; }
.subida-pop { animation: subida-pop 260ms cubic-bezier(.2,1.6,.4,1); }
@keyframes subida-pop { 50% { transform: translate(-50%, -14px) scale(1.5); } }
@media (prefers-reduced-motion: reduce) { .subida-pop { animation: none; } }
```

- [ ] **Step 5: Run the tests**

Run: `node tools/verify-quiz-race.mjs && node tools/verify-i18n.mjs && npm run typecheck && npm run build`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add -A src tools && git commit -m "feat: pop every animal at the close and finish on the racer podium"
```

---

### Task 12: Sound

This reverses the "no sound, ever" rule in the 2026-08-19 spec. Visuals cannot reach a student looking at a phone; the sting at the round close can.

**Files:**
- Create: `src/features/live/sound.ts`
- Modify: `src/features/live/ClassroomPinataLayer.tsx`, `src/i18n/strings.ts`, `src/styles/app.css`
- Test: `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `sound.unlock()`, `sound.cue(name: "tick" | "hurry" | "close" | "burst" | "pop")`, `sound.setMuted(muted: boolean)`, `sound.isMuted(): boolean` — all no-ops when muted or when the browser has no `AudioContext`.

- [ ] **Step 1: Write the failing test**

```javascript
// ------------------------------------------------- sound
{
  const source = readFileSync(new URL("../src/features/live/sound.ts", import.meta.url), "utf8");
  assert.match(source, /AudioContext/, "sound is synthesized in the browser");
  assert.doesNotMatch(source, /\.mp3|\.wav|\.ogg/, "no audio files — Kahoot's music is licensed and cannot be used");
  assert.match(source, /localStorage/, "the mute choice survives a reload");

  const layer = readFileSync(new URL("../src/features/live/ClassroomPinataLayer.tsx", import.meta.url), "utf8");
  assert.match(layer, /sound\.cue\("close"\)/, "the round close has a sting — the cue that lifts 26 heads");
  assert.match(layer, /sound\.cue\("burst"\)/, "the burst has a jingle");
  assert.match(layer, /subida\.mute/, "the layer has a visible mute");

  const player = readFileSync(new URL("../src/features/quiz/Player.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(player, /sound\./, "phones stay silent — all sound is on the room's screen");
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — no `sound.ts`

- [ ] **Step 3: Write the mixer**

Create `src/features/live/sound.ts`. It must:

- Lazily create one `AudioContext` on `unlock()`, called from the professor's click on **Start the quiz** — that click is the user gesture browsers require, and without it every later cue is silently dropped.
- Synthesize every cue with oscillators and gain envelopes. No files: Kahoot's music is licensed and cannot be used, and a tick that accelerates is a few dozen lines with no licensing question attached.
- Expose `tick` (a short click), `hurry` (a faster, higher tick for the last ten seconds), `close` (a two-note sting), `burst` (a short rising arpeggio), `pop` (a soft blip for the finale wave).
- Read and write mute from `localStorage` under a stable key, defaulting to unmuted.
- Return immediately and harmlessly when muted, when no context exists, or when `AudioContext` is undefined.

- [ ] **Step 4: Wire the cues**

In `ClassroomPinataLayer.tsx`: call `sound.unlock()` on mount, `sound.cue("tick")` once per second while `phase === "answering"` with more than ten seconds left, `sound.cue("hurry")` in the final ten, `sound.cue("close")` the instant the phase flips to `break`, `sound.cue("burst")` on the burst transition, and `sound.cue("pop")` per animal during the finale wave. Add a mute button to the footer using `t("subida.mute")` / `t("subida.unmute")`.

In `EndOfClass.tsx`, call `sound.unlock()` inside `onStart` before `startClassQuiz` resolves.

- [ ] **Step 5: Add the strings**

```typescript
  "subida.mute": { en: "Mute", es: "Silenciar" },
  "subida.unmute": { en: "Unmute", es: "Activar sonido" },
```

- [ ] **Step 6: Run the tests**

Run: `node tools/verify-quiz-race.mjs && node tools/verify-i18n.mjs && npm run typecheck && npm run build`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add -A src tools && git commit -m "feat: add synthesized room sound with a sting at every round close"
```

---

### Task 13: Commentary, docs, deploy and the live run-through

**Files:**
- Modify: `src/features/quiz/commentary.ts`, `tools/verify-quiz-race.mjs`, `docs/05-status.md`, `docs/07-pitfalls.md`
- Test: `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

```javascript
// ------------------------------------------------- commentary
{
  const { raceEvents, chantLine, BANNED_WORDS, roundHitLine } = await import(
    new URL("../src/features/quiz/commentary.ts", import.meta.url).href
  );
  assert.equal(roundHitLine(19, 26, "es"), "🍬 19 de 26 le pegaron a la piñata", "the round's hit count reads plainly");
  assert.equal(roundHitLine(19, 26, "en"), "🍬 19 of 26 hit the piñata", "and in English");

  // Ten thousand generated lines, no banned word anywhere.
  let lines = [];
  for (let seed = 0; seed < 10_000; seed++) {
    lines.push(roundHitLine(seed % 27, 26, seed % 2 ? "es" : "en"));
  }
  const joined = lines.join(" ").toLowerCase();
  for (const banned of BANNED_WORDS) {
    assert.ok(!joined.includes(banned), `no generated line may contain "${banned}"`);
  }
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — `roundHitLine is not a function`

- [ ] **Step 3: Update the commentary module**

Add `roundHitLine(correct: number, total: number, lang: Lang): string` and adapt `RaceSnap` / `RacerView` to the new racer shape (`candy`, `correct_count` in place of `position`, `answered`). Keep the chants, the song lines, the burst line and the banned-word list exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tools/verify-quiz-race.mjs`
Expected: PASS

- [ ] **Step 5: Full verification**

Run: `npm run verify && npm run typecheck && npm run build`
Expected: all verifiers pass, no type errors, build succeeds.

- [ ] **Step 6: Write the status entry**

Add a dated section at the top of `docs/05-status.md` describing: the room clock replacing the carry-over budget, the 4/3/3 deal with a fair shuffle, grading against all ten questions and the removal of the grade's speed bonus, candy as the race, the piñata cracking on correctness at 70%, La Subida, and sound. Note explicitly that class averages will drop because the denominator changed, so it is not read as a regression later. Record any pitfalls met in `docs/07-pitfalls.md`.

- [ ] **Step 7: Deploy the backend**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io
npx supabase db push
npx supabase functions deploy course-activity-attempt
npx supabase functions deploy course-class-quiz
npx supabase functions deploy course-pulse
```

- [ ] **Step 8: Live run-through**

In an **empty group — 501 or 502, never 402, which holds about twenty-six real students. Check People first.** Start a class, check two phones in, start the quiz, and confirm:

- both phones show the same question index at the same second;
- the countdown matches the screen;
- at 40 s both phones flip to the reveal and the screen flashes, climbs and spotlights;
- one phone answers inside 20 s and earns 2 candy; the other answers late and earns 1;
- one phone misses a round entirely and the grade counts it wrong;
- the mute button silences the sting and survives a reload;
- at the close every animal pops, candy rains, the racer podium appears, and **Show the winners** still opens the score podium;
- the review list with explanations appears under the exit ticket.

- [ ] **Step 9: Commit**

```bash
cd ~/Documents/GitHub/Tec\ Hub/course-platform && git add -A && git commit -m "docs: record La Subida and the grading change in status"
```

---

## Self-Review

**Spec coverage.** Room clock → Task 2, 7. Questions 4/3/3 shuffled per student → Task 1. Fair shuffle → Task 1. Grading denominator and speed bonus → Task 5. Candy → Tasks 2, 4. Piñata on correctness at 70% → Task 3. Migration → Task 4. Answer stamping and settle-on-read → Task 4. `race` / `course-pulse` → Task 6. Phone reveal → Task 7. Review list with explanations → Task 8. La Subida layout, fixed vertical lane names, permanent top three, no difficulty → Task 9. Three beats, floating text, numbers flat and phrases vertical, labels above the emoji, nothing negative → Task 10. Finale, everyone pops, racer podium, two podiums in order → Task 11. Sound → Task 12. Commentary and banned words → Task 13. Late joiners are covered by `roundAt` in Task 2 and the grading rule in Task 5. Reduced motion is covered in Tasks 9, 10, 11.

**Placeholders.** None. Tasks 6, 9, 10, 11 and 12 describe UI and edge-function work in prose rather than complete listings, because each rewrites an existing file whose surrounding code the implementer must read; every one of them names the exact file, the exact structure, and the exact assertions that gate it.

**Type consistency.** `pinataState` takes `correct` (not `hits`) from Task 3 onward, and Task 6 is the only caller. `RaceRacer` drops `position`/`answered` and gains `candy`/`correct_count` in Task 6; Tasks 9, 10 and 13 use only the new shape. `sizeFor`/`heightFor` are defined in Task 9 and used in Tasks 10 and 11. `RISE_MS`/`HOLD_MS`/`FADE_MS` are defined in Task 10 and used only there. `windowFor`/`roundAt`/`candyFor` are defined in Task 2 and consumed by Task 4's `settleAttempt` and Task 6's read surfaces.
