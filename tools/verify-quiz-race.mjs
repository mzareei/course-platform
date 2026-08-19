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

console.log("verify-quiz-race passed");
