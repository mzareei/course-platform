// The piñata race, the carry-over timer, and the 40-word exit ticket.
// Pure modules are imported and executed; wiring is grepped. Sections are
// appended task by task — see docs/superpowers/plans/2026-08-19-end-of-class-quiz-pinata-race.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backendPath, backendUrl, skipWithoutBackend } from "./lib/backend-root.mjs";

if (skipWithoutBackend("verify-quiz-race")) process.exit(0);

const fn = (name) => backendPath(`supabase/functions/${name}`);
const backend = (name) => backendUrl(`supabase/functions/${name}`);
const frontend = (rel) => new URL(`../${rel}`, import.meta.url);

// ------------------------------------------------- exit ticket: 40 words
{
  const migration = readFileSync(backendPath("supabase/migrations/0055_reflection_min_words_40.sql"), "utf8");
  assert.match(migration, /set default 40/, "the column default must become 40");
  assert.match(migration, /reflection_min_words = 40/, "open sessions must be moved to 40");
  assert.match(migration, /not in \('closed', 'cancelled'\)/, "closed sessions keep their historical minimum");

  const exitTicket = readFileSync(fn("course-exit-ticket/index.ts"), "utf8");
  assert.match(exitTicket, /defaultReflectionMinWords = 40/, "course-exit-ticket default must be 40");

  const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");
  assert.match(pulse, /reflection_min_words \?\? 40/, "course-pulse fallback must be 40");
}

// ------------------------------------------------- racer names
{
  const { ANIMALS, ADJECTIVES, pickRacerName } = await import(backend("_shared/racer-names.ts").href);
  assert.ok(ANIMALS.length * ADJECTIVES.length >= 900, "at least 900 combinations");
  const names = new Set(ANIMALS.map((a) => a.name));
  assert.equal(names.size, ANIMALS.length, "animal names are unique");
  for (const a of ANIMALS) assert.ok(a.emoji && a.emoji.length > 0, `${a.name} has an emoji`);
  assert.equal(new Set(ADJECTIVES).size, ADJECTIVES.length, "adjectives are unique");

  // Exhaustion-safe and never repeats: draw 500 names, all distinct, none reused.
  const used = [];
  for (let i = 0; i < 500; i++) {
    const pick = pickRacerName(used);
    assert.ok(pick, `pick ${i} succeeded`);
    assert.ok(!used.includes(pick.name), "never returns a used name");
    assert.match(pick.name, /^\S+ \S+$/, "name is Animal Adjective");
    used.push(pick.name);
  }
  // A fully-used pool returns null rather than looping forever.
  const all = [];
  for (const a of ANIMALS) for (const adj of ADJECTIVES) all.push(`${a.name} ${adj}`);
  assert.equal(pickRacerName(all), null, "an exhausted pool yields null");
}

// ------------------------------------------------- piñata maths
{
  const { BURST_PERCENT, pinataState } = await import(backend("_shared/pinata.ts").href);
  assert.equal(BURST_PERCENT, 85, "the piñata bursts at 85%");
  assert.equal(pinataState({ hits: 0, started: 0, questionCount: 12 }).percent, 0, "nobody started → 0%");
  assert.equal(pinataState({ hits: 156, started: 26, questionCount: 12 }).percent, 50, "156 of 312 → 50%");
  assert.equal(pinataState({ hits: 500, started: 26, questionCount: 12 }).percent, 100, "clamped to 100");
  assert.equal(pinataState({ hits: 266, started: 26, questionCount: 12 }).burst, true, "85% bursts");
  assert.equal(pinataState({ hits: 262, started: 26, questionCount: 12 }).burst, false, "84% does not");
  assert.equal(
    pinataState({ hits: 100, started: 26, questionCount: 12, closedReason: "everyone" }).burst,
    true,
    "a room where everyone finished broke it, whatever the percent"
  );
  assert.equal(
    pinataState({ hits: 262, started: 26, questionCount: 12, closedReason: "time" }).burst,
    false,
    "closing by time does not burst below the threshold"
  );
}

// ------------------------------------------------- migration 0056
{
  const migration = readFileSync(backendPath("supabase/migrations/0056_quiz_pinata_race.sql"), "utf8");
  for (const needle of [
    "racer_name text",
    "racer_emoji text",
    "progress_position int not null default 0",
    "progress_answered int not null default 0",
    "student_attempts_racer_name_key",
    "create table if not exists public.quiz_cheers",
    "alter table public.quiz_cheers enable row level security",
    "revoke all on public.quiz_cheers from anon, authenticated"
  ]) {
    assert.ok(migration.includes(needle), `0056 must contain: ${needle}`);
  }
}

// ------------------------------------------------- course-activity-attempt wiring
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /from "\.\.\/_shared\/racer-names\.ts"/, "imports the racer-name generator");
  assert.match(attempt, /report_progress/, "has the report_progress action");
  assert.match(attempt, /"cheer"/, "has the cheer action");
  assert.match(attempt, /Wait a moment before the next cheer\./, "cheer enforces the cooldown server-side");
  assert.match(attempt, /nobody_left/, "cheer reports an empty room");
  assert.match(attempt, /progress_position: questionCount/, "submit stamps final progress position");
  assert.match(attempt, /racer_name, racer_emoji/, "attempt selects carry the racer identity");
  assert.match(attempt, /\.is\("racer_name", null\)/, "racer assignment cannot overwrite an existing name");
}

// ------------------------------------------------- course-class-quiz race action
{
  const quiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
  assert.match(quiz, /case "race":/, "router exposes the race action");
  assert.match(quiz, /from "\.\.\/_shared\/pinata\.ts"/, "race uses the shared piñata formula");
  assert.match(quiz, /finish_place/, "race ranks finishers by submitted_at");
  assert.match(quiz, /🎒 Mochila/, "an unnamed attempt is labelled, never hidden");
}

// ------------------------------------------------- course-pulse my_race
{
  const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");
  assert.match(pulse, /my_race/, "the student poll carries my_race");
  assert.match(pulse, /from "\.\.\/_shared\/pinata\.ts"/, "the phone and the room share one piñata formula");
}

// ------------------------------------------------- the carry-over budget
{
  const { deadlines, positionAt } = await import(frontend("src/features/quiz/budget.ts").href);
  const t0 = 1_000_000;
  // 30/30/45/30: cumulative deadlines, so saved time visibly rolls forward.
  const dl = deadlines([30, 30, 45, 30], t0);
  assert.deepEqual(dl, [t0 + 30_000, t0 + 60_000, t0 + 105_000, t0 + 135_000], "deadlines are cumulative");
  // Answering Q1 at 25s leaves 35s on Q2 — the spec's example.
  assert.equal(dl[1] - (t0 + 25_000), 35_000, "25s on Q1 leaves 35s for Q2");
  assert.equal(positionAt(dl, t0 + 5_000), 0, "before the first deadline you are on Q1");
  assert.equal(positionAt(dl, t0 + 30_000), 1, "at the deadline you have moved on");
  // A phone asleep through three deadlines lands on the right question in one call.
  assert.equal(positionAt(dl, t0 + 110_000), 3, "skip-forward over missed questions");
  assert.equal(positionAt(dl, t0 + 999_000), 3, "clamped to the final question");
}

// ------------------------------------------------- the player
{
  const player = readFileSync(frontend("src/features/quiz/Player.tsx"), "utf8");
  assert.match(player, /from "\.\/budget"/, "the player uses the shared budget module");
  assert.match(player, /reportProgress\(/, "the player pings progress");
  assert.match(player, /quiz\.letsGo/, "the splash has a Let's go button");
  assert.ok(!/setQuestionDeadline/.test(player), "the per-question deadline state is gone — the budget rules");
}

// ------------------------------------------------- the phone's done card
{
  const card = readFileSync(frontend("src/features/quiz/PinataCard.tsx"), "utf8");
  assert.match(card, /pinata\.cheerButton/, "the card has the cheer button");
  assert.match(card, /cheerRacer\(/, "the button calls the cheer action");
  const live = readFileSync(frontend("src/screens/student/Live.tsx"), "utf8");
  assert.match(live, /myRace=\{/, "Live hands my_race to the player");
}

// ------------------------------------------------- the announcer
{
  const c = await import(frontend("src/features/quiz/commentary.ts").href);
  assert.equal(c.SONG_25, "🎶 Dale, dale, dale…");
  assert.equal(c.SONG_50, "🎶 …no pierdas el tino…");
  assert.equal(c.SONG_75, "🎶 …porque si lo pierdes…");
  assert.equal(c.BURST_LINE, "🎶 …¡pierdes el camino! — ¡SE ROMPIÓ! 🪅💥");

  const racer = (name, emoji, position, finished = false, place = null) =>
    ({ racer_name: name, racer_emoji: emoji, position, answered: position, finished, finish_place: place });
  const snap = (percent, racers, extra = {}) =>
    ({ percent, burst: false, closed_reason: null, state: "live", racers, cheers: [], ...extra });

  const pack = [
    racer("Perezoso Zen", "🦥", 0), racer("Ardilla Turbo", "🐿️", 1), racer("Delfín Zen", "🐬", 2),
    racer("Caballo Épico", "🐴", 4), racer("Pulpo Ninja", "🐙", 5), racer("Rana Viral", "🐸", 5),
    racer("Águila Jedi", "🦅", 6), racer("Abeja Zen", "🐝", 6), racer("Coyote Astral", "🐺", 7),
    racer("Oso Genial", "🐻", 8), racer("Ajolote Veloz", "🦎", 11, true, 1), racer("Jaguar Audaz", "🐆", 11, true, 2)
  ];

  // Milestones fire once each, in order, on crossings.
  let events = c.raceEvents(snap(20, pack), snap(55, pack), "en");
  assert.ok(events.includes(c.SONG_25) && events.includes(c.SONG_50), "crossed milestones sing");
  // A new finisher gets a candy line; a new cheer gets a porra line.
  const before = snap(50, pack);
  const after = snap(52, pack.map((r) => r.racer_name === "Oso Genial" ? { ...r, finished: true, finish_place: 3 } : r),
    { cheers: [{ from_name: "Ajolote Veloz", from_emoji: "🦎", to_name: "Perezoso Zen", to_emoji: "🦥", at: "x" }] });
  events = c.raceEvents(before, after, "en");
  assert.ok(events.some((l) => l.includes("Oso Genial") && l.includes("🍬")), "finisher line");
  assert.ok(events.some((l) => l.includes("cheers for")), "cheer line");
  // Closing by time without a burst is a near-miss, never a defeat-shame.
  events = c.raceEvents(snap(71, pack), snap(71, pack, { state: "closed", closed_reason: "time" }), "en");
  assert.ok(events.some((l) => l.includes("¡Casi!")), "the time close says casi");

  // 10,000 chants: never a banned word, never the same target twice running.
  let seed = 42;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let lastTarget = null;
  for (let i = 0; i < 10000; i++) {
    const chant = c.chantLine(snap(40, pack), lastTarget, rng);
    assert.ok(chant, "a live pack always has someone to cheer");
    for (const word of c.BANNED_WORDS) {
      assert.ok(!chant.line.toLowerCase().includes(word), `banned word "${word}" in: ${chant.line}`);
    }
    assert.notEqual(chant.target, lastTarget, "never the same racer twice in a row");
    lastTarget = chant.target;
  }
  // Every event template is also banned-word-free.
  for (const line of events) {
    for (const word of c.BANNED_WORDS) assert.ok(!line.toLowerCase().includes(word), `banned word in event: ${line}`);
  }
}

// ------------------------------------------------- the room's screen
{
  const layer = readFileSync(frontend("src/features/live/ClassroomPinataLayer.tsx"), "utf8");
  assert.match(layer, /classQuizRace\(/, "the layer polls the race action");
  assert.match(layer, /raceEvents\(/, "poll diffs feed the announcer");
  assert.match(layer, /chantLine\(/, "idle time cheers the back of the pack");
  assert.match(layer, /Escape/, "Escape closes the layer");
  assert.match(layer, /prefers-reduced-motion|reducedMotion/, "candy rain respects reduced motion");
  const endOfClass = readFileSync(frontend("src/screens/instructor/EndOfClass.tsx"), "utf8");
  assert.match(endOfClass, /ClassroomPinataLayer/, "End of Class mounts the layer");
  assert.match(endOfClass, /setShowingPinata\(true\)/, "the layer opens on start/adopt");
}

console.log("verify-quiz-race passed");
