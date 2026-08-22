// The piñata race, the room clock, and the 40-word exit ticket.
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

  // The third argument was `position` until the track became La Subida. Every
  // student is on the same question in the same round now, so the announcer
  // reads height on the climb instead: candy, with the correct answers that
  // earned it. The bottom third of the pack is still the bottom third.
  const racer = (name, emoji, candy, finished = false, place = null) =>
    ({ racer_name: name, racer_emoji: emoji, candy, correct_count: Math.ceil(candy / 2), finished, finish_place: place });
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

// ------------------------------------------------- the climb
{
  const {
    CANDY_PER_QUESTION, FALLBACK_MAX_CANDY, MAX_SIZE, MAX_LANES, BOB_MS,
    BASE_EMOJI_PX, SETTLE_MARGIN_MS, ceilingFor, sizeFor, heightFor, lanePercent,
    laneKeys, laneRoster, laneCountFor, topThree, bobDelayMs, roundCountIsSettled
  } = await import(frontend("src/features/live/subida.ts").href);

  // The ceiling is the SERVER's question quota, never a constant of ours. The
  // plan's brief said MAX_CANDY = 20; Task 6 had just finished cleaning up a
  // frontend default of 12 questions against a dealt 10, and a hardcoded 20
  // here would pin every racer at the top of the rope the day the professor
  // changes the quota. The per-question ceiling still has to agree with the
  // backend that hands out the candy, so both sides are executed here.
  const { CANDY_GOLDEN } = await import(backend("_shared/rounds.ts").href);
  assert.equal(CANDY_PER_QUESTION, CANDY_GOLDEN, "the climb's ceiling uses the server's best-case candy");
  assert.equal(FALLBACK_MAX_CANDY, 20, "a payload with no question count falls back to the ten-question deal");
  assert.equal(ceilingFor(10), 20, "ten questions at two candy each");
  assert.equal(ceilingFor(12), 24, "a twelve-question quota raises the ceiling with it");
  assert.equal(ceilingFor(null), FALLBACK_MAX_CANDY, "a stale payload still draws a climb");
  assert.equal(ceilingFor(0), FALLBACK_MAX_CANDY, "so does an instance that reports no questions");

  assert.equal(MAX_SIZE, 3, "nobody grows past three times base");
  assert.equal(sizeFor(0), 1, "a racer starts at base size");
  assert.equal(Math.round(sizeFor(5) * 100) / 100, 2, "five correct is double size");
  assert.equal(sizeFor(10), 3, "ten correct is triple size");
  assert.equal(sizeFor(50), 3, "size is capped, never unbounded");
  assert.ok(sizeFor(3) > sizeFor(2), "size only ever grows with correct answers");
  assert.equal(sizeFor(-4), 1, "a nonsense count never shrinks a racer below base");

  assert.equal(heightFor(0, 10), 0, "no candy is the ground");
  assert.equal(heightFor(20, 10), 100, "the ceiling is the piñata");
  assert.equal(heightFor(10, 10), 50, "half the candy is half the rope");
  assert.equal(heightFor(999, 10), 100, "height is clamped");
  assert.equal(heightFor(20, null), 100, "with no question count the ten-question rope is the fallback");
  // The drift the ruling exists to prevent.
  assert.ok(heightFor(20, 12), "a twelve-question class still climbs");
  assert.ok(heightFor(20, 12) < 100, "a bigger quota is a longer rope, not a full one");
  assert.equal(heightFor(24, 12), 100, "and its own ceiling is still the piñata");

  // Lanes. Twenty-six racers is the class that broke the old column track, and
  // a fixed 3.78% step runs off the right-hand edge at thirty — the roster
  // decides the spacing.
  for (const total of [1, 2, 7, 26, 40]) {
    for (let i = 0; i < total; i++) {
      const left = lanePercent(i, total);
      assert.ok(left >= 0 && left <= 100, `lane ${i} of ${total} stays inside the field (${left}%)`);
      if (i > 0) assert.ok(left > lanePercent(i - 1, total), "lanes keep the field's order");
    }
  }

  const racer = (name, candy, correct) => ({
    racer_name: name, racer_emoji: "🐢", candy, correct_count: correct, finished: false, finish_place: null
  });
  const field = [racer("Rana Zen", 1, 1), racer("Jaguar Ninja", 9, 5), racer("Tortuga Veloz", 4, 4), racer("Oso Genial", 9, 3)];
  const names = (list) => list.map((r) => r.racer_name);
  const asDealt = names(field);

  // The rail sorts; the field never does. `.sort()` on race.racers would
  // reorder every lane on screen.
  const top = topThree(field);
  assert.deepEqual(names(field), asDealt, "the rail must never re-sort the field");
  assert.deepEqual(names(top), ["Jaguar Ninja", "Oso Genial", "Tortuga Veloz"], "top three by candy, then by correct answers");
  assert.equal(topThree([]).length, 0, "an empty room has no rail rows");
  assert.equal(topThree(field.slice(0, 2)).length, 2, "a class of two fills what it can");

  // The idle bob is the fix for "nothing moved": twenty-six animals breathing
  // in unison read as one object, so every lane gets its own phase.
  const delays = new Set(Array.from({ length: 26 }, (_, i) => bobDelayMs(i)));
  assert.equal(delays.size, 26, "no two racers in a full class bob together");
  for (const delay of delays) assert.ok(delay <= 0 && delay > -BOB_MS, "a phase offset is a negative slice of one cycle");

  const css = readFileSync(frontend("src/styles/app.css"), "utf8");
  const layer = readFileSync(frontend("src/features/live/ClassroomPinataLayer.tsx"), "utf8");
  assert.doesNotMatch(layer, /pinata-col-label/, "the column track is gone");
  assert.doesNotMatch(layer, /difficulty/, "difficulty never appears on the room's screen");
  assert.doesNotMatch(layer, /student_identifier|profile_id/, "nothing on this screen maps a racer to a student");
  assert.match(layer, /subida-rope/, "every racer has a rope");
  assert.match(layer, /subida-rail/, "the top three are always on screen");
  assert.match(layer, /subida-lane-name/, "and every rope is labelled at the ground");
  assert.match(layer, /laneRoster\(/, "lanes are handed out once and kept, not recomputed from the payload");
  assert.match(layer, /laneCountFor\(/, "and the field's width is pinned by the room, not by who has started");
  assert.match(layer, /roundCountIsSettled\(/, "the round count is withheld until it belongs to the round on screen");
  assert.doesNotMatch(layer, /key=\{racer\.racer_name\}/,
    "nothing keys on a bare racer name — two unassigned attempts both read \"🎒 Mochila\"");
  assert.match(layer, /heightFor\([^)]*question_count/, "the rope's ceiling comes from the server's question count");
  assert.ok((layer.match(/lanePercent\(/g) || []).length >= 3,
    "rope, animal and ground label all take their lane from one function so they cannot drift apart");

  assert.match(css, /@keyframes subida-bob/, "the idle bob exists at all");
  assert.doesNotMatch(css, /\.pinata-track|\.pinata-col\b/, "the column track's styles are gone with it");

  // ---- Finding 1: the count must never sit under the wrong round number.
  // course-class-quiz derives round_correct from closedRoundIndex, which keeps
  // reporting the PREVIOUS round until the answering window has closed for good
  // — including through the first two seconds of the break, while the grace is
  // still open. Sweeping a whole ten-round quiz against both repos is the only
  // way to prove the screen never prints one round's count under another's.
  const { roundAt, ANSWER_GRACE_MS, BREAK_SECONDS } = await import(backend("_shared/rounds.ts").href);
  const { closedRoundIndex } = await import(backend("_shared/settle.ts").href);
  assert.ok(SETTLE_MARGIN_MS >= ANSWER_GRACE_MS,
    "the screen must wait out at least the server's answer grace");
  assert.ok(SETTLE_MARGIN_MS < BREAK_SECONDS * 1000,
    "and still inside the break, or the count would never appear at all");

  const T0 = 1_700_000_000_000;
  let everSettled = false;
  for (let ms = 0; ms <= 505_000; ms += 250) {
    const at = T0 + ms;
    const live = roundAt(T0, at, 10);
    const view = {
      index: live.index,
      phase: live.phase,
      answer_ends_at: new Date(live.answerEnd).toISOString(),
      break_ends_at: new Date(live.breakEnd).toISOString()
    };
    if (roundCountIsSettled(view, at)) {
      everSettled = true;
      assert.equal(closedRoundIndex(live, at), live.index,
        `at +${ms}ms the count shown must belong to the round the HUD names`);
    }
  }
  assert.ok(everSettled, "the count does appear during the break, it is not withheld forever");
  // Round 1's answering phase is the case a room misreads as nobody getting it.
  const roundOne = roundAt(T0, T0 + 5_000, 10);
  assert.equal(roundOne.index, 0);
  assert.equal(
    roundCountIsSettled({ index: 0, phase: roundOne.phase, answer_ends_at: new Date(roundOne.answerEnd).toISOString(), break_ends_at: new Date(roundOne.breakEnd).toISOString() }, T0 + 5_000),
    false, "round 1 never prints a flat zero while the room is still answering");
  assert.equal(roundCountIsSettled(null, T0), false, "no round, no count");
  assert.equal(roundCountIsSettled({ index: 2, phase: "break", answer_ends_at: "half past four", break_ends_at: "" }, T0),
    false, "an unparseable deadline withholds the number rather than guessing");

  // ---- Finding 2: a late starter must not shove the field sideways.
  const named = (name) => racer(name, 0, 0);
  const early = laneRoster([], [named("Tortuga Veloz"), named("Jaguar Ninja")]);
  const later = laneRoster(early, [named("Jaguar Ninja"), named("Ardilla Turbo"), named("Tortuga Veloz")]);
  assert.deepEqual(later.slice(0, early.length), early,
    "a racer already on the climb keeps the lane it was handed");
  assert.equal(later[later.length - 1], "Ardilla Turbo",
    "the newcomer takes the next free lane, not an alphabetical slot in the middle");
  assert.equal(laneRoster(early, [named("Jaguar Ninja"), named("Tortuga Veloz")]), early,
    "a poll with nothing new returns the roster unchanged");
  // Payload order is untrusted; the roster it produces must not depend on it.
  assert.deepEqual(laneRoster([], [named("Rana Zen"), named("Abeja Sagaz")]),
    laneRoster([], [named("Abeja Sagaz"), named("Rana Zen")]),
    "the same first payload hands out the same lanes whatever order it arrives in");

  // The geometry, not just the ordering: with the room holding the field open,
  // an existing racer's lane percentage is identical before and after.
  const room = 26;
  for (let i = 0; i < early.length; i++) {
    assert.equal(
      lanePercent(i, laneCountFor(early.length, room)),
      lanePercent(i, laneCountFor(later.length, room)),
      "growing the racer array must not move a lane that is already on screen");
  }
  assert.equal(laneCountFor(3, 26), 26, "the room's size holds the field open before everyone has started");
  assert.equal(laneCountFor(30, 26), 30, "but never fewer lanes than there are racers standing in them");
  assert.equal(laneCountFor(0, 0), 1, "an empty room still has a field");
  assert.equal(laneCountFor(4, 5000), MAX_LANES, "a nonsense present cannot shrink the ropes to threads");
  assert.equal(laneCountFor(80, 5000), 80, "and the cap never squeezes out a real racer");

  // ---- Finding 3: two attempts with no racer name yet both read "🎒 Mochila".
  const twins = [racer("🎒 Mochila", 0, 0), racer("Jaguar Ninja", 3, 2), racer("🎒 Mochila", 5, 3)];
  assert.equal(new Set(laneKeys(twins)).size, 3, "two unnamed attempts get two lane keys, not one");
  assert.equal(new Set(laneRoster([], twins)).size, 3, "and two lanes on the field");
  assert.equal(topThree(twins).length, 3, "the rail still ranks all three");
  assert.deepEqual(names(twins), ["🎒 Mochila", "Jaguar Ninja", "🎒 Mochila"], "and the payload is left alone");

  // ---- Finding 4: numbers duplicated between TypeScript and the stylesheet.
  const bob = css.match(/animation:\s*subida-bob\s+([\d.]+)s/);
  assert.ok(bob, "the bob's duration is declared once in the stylesheet");
  assert.equal(Math.round(parseFloat(bob[1]) * 1000), BOB_MS,
    "BOB_MS must equal the CSS cycle, or the phase offsets stop covering one breath");
  const reserve = css.match(/\.subida-sky\s*\{[^}]*padding-top:\s*(\d+)px/);
  assert.ok(reserve, "the sky reserves room above the field");
  assert.ok(Number(reserve[1]) >= BASE_EMOJI_PX * MAX_SIZE,
    `the reserve (${reserve && reserve[1]}px) must cover the tallest racer (${BASE_EMOJI_PX * MAX_SIZE}px) or the leader clips the piñata`);
  // The withheld count leaves a hole; the hole has to be exactly one line tall
  // or the two counts below it move every time the round turns over.
  const countsRule = css.match(/\.subida-counts p \{[^}]*\}/);
  assert.ok(countsRule, "the counts have a rule of their own");
  const lineBox = countsRule[0].match(/line-height:\s*([\d.]+)/);
  const reserved = countsRule[0].match(/min-height:\s*([\d.]+)em/);
  assert.ok(lineBox && reserved, "and both an explicit line box and a reserve");
  assert.equal(reserved[1], lineBox[1],
    "the blank round-count slot must reserve exactly one line, or the counts below it shift every round");

  // Rope, animal and label slide on one shared token, so a name is never under
  // the wrong animal for the length of a transition.
  assert.match(css, /--subida-slide:\s*\d+ms/, "the sideways slide has one duration");
  for (const selector of ["subida-racer", "subida-rope", "subida-lane-name"]) {
    const rule = css.match(new RegExp(`\\.${selector} \\{[\\s\\S]*?\\}`));
    assert.ok(rule && /left var\(--subida-slide\)/.test(rule[0]),
      `.${selector} must slide on the shared duration`);
  }

  const reducedBlocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
  assert.ok(reducedBlocks.some((b) => /\.subida-racer\s*\{[^}]*animation:\s*none/.test(b)), "reduced motion stops the bob");
  assert.ok(reducedBlocks.some((b) => /\.subida-racer\s*\{[^}]*transition:\s*none/.test(b)), "and stops the climb tween");
  assert.ok(reducedBlocks.some((b) => /\.subida-rope,\s*\.subida-lane-name\s*\{[^}]*transition:\s*none/.test(b)),
    "and the sideways slide on the rope and its label with it");
}

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

// ------------------------------------------------- the deal is wired in
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /dealQuestions\(pool, QUOTA\)/, "the deal uses the 4/3/3 quota");
  assert.match(attempt, /shuffle\(optionsByQuestion\.get/, "options use the fair shuffle");
  assert.doesNotMatch(attempt, /maybeShuffle/, "the biased shuffle is gone");
  assert.doesNotMatch(attempt, /function selectQuestions/, "round-robin selection is gone");
}

// ------------------------------------------------- the room clock
{
  const {
    ANSWER_SECONDS, BREAK_SECONDS, ROUND_SECONDS, GOLDEN_SECONDS,
    ANSWER_GRACE_MS, REVEAL_DELAY_MS,
    CANDY_CORRECT, CANDY_GOLDEN, windowFor, roundAt, candyFor, totalSecondsFor
  } = await import(backend("_shared/rounds.ts").href);

  // THE INVARIANT. The grace keeps taking answers for two seconds after the
  // countdown ends; the reveal is held back for three. Invert the two and a
  // scripted client could read its round's correct option and ping it back
  // while the window was still open — the forgery the whole grading path was
  // rebuilt to close. This assertion is the guard rail, not the comment beside
  // the constants.
  assert.ok(
    REVEAL_DELAY_MS > ANSWER_GRACE_MS,
    `the reveal must land strictly after the grace closes (grace ${ANSWER_GRACE_MS}ms, reveal ${REVEAL_DELAY_MS}ms)`
  );
  assert.ok(ANSWER_GRACE_MS > 0, "there is a grace at all");
  assert.ok(REVEAL_DELAY_MS < BREAK_SECONDS * 1000, "the reveal still lands inside the break");

  assert.equal(ANSWER_SECONDS, 40, "forty seconds to answer");
  assert.equal(BREAK_SECONDS, 10, "ten seconds of break");
  assert.equal(ROUND_SECONDS, 50, "a round is fifty seconds");
  assert.equal(GOLDEN_SECONDS, 20, "a golden candy needs an answer inside twenty seconds");

  const T0 = 1_700_000_000_000;

  const first = windowFor(T0, 0, 10);
  assert.equal(first.answerStart, T0, "round 0 answers from the anchor");
  assert.equal(first.answerEnd, T0 + 40_000, "round 0's countdown ends at 40s");
  assert.equal(first.answersCloseAt, T0 + 40_000 + ANSWER_GRACE_MS, "and the last ping for it is accepted a grace later");
  assert.equal(first.breakEnd, T0 + 50_000, "round 0 ends at 50s");
  // The student is told forty seconds and the phase flips at forty seconds:
  // the grace covers flight time, it is not extra time to think.
  assert.equal(roundAt(T0, T0 + 40_000, 10).phase, "break", "the grace does not extend the countdown the room sees");

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

{
  const classQuiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
  assert.match(classQuiz, /totalSecondsFor\(/, "the instance clock is sized from the round schedule");
  assert.doesNotMatch(classQuiz, /estimateTotalSeconds\(/, "the old per-question estimate no longer sizes the quiz");
}

// ------------------------------------------------- settling a closed round
{
  const { settleAttempt } = await import(backend("_shared/settle.ts").href);
  const T0 = 1_700_000_000_000;
  const questions = [
    { id: "q0", correctOptionId: "a0" },
    { id: "q1", correctOptionId: "a1" },
    { id: "q2", correctOptionId: "a2" },
    { id: "q3", correctOptionId: "a3" }
  ];

  // Round 0 correct at 12s (golden). Round 1 wrong. Round 2 correct but at
  // 25s into its round — past golden, still in time. Round 3 correct at 8s
  // into ITS round (golden) despite being 158s after the quiz started.
  //
  // Round 3 is the point of this fixture: a settleAttempt that measured
  // "fast" from the quiz's startedAt instead of from the round's own
  // answerStart would grade q3 as a slow, non-golden answer (158s in) even
  // though it was in fact answered in the first 8 seconds of its round —
  // caught only by having a golden answer in a round other than round 0.
  // Round 2 supplies the matching case for the other direction: a mutant
  // that pays every correct answer the golden rate would overpay round 2.
  //
  // NB: the brief's draft stamped q2 at +5s, which candyFor (correctly)
  // grades as golden — that draft value contradicted its own "plain 1"
  // assertion below, so it is corrected here to +25s.
  const answers = { q0: "a0", q1: "wrong", q2: "a2", q3: "a3" };
  const answerTimes = {
    q0: T0 + 12_000,
    q1: T0 + 50_000 + 30_000,
    q2: T0 + 100_000 + 25_000,
    q3: T0 + 150_000 + 8_000
  };

  // At 130s: rounds 0 and 1 are closed, round 2 is still answering.
  const mid = settleAttempt({
    startedAt: T0, now: T0 + 130_000, questionCount: 4, questions, answers, answerTimes, settledThrough: -1
  });
  assert.equal(mid.correctCount, 1, "only round 0 was right and only rounds 0-1 are settled");
  assert.equal(mid.candy, 2, "answered correctly inside twenty seconds is a golden candy");
  assert.equal(mid.settledThrough, 1, "rounds 0 and 1 are settled");

  // At 210s every round is closed.
  const end = settleAttempt({
    startedAt: T0, now: T0 + 210_000, questionCount: 4, questions, answers, answerTimes, settledThrough: 1
  });
  assert.equal(end.correctCount, 3, "rounds 0, 2, and 3 were correct");
  assert.equal(end.candy, 5, "golden 2 (round 0) + wrong 0 (round 1) + plain 1 (round 2) + golden 2 (round 3)");
  assert.equal(end.settledThrough, 3, "all four rounds are settled");

  // Idempotent: calling again with the same clock changes nothing.
  const again = settleAttempt({
    startedAt: T0, now: T0 + 210_000, questionCount: 4, questions, answers, answerTimes, settledThrough: 3
  });
  assert.deepEqual(again, end, "settling twice is the same as settling once");

  // An answer that arrived after its round closed earns nothing.
  const late = settleAttempt({
    startedAt: T0, now: T0 + 160_000, questionCount: 4, questions,
    answers: { q0: "a0" }, answerTimes: { q0: T0 + 45_000 }, settledThrough: -1
  });
  assert.equal(late.correctCount, 0, "an answer stamped after the 40s window does not count");
  assert.equal(late.candy, 0, "and earns no candy");

  // Nothing answered at all.
  const nothing = settleAttempt({
    startedAt: T0, now: T0 + 160_000, questionCount: 4, questions, answers: {}, answerTimes: {}, settledThrough: -1
  });
  assert.equal(nothing.correctCount, 0, "no answers, no correctness");
  assert.equal(nothing.candy, 0, "no answers, no candy");
}

// ------------------------------------------------- migration 0058
// NB: the brief named this 0057_quiz_la_subida.sql, but 0057 was already
// taken by 0057_quiz_attempt_resume.sql (the same-day kick-resume hotfix,
// see docs/05-status.md "Deploy shape: migration 0057 before the two
// functions") by the time this task ran. Two files sharing one version
// number would make `supabase db push` skip the second silently, so this
// task's migration is 0058 instead.
{
  const migration = readFileSync(backendPath("supabase/migrations/0058_quiz_la_subida.sql"), "utf8");
  for (const needle of [
    "candy int not null default 0",
    "correct_count int not null default 0",
    "round_answer_times jsonb not null default",
    "settled_through int not null default -1"
  ]) {
    assert.ok(migration.includes(needle), `migration 0058 declares ${needle}`);
  }
}

// ------------------------------------------------- answer-time stamping
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /round_answer_times/, "report_progress stamps answer times");
  assert.match(attempt, /mergedAnswerTimes\[questionId\] === undefined/, "the first answer's timestamp is never overwritten");
  assert.match(attempt, /candy, correct_count, settled_through/, "the attempt row exposes the race columns");
}

// ------------------------------------------------- grading counts all ten
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  // Anchored on the statement end so a re-introduced fractional bonus (e.g.
  // "= 0.5") cannot sail past a bare `= 0` prefix match.
  assert.match(attempt, /maxSpeedBonusPercent = 0;/, "speed no longer moves a grade");

  const player = readFileSync(frontend("src/features/quiz/Player.tsx"), "utf8");
  // Not a match on the exact old predicate — any .filter( chained straight
  // onto this map would silently drop dealt-but-unanswered questions again,
  // whatever it filters on (e.g. a re-added `.filter((r) => Boolean(r.selected_option_id))`
  // would sail past a narrower regex tied to the old predicate's text).
  assert.doesNotMatch(
    player,
    /selected_option_id: finalAnswers\[q\.id\] \|\| ""\s*\}\)\)\s*\.filter\(/,
    "the player must submit every dealt question — no filter may follow the responses map, whatever it filters on"
  );
  assert.match(player, /selected_option_id: finalAnswers\[q\.id\] \|\| ""/, "unanswered questions submit an empty selection");
}

// ------------------------------------------------- read surfaces
{
  const classQuiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
  // Both surfaces settle through the one shared helper, which is what makes the
  // piñata a single number rather than two computations that have to be trusted
  // to agree. The chain to the rule itself is asserted below.
  assert.match(classQuiz, /settleRoom\(/, "the race settles closed rounds before answering");
  assert.match(classQuiz, /round_correct/, "the race reports how many got the closed round right");
  assert.match(classQuiz, /roundAt\(/, "the race reports the room's round window");
  assert.doesNotMatch(classQuiz, /progress_position/, "racers are no longer placed by question position");

  const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");
  assert.match(pulse, /settleRoom\(/, "the phone poll settles closed rounds too");
  assert.match(pulse, /last_result/, "the phone poll carries the reveal for the closed round");
  assert.match(pulse, /correct_option_id/, "the reveal names the correct option");

  const room = readFileSync(fn("_shared/settle-room.ts"), "utf8");
  assert.match(room, /settleAttempt\(/, "the shared room settle runs the shared per-round rule");

  // The reveal has two gates and needs both: the break, and the delay that
  // pays for the answer grace.
  const reveal = pulse.match(/const revealDue =[^;]+;[\s\S]*?const revealed =[\s\S]*?;/);
  assert.ok(reveal, "course-pulse computes the reveal in one place");
  assert.match(reveal[0], /phase === "break"|breakRound/, "the reveal is gated on the break");
  assert.match(reveal[0], /REVEAL_DELAY_MS/, "the reveal waits out the answer grace");

  // One piñata, two doors. The screen used to sum freshly settled counts while
  // a phone summed everyone else's stored column — same formula, different
  // inputs, and up to eight points apart at the instant a round closed, which
  // is the one moment the room and a phone are looked at together.
  const pinataArgs = (source, file) => {
    const call = source.match(/pinataState\(\{[\s\S]*?\}\)/);
    assert.ok(call, `${file} calls pinataState`);
    const text = call[0].replace(/\s+/g, " ");
    const pick = (key) => {
      const explicit = text.match(new RegExp(`${key}:\\s*([^,}]+)`));
      if (explicit) return explicit[1].trim();
      // Property shorthand: `questionCount,` is the local of that name.
      return new RegExp(`[{,]\\s*${key}\\s*[,}]`).test(text) ? key : null;
    };
    return { correct: pick("correct"), started: pick("started"), questionCount: pick("questionCount") };
  };
  const screenArgs = pinataArgs(classQuiz, "course-class-quiz");
  const phoneArgs = pinataArgs(pulse, "course-pulse");
  assert.equal(screenArgs.correct, phoneArgs.correct, "both piñata call sites take the numerator from one expression");
  assert.equal(screenArgs.started, phoneArgs.started, "both take the same denominator population");
  assert.match(screenArgs.correct, /settled\.correctInRoom/, "the numerator is the shared room settle, not a local sum");
  for (const [file, args] of [["course-class-quiz", screenArgs], ["course-pulse", phoneArgs]]) {
    assert.match(args.questionCount, /questionCount$/, `${file} sizes the piñata by the room's question count`);
  }

  const api = readFileSync(frontend("src/api/quiz.ts"), "utf8");
  // Read the RaceRacer block itself rather than the whole file: `position` and
  // `answered` are still the honest signature of reportProgress, and a
  // file-wide regex for them proves nothing about the racer.
  const raceRacer = api.match(/export interface RaceRacer \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(raceRacer, "RaceRacer is declared");
  assert.match(raceRacer, /candy: number/, "RaceRacer carries candy");
  assert.match(raceRacer, /correct_count: number/, "RaceRacer carries the correct count");
  assert.doesNotMatch(raceRacer, /position: number|answered: number/, "the old track fields are gone");
  assert.match(api, /round_correct: number/, "RaceStatus carries the flash beat's count");
  assert.match(api, /round: RaceRound \| null/, "RaceStatus carries the room's round");
  // The piñata's damage is correctness now. `hits` was the participation sum,
  // and leaving the word in the type would let a reader believe it still is.
  assert.doesNotMatch(api, /hits: number/, "the piñata no longer reports participation hits");

  const pulseApi = readFileSync(frontend("src/api/pulse.ts"), "utf8");
  assert.match(pulseApi, /export interface PulseQuizRound/, "the phone is typed for the room's round");
  assert.match(pulseApi, /last_result:/, "MyRace carries the break's reveal");
}

// ------------------------------------------------- the reveal only ever describes a closed round
{
  const { settleAttempt } = await import(backend("_shared/settle.ts").href);
  const T0 = 1_700_000_000_000;
  const questions = [
    { id: "q0", correctOptionId: "a0" },
    { id: "q1", correctOptionId: "a1" },
    { id: "q2", correctOptionId: "a2" },
    { id: "q3", correctOptionId: "a3" }
  ];
  const answers = { q0: "a0", q1: "wrong", q2: "a2", q3: "a3" };
  const answerTimes = {
    q0: T0 + 12_000,
    q1: T0 + 50_000 + 30_000,
    q2: T0 + 100_000 + 25_000,
    q3: T0 + 150_000 + 8_000
  };

  // 130s in: rounds 0 and 1 are closed, round 2 is still taking answers. The
  // phone's reveal is built from this list, so round 2 appearing here would
  // hand a student the answer to the question they are still answering.
  const mid = settleAttempt({
    startedAt: T0, now: T0 + 130_000, questionCount: 4, questions, answers, answerTimes, settledThrough: -1
  });
  assert.deepEqual(mid.rounds.map((r) => r.index), [0, 1], "only closed rounds carry per-round detail");
  assert.ok(
    mid.rounds.every((r) => r.index <= mid.settledThrough),
    "no round past the settled cursor is described"
  );
  assert.deepEqual(
    mid.rounds.map((r) => [r.questionId, r.correctOptionId, r.correct, r.candy]),
    [["q0", "a0", true, 2], ["q1", "a1", false, 0]],
    "each closed round names its question, its answer key, the verdict and the candy"
  );

  // The last round closes at 190s; at 210s every round is described.
  const end = settleAttempt({
    startedAt: T0, now: T0 + 210_000, questionCount: 4, questions, answers, answerTimes, settledThrough: 1
  });
  assert.deepEqual(end.rounds.map((r) => r.index), [0, 1, 2, 3], "every closed round is described");
  assert.equal(end.rounds[2].candy, 1, "round 2 was correct but not golden");
  assert.equal(end.rounds[3].candy, 2, "round 3 was correct inside its own twenty seconds");

  // A round nobody answered is still described — as a miss, with no answer of
  // the student's own attached.
  const quiet = settleAttempt({
    startedAt: T0, now: T0 + 210_000, questionCount: 4, questions, answers: {}, answerTimes: {}, settledThrough: -1
  });
  assert.equal(quiet.rounds.length, 4, "an unanswered round still closes");
  assert.ok(quiet.rounds.every((r) => r.answered === false && r.correct === false && r.candy === 0),
    "nothing answered earns nothing");
}

// ------------------------------------------------- one piñata, two doors
// The room total must not depend on which surface asked for it. Before this,
// `race` settled every attempt and summed the fresh counts while a phone
// settled only its own and summed everyone else's stored column: same formula,
// different inputs, ~8 points apart across a class of thirty at the instant a
// round closed. This drives the real settleRoom against a stub database.
{
  const { settleRoom } = await import(backend("_shared/settle-room.ts").href);
  const { closedRoundIndex } = await import(backend("_shared/settle.ts").href);
  const { roundAt } = await import(backend("_shared/rounds.ts").href);
  const T0 = 1_700_000_000_000;
  const COUNT = 10;

  // Three students, ten questions each, dealt in their own order.
  const deal = (offset) => Array.from({ length: COUNT }, (_, k) => ({ id: `q${(k + offset) % COUNT}` }));
  const optionRows = Array.from({ length: COUNT }, (_, k) => ({ id: `right${k}`, question_id: `q${k}` }));
  const answersFor = (deck, rightUpTo) => Object.fromEntries(
    deck.slice(0, rightUpTo).map((q) => [q.id, `right${q.id.slice(1)}`])
  );
  const timesFor = (deck, upTo) => Object.fromEntries(
    deck.slice(0, upTo).map((q, k) => [q.id, T0 + k * 50_000 + 5_000])
  );

  const makeStore = () => {
    const decks = [deal(0), deal(3), deal(7)];
    return decks.map((deck, i) => ({
      id: `a${i}`,
      questions_json: deck,
      progress_answers: answersFor(deck, [10, 6, 0][i]),
      round_answer_times: timesFor(deck, [10, 6, 0][i]),
      settled_through: -1,
      candy: 0,
      correct_count: 0
    }));
  };

  // A stub of the two queries and the one update settleRoom makes.
  const stubDb = (store) => ({
    writes: 0,
    from(table) {
      const q = { table, ids: null, update: null, eqs: {} };
      q.select = () => q;
      q.in = (column, ids) => { q.ids = { column, ids: ids.map(String) }; return q; };
      q.eq = (column, value) => { q.eqs[column] = value; return q; };
      q.update = (values) => { q.update_values = values; return q; };
      q.then = (resolve, reject) => {
        try {
          if (q.update_values) {
            const row = store.find((r) => r.id === q.eqs.id);
            Object.assign(row, {
              candy: q.update_values.candy,
              correct_count: q.update_values.correct_count,
              settled_through: q.update_values.settled_through
            });
            return Promise.resolve(resolve({ error: null }));
          }
          if (table === "question_options") return Promise.resolve(resolve({ data: optionRows, error: null }));
          const rows = store.filter((r) => q.ids.ids.includes(r.id)).map((r) => ({ ...r }));
          return Promise.resolve(resolve({ data: rows, error: null }));
        } catch (e) { return Promise.resolve(reject ? reject(e) : Promise.reject(e)); }
      };
      return q;
    }
  });

  const light = (store) => store.map((r) => ({
    id: r.id, candy: r.candy, correct_count: r.correct_count, settled_through: r.settled_through
  }));
  // 4:25 in: round 5 is still taking answers, so round 4 is the last one shut.
  const NOW = T0 + 265_000;
  const closedIndex = closedRoundIndex(roundAt(T0, NOW, COUNT), NOW);
  assert.equal(closedIndex, 4, "the fixture sits with round 4 closed and round 5 open");
  const call = async (store, needDetailFor) => settleRoom(stubDb(store), {
    rows: light(store), needDetailFor, startedAt: T0, now: NOW, questionCount: COUNT, closedIndex
  });

  // The screen, from cold: it asks for every racer's detail.
  const cold = makeStore();
  const screen = await call(cold, cold.map((r) => r.id));
  assert.ok(screen.correctInRoom > 0, "the fixture has correct answers to count");

  // A phone, from the SAME cold state, asking only for its own detail. It must
  // still reach the screen's number, because settleRoom catches up every
  // attempt whose cursor is behind the last closed round.
  const coldAgain = makeStore();
  const phoneCold = await call(coldAgain, ["a1"]);
  assert.equal(phoneCold.correctInRoom, screen.correctInRoom, "a phone reading a cold room matches the screen");

  // A phone reading a room the screen has already settled: nothing is behind,
  // so it settles only itself and reads the stored counts for the rest.
  const phoneWarm = await call(cold, ["a1"]);
  assert.equal(phoneWarm.correctInRoom, screen.correctInRoom, "a phone reading a settled room matches the screen");

  // And the screen again over the warm room, for the third direction.
  const screenWarm = await call(cold, cold.map((r) => r.id));
  assert.equal(screenWarm.correctInRoom, screen.correctInRoom, "settling twice does not move the room total");

  // Per-attempt: detail where it was asked for, stored where it was not.
  assert.ok(phoneWarm.results.has("a1"), "the caller always gets its own detail");
  assert.equal(phoneWarm.correctFor("a0"), screen.correctFor("a0"), "another racer's count is the same either way");
  assert.equal(phoneWarm.candyFor("a0"), screen.candyFor("a0"), "and so is their candy");

  // The student who answered nothing earns nothing, and is still counted as a
  // racer in the room.
  assert.equal(screen.correctFor("a2"), 0, "no answers, no correctness");
  assert.equal(screen.candyFor("a2"), 0, "no answers, no candy");
}

// ------------------------------------------------- the grade is the server's record
{
  const { committedAnswers, acceptableAnswers } = await import(backend("_shared/settle.ts").href);
  const T0 = 1_700_000_000_000;
  const ids = ["q0", "q1", "q2", "q3"];

  // One case per side of the grace. q0 lands mid-round. q1's ping arrives 1.5s
  // after its countdown ended — the classroom-wifi case the grace exists for,
  // and it counts. q2's arrives 2.5s after, past the grace, and does not.
  // q3 was never answered.
  const answers = { q0: "a0", q1: "a1", q2: "a2" };
  const times = {
    q0: T0 + 10_000,
    q1: T0 + 90_000 + 1_500,
    q2: T0 + 140_000 + 2_500
  };
  const committed = committedAnswers({ startedAt: T0, questionCount: 4, questionIds: ids, answers, answerTimes: times });
  assert.deepEqual(
    committed,
    [
      { question_id: "q0", selected_option_id: "a0" },
      { question_id: "q1", selected_option_id: "a1" },
      { question_id: "q2", selected_option_id: null },
      { question_id: "q3", selected_option_id: null }
    ],
    "a ping inside the grace counts; one past it does not"
  );
  assert.equal(committed.length, 4, "every dealt question is graded, answered or not");

  // The candy reads the same predicate, so the same ping earns on the same
  // side of the same line — no round where the score says yes and the climb
  // says no.
  const { settleAttempt } = await import(backend("_shared/settle.ts").href);
  const paid = settleAttempt({
    startedAt: T0, now: T0 + 300_000, questionCount: 4,
    questions: ids.map((id) => ({ id, correctOptionId: id.replace("q", "a") })),
    answers, answerTimes: times, settledThrough: -1
  });
  assert.equal(paid.correctCount, 2, "the grace-accepted answer earns its correctness too");
  assert.equal(paid.rounds[1].correct, true, "round 1 was answered inside the grace");
  assert.equal(paid.rounds[2].correct, false, "round 2 was not");

  // The attack the break's reveal makes possible: during round 1's break, a
  // crafted ping rewrites round 0's answer to the revealed one. report_progress
  // pins the timestamp to the first answer, so without the accept rule the
  // rewrite would be graded — and paid in candy — as an early, correct answer.
  // Past the grace, so the round really is shut. (Inside the grace a change is
  // still allowed — and still safe, because the reveal has not been served.)
  const duringBreak = T0 + 45_000;
  const rewrite = acceptableAnswers({
    startedAt: T0, questionCount: 4, now: duringBreak, questionIds: ids,
    stored: { q0: "wrong0" }, incoming: { q0: "a0" }
  });
  assert.deepEqual(rewrite, {}, "an answer cannot be changed after its round stopped taking answers");

  // Changing your mind while the round is still open is exactly what a student
  // is meant to be able to do.
  const inRound = acceptableAnswers({
    startedAt: T0, questionCount: 4, now: T0 + 30_000, questionIds: ids,
    stored: { q0: "wrong0" }, incoming: { q0: "a0" }
  });
  assert.deepEqual(inRound, { q0: "a0" }, "a change inside the window is accepted");

  // A first answer is always accepted — it arrives with a fresh stamp, which
  // the window test then judges on its own merits. This is what stops a last
  // tap being lost to a race between its ping and the submit.
  const first = acceptableAnswers({
    startedAt: T0, questionCount: 4, now: duringBreak, questionIds: ids,
    stored: {}, incoming: { q0: "a0", q1: "a1" }
  });
  assert.deepEqual(first, { q0: "a0", q1: "a1" }, "a question with no stored answer is always accepted");

  // Re-sending the same answer is not a change and must not be refused.
  const same = acceptableAnswers({
    startedAt: T0, questionCount: 4, now: duringBreak, questionIds: ids,
    stored: { q0: "a0" }, incoming: { q0: "a0" }
  });
  assert.deepEqual(same, { q0: "a0" }, "re-sending the stored answer is not a change");

  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /committedAnswers\(/, "submit grades from the server's record");
  assert.match(attempt, /acceptableAnswers\(/, "report_progress refuses a post-reveal rewrite");
  assert.match(attempt, /serverResponses \?\? input\.responses/, "the client payload is the fallback only where there is no room clock");
  assert.match(attempt, /graded_from/, "the audit row records where the score came from");
}

// ------------------------------------------------- the deal sizes the instance
{
  const classQuiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
  assert.match(
    classQuiz,
    /defaultQuestionCount = QUOTA\.easy \+ QUOTA\.medium \+ QUOTA\.hard/,
    "the instance's question count is the quota, not a second hardcoded number"
  );
  assert.doesNotMatch(classQuiz, /defaultQuestionCount = 12/, "the 12 is gone");
  // Twelve rounds for ten questions capped the piñata at 83% and left the last
  // two rounds' flash beat permanently at zero.
  assert.doesNotMatch(
    classQuiz,
    /Number\(body\.question_count\)/,
    "a caller cannot size the clock away from the deal"
  );
  const api = readFileSync(frontend("src/api/quiz.ts"), "utf8");
  assert.doesNotMatch(api, /question_count\?: number/, "the dead question_count parameter is gone");
}

// ------------------------------------------------- the phone obeys the room
// The quiz ran with a real class on 2026-08-20 and failed for one reason that
// was never a bug: every phone counted down from the moment its own student
// tapped "Let's go", so no two students were ever on the same question and
// nobody ever had a spare second to look up. The room publishes one schedule
// now, and this block is what keeps the phone from inventing a second one.
{
  const { existsSync } = await import("node:fs");
  assert.ok(
    !existsSync(new URL("../src/features/quiz/budget.ts", import.meta.url)),
    "the carry-over budget is deleted"
  );

  const { remainingMs, isBreak } = await import(frontend("src/features/quiz/rounds.ts").href);
  const now = 1_000_000;
  assert.equal(
    remainingMs(new Date(now + 12_000).toISOString(), now),
    12_000,
    "a live deadline reads as the milliseconds still on it"
  );
  assert.equal(remainingMs(new Date(now - 5_000).toISOString(), now), 0, "a passed deadline is zero, never negative");
  assert.equal(remainingMs(null, now), 0, "a stale server that sends no deadline reads as zero, not NaN");
  assert.equal(remainingMs("half past four", now), 0, "an unparseable deadline reads as zero, not NaN");

  assert.equal(isBreak({ phase: "break" }), true, "the break is the break");
  assert.equal(isBreak({ phase: "answering" }), false, "answering is not the break");
  assert.equal(isBreak({ phase: "done" }), false, "a finished quiz is not a break");
  assert.equal(isBreak(null), false, "no round at all is not a break");

  // The phone renders the server's absolute timestamps and holds no duration of
  // its own. The two repos deploy independently; a number kept on both sides
  // drifts the moment one of them ships without the other.
  const rounds = readFileSync(frontend("src/features/quiz/rounds.ts"), "utf8");
  assert.doesNotMatch(rounds, /\d+\s*\*\s*1000/, "rounds.ts converts what the server sent — it does not own a duration");

  const player = readFileSync(frontend("src/features/quiz/Player.tsx"), "utf8");
  assert.doesNotMatch(player, /from "\.\/budget"/, "nothing imports the carry-over budget");
  assert.doesNotMatch(player, /quiz\.next/, "there is no Next button — the room clock advances");
  assert.doesNotMatch(player, /\d+\s*\*\s*1000|SECONDS/, "no duration constant survives on the phone");
  assert.match(player, /round\.index/, "the player follows the room's round index");
  assert.match(player, /last_result/, "the break shows the student their result");
  assert.match(
    player,
    /remainingMs\(round\.answer_ends_at/,
    "the countdown pill reads the room's deadline, not a clock the phone started"
  );
  // The splash survives the room clock — a student still meets their secret
  // racer name — but it no longer anchors anything.
  assert.match(player, /quiz\.letsGo/, "the splash still hands the student their racer name");
  // The grade now comes from the server's record of what was pinged, so the
  // per-tap ping is no longer cosmetic.
  assert.match(player, /reportProgress\(/, "every option tap still pings — that ping is what earns the grade");

  // `phase` is "break" for the whole ten seconds, but `last_result` is held
  // back for the first three: an answer is still accepted two seconds past the
  // countdown, and a reveal must never reach a phone that could still ping the
  // answer it just read. So "break with no result" is a WAIT. Falling through
  // to the question there would flash it back onto the screen and snatch it
  // away three seconds later.
  // Two hops rather than one wide one, so the bound stays meaningful as the
  // gates grow: the break branch reaches the guard, and the guard returns the
  // calm beat. Nothing renders the question in between.
  assert.match(
    player,
    /if \(isBreak\(round\)\)[\s\S]{0,500}?if \(!revealed/,
    "the break branch decides before it renders anything"
  );
  assert.match(
    player,
    /if \(!revealed[^)]*\) \{[\s\S]{0,300}?quiz\.checkingAnswer/,
    "a break with no result yet holds a calm beat instead of flashing the question back"
  );

  const strings = readFileSync(frontend("src/i18n/strings.ts"), "utf8");
  for (const key of ["quiz.correctAnswerWas", "quiz.earnedCandy", "quiz.lookUp", "quiz.checkingAnswer"]) {
    assert.ok(strings.includes(`"${key}"`), `${key} is in the dictionary`);
  }

  const live = readFileSync(frontend("src/screens/student/Live.tsx"), "utf8");
  assert.match(live, /round=\{view\?\.quiz\.round/, "Live hands the room's round to the player");
}

// ------------------------------------------- the four ways the phone can lie
// Every one of these was a real hole found reviewing the room clock, and every
// one of them is silent — nothing on the student's screen would say so.
{
  const player = readFileSync(frontend("src/features/quiz/Player.tsx"), "utf8");

  // 1. A tap's ping IS the answer now: the server grades from its own record of
  // what it was pinged, and `answeredInWindow` judges by when it FIRST saw one.
  // A fetch that fell off classroom wifi is therefore a question marked wrong
  // that nothing later can repair — not the submit's re-ping, and not the next
  // round's. So the tap retries, bounded by the round's own server-sent
  // deadline, and NOTHING ELSE does: a round-change or splash ping earns no
  // mark and must not cost a second request.
  assert.match(
    player,
    /ping\(stateRef\.current\.index, \{ map: next, retryWhileOpen: true \}\)/,
    "the option tap asks for the retry"
  );
  assert.equal(
    (player.match(/retryWhileOpen: true/g) || []).length,
    1,
    "only the tap retries — a round-change or splash ping is not what earns a mark"
  );
  assert.match(
    player,
    /if \(attemptsLeft <= 0\) return;\s*\n\s*if \(remainingMs\(round\?\.answer_ends_at, Date\.now\(\)\) <= 0\) return;/,
    "the retry is bounded twice: a count, and the round's own deadline from the server"
  );
  assert.match(
    player,
    /send\(attemptsLeft - 1, stateRef\.current\.answers\)/,
    "a retry re-reads the answer map — a stale resend must never overwrite a newer choice"
  );
  // Small on purpose. Twenty-six phones re-sending a failed tap is the moment
  // the classroom wifi is already struggling; one or two more requests is help,
  // a queue of them is the problem.
  assert.match(player, /const PING_RETRY_LIMIT = [12];/, "the retry stays at one or two attempts");

  // 2. With no round the phone cannot advance at all: there is no Next button
  // and no clock of its own. Routine trigger — this frontend deploys on push
  // and course-pulse is deployed by hand — so a student would sit on question
  // one, which LOOKS answerable, and score zero on nine of ten in silence.
  assert.match(
    player,
    /if \(!round\)[\s\S]{0,300}?quiz\.waitingForRoom/,
    "no room schedule renders a legible wait, never a frozen question one"
  );

  // 3. The server settles every closed round for every attempt, answered or
  // not. Without a gate, tapping "Let's go" during round four's break opens on
  // "❌ The answer was: …" for a question that was never on this phone.
  assert.match(player, /joinedAtRound/, "the phone remembers the first round it was showing");
  assert.match(
    player,
    /const played = revealedIndex >= joinedAtRound\.current/,
    "the reveal is gated on the round having been on screen"
  );
  // Deliberately NOT gated on having answered: a student who watched the
  // question and ran out of time has earned the reveal — that is the teaching
  // moment the break exists for, and the spec asks for ❌ plus the answer.
  assert.doesNotMatch(
    player,
    /answers\[revealed\.question_id\]/,
    "a timed-out student still gets their reveal"
  );

  // 4. An unresolvable correct option rendered "The answer was: " and stopped.
  assert.match(
    player,
    /if \(!revealed \|\| !played \|\| !correctOption\)/,
    "all three reveal gates fall back to the same calm wait"
  );

  const strings = readFileSync(frontend("src/i18n/strings.ts"), "utf8");
  for (const key of ["quiz.waitingForRoom", "quiz.waitingForRoomBody"]) {
    assert.ok(strings.includes(`"${key}"`), `${key} is in the dictionary`);
  }

  // 5. Every quiet card is an early return that never reaches the question
  // view's error line, and every one of them can be on screen while a submit is
  // failing — the room-schedule wait especially, because with no round the
  // instance-deadline effect is the only submit path left AND it refuses to
  // retry once `error` is set. A failed submit there reads as a screen that is
  // simply thinking. One helper carries the error for all three so a fourth
  // card cannot quietly drop it again.
  assert.match(
    player,
    /function holdingCard\([\s\S]{0,400}?error\s*\n?\s*\? <p class="error-text" role="alert">\{error\}<\/p>/,
    "the holding card surfaces a submit error, with the alert role the question view has"
  );
  for (const key of ["quiz.roundOver", "quiz.waitingForRoom", "quiz.quizOver"]) {
    assert.match(
      player,
      new RegExp(`holdingCard\\(t\\("${key}"`),
      `the ${key} card goes through the shared holding card`
    );
  }
  assert.doesNotMatch(
    player,
    /error \|\| t\(/,
    "an error belongs in error-text with role=alert, not swapped into a muted hint"
  );
}

// ------------------------------------------------- the review list after submit
// Ten seconds is enough to see a ✅ or an ❌; it is nowhere near enough to read
// an explanation. Every explanation is collected here so a student can read it
// at leisure while the exit ticket is open — the first time `explanation` /
// `explanation_es` ever leave the question bank.
//
// A first pass of this got the timing wrong: it attached `explanation` /
// `explanation_es` to start_attempt's own questions payload, which ships them
// in the FIRST response of the quiz, before question 1 is on screen — the same
// answer-key leak `is_correct` is deliberately left off the options for. The
// assertions below pin the fix: explanations exist only from submit_attempt,
// resolved fresh at grading time, never from the frozen deal start_attempt
// hands back.
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");

  // start_attempt's own question loader must never select or attach an
  // explanation. Matched against the exact original select (no explanation
  // columns) rather than a `doesNotMatch(/explanation/)` over the whole file,
  // since gradeResponses legitimately selects explanation elsewhere below.
  assert.match(
    attempt,
    /\.select\("id, prompt, prompt_es, question_type, difficulty, topic_tags, points"\)/,
    "start_attempt's questions select carries no explanation column"
  );
  assert.doesNotMatch(
    attempt,
    /explanation: question\.explanation,/,
    "start_attempt's returned question object attaches no explanation field"
  );

  // explanation / explanation_es are fetched ONLY inside gradeResponses, which
  // only ever runs from submit_attempt — after the attempt is graded.
  assert.match(
    attempt,
    /\.select\("id, points, explanation, explanation_es"\)/,
    "explanations are fetched at grading time, not at start_attempt"
  );
  assert.match(
    attempt,
    /explanations:\s*explanationsByQuestion/,
    "gradeResponses returns a question id -> explanation map"
  );
  assert.match(
    attempt,
    /explanations:\s*graded\.explanations/,
    "submit_attempt forwards the explanations map to the client"
  );

  // The correct-option map has to trace back to the server's OWN grading, not
  // to the client's submit payload — the entire point of server-side grading
  // is that a scripted phone cannot hand itself a perfect score, and a
  // `correct` map built from `input.responses` would hand it the answer key
  // just as easily.
  assert.match(
    attempt,
    /correct:\s*graded\.correct/,
    "submit_attempt returns the server's own correct-option map, spelled the way the client expects it"
  );
  // Resolved for every question this attempt was DEALT, not just the ones it
  // answered — a skipped question still has a right answer worth reviewing,
  // and the old query only ever looked up options the student had selected.
  assert.match(
    attempt,
    /\.in\("question_id", questionIds\)\s*\n\s*\.eq\("is_correct", true\)/,
    "the correct option is resolved for every dealt question, not only the answered ones"
  );

  // gradeResponses must not trust `question_id`s from the client on ANY path.
  // The room-clock path already only ever passes `clock.questionIds` in, so
  // this closes the gap on the standalone-activity path (no class_session_id,
  // `roomClockFor` returns null), which used to grade `input.responses`
  // directly — a crafted payload naming a question outside this attempt's own
  // deal would get that question's correct option echoed back in `correct`.
  assert.match(
    attempt,
    /async function gradeResponses\(db: Db, responses: Record<string, unknown>\[\], dealtIds: string\[\]\)/,
    "gradeResponses takes this attempt's own dealt question ids"
  );
  assert.match(
    attempt,
    /allowed\.has\(response\.question_id\)/,
    "gradeResponses filters every response to this attempt's own dealt ids"
  );
  assert.match(
    attempt,
    /gradeResponses\(db, serverResponses \?\? input\.responses, dealtQuestionIds\(attempt\.questions_json\)\)/,
    "the dealt-id guard applies regardless of whether the room clock is present"
  );

  const quiz = readFileSync(new URL("../src/api/quiz.ts", import.meta.url), "utf8");
  assert.match(quiz, /explanation\?:\s*string\s*\|\s*null;/, "QuizQuestion carries the English explanation");
  assert.match(quiz, /explanation_es\?:\s*string\s*\|\s*null;/, "QuizQuestion carries the Spanish explanation");
  assert.match(
    quiz,
    /correct:\s*Record<string,\s*string>;/,
    "SubmitAttemptResponse declares the correct-option map the review list needs"
  );
  assert.match(
    quiz,
    /explanations:\s*Record<string,\s*\{\s*explanation:\s*string\s*\|\s*null;\s*explanation_es:\s*string\s*\|\s*null\s*\}>;/,
    "SubmitAttemptResponse declares the explanations map the review list needs"
  );

  const review = readFileSync(new URL("../src/features/quiz/ReviewList.tsx", import.meta.url), "utf8");
  assert.match(review, /explanation/, "the review shows explanations where the bank has them");
  // Same bilingual fallback every other field in Player.tsx already follows: a
  // missing Spanish explanation shows the English one rather than nothing.
  assert.match(
    review,
    /\(es && question\.explanation_es\) \|\| question\.explanation/,
    "a missing Spanish explanation falls back to English"
  );
  assert.match(review, /t\("quiz\.youSkipped"\)/, "a question the student never reached says so, not a blank");

  const player = readFileSync(frontend("src/features/quiz/Player.tsx"), "utf8");
  assert.match(player, /import \{ ReviewList \} from "\.\/ReviewList";/, "Player imports the review list");
  assert.match(
    player,
    /if \(result\) \{[\s\S]{0,1500}?<ReviewList/,
    "the review renders in the result branch, after the attempt is graded"
  );
  // The review must never render anywhere a quiz still in progress could see
  // it — that would leak the correct option to a student mid-round. It has
  // exactly one call site: the terminal `result` branch, above the break and
  // the live question view in this file.
  assert.equal(
    (player.match(/<ReviewList/g) || []).length,
    1,
    "the review list has exactly one call site — the graded, terminal result branch"
  );
  const breakBranch = player.indexOf("if (isBreak(round))");
  assert.ok(breakBranch > -1, "the break branch is still where past tasks left it");
  assert.ok(
    !player.slice(breakBranch).includes("<ReviewList"),
    "the review list never reaches the break or the live question view — the round could still be running"
  );

  // Finding 1: `response.correct || {}` defeats the exact guard the "no review
  // on resume" decision relies on. An edge function that has not been
  // redeployed yet (this repo's edge functions do not deploy on push; the
  // frontend does) answers submit_attempt with no `correct` field at all —
  // `response.correct` is `undefined`, `|| {}` substitutes a truthy empty
  // object, and a guard that only checked "is correctMap set" would render
  // every question ❌ regardless of what was chosen.
  assert.doesNotMatch(
    player,
    /setCorrectMap\(response\.correct \|\| \{\}\)/,
    "an empty correct map must never be substituted in — it has to read as absent"
  );
  assert.match(
    player,
    /setCorrectMap\(response\.correct \?\? null\)/,
    "a missing correct map stays null rather than becoming a misleading empty object"
  );
  assert.match(
    player,
    /correctMap && Object\.keys\(correctMap\)\.length > 0/,
    "the review only renders once the correct map is both present and non-empty"
  );

  // Explanations reach the review through a COPY of `questions`, never by
  // mutating the `questions` state the live question view still reads from.
  assert.match(
    player,
    /explanations\?\.\[q\.id\]\?\.explanation \?\? null/,
    "explanations are merged onto a per-render copy of the dealt questions"
  );
  assert.doesNotMatch(
    player,
    /<ReviewList questions=\{questions\}/,
    "the review must read from the merged copy, not the raw start_attempt questions"
  );

  // Task 7 left `quiz.next` behind with no reference anywhere in src/ once the
  // room clock removed the Next button. A dead dictionary entry is a silent
  // trap for the next rename; this is the one place that would ever catch it.
  const strings = readFileSync(frontend("src/i18n/strings.ts"), "utf8");
  assert.doesNotMatch(strings, /"quiz\.next":/, "the orphaned quiz.next string was removed");
}

console.log("verify-quiz-race passed");
