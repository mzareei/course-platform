// 2026-08-20: three students were thrown out of the end-of-class quiz mid-class
// and had to start over from question 1; one answered 11 of 12 and has nothing
// on the server at all. Two stacked causes, both verified here so they cannot
// come back:
//
//   1. Nothing about a running attempt survived an interruption. Answers lived
//      only in component state until the final submit, the clock lived only in
//      component state, and start_attempt re-shuffled questions AND options on
//      every call (Math.random, no seed) — so any remount was a brand-new quiz.
//   2. The app treated an auth blip as an eviction. Tokens live one hour;
//      classes run longer; phones sleep through the lecture and wake at quiz
//      time with an expired token. The backend answered "Invalid or expired
//      session." with status 400, and Live.tsx read any 400 as "you are not in
//      this class": join cleared, view blanked, player unmounted.
//
// The contract now: an attempt's questions are FROZEN on first start; answers
// and the clock anchor are saved as the student goes; start_attempt resumes all
// of it (even inside the submit grace after a close); auth failures are 401,
// never 400; and Live holds a mid-attempt player on screen through poll errors.
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backendPath, skipWithoutBackend } from "./lib/backend-root.mjs";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontend = (relative) => path.join(frontendRoot, relative);
const fn = (name) => backendPath(`supabase/functions/${name}`);

if (skipWithoutBackend("verify-quiz-resume")) process.exit(0);

// ------------------------------------------------------------- the migration
{
  const dir = backendPath("supabase/migrations");
  const migration = readdirSync(dir).find((name) => /quiz_attempt_resume/.test(name));
  assert.ok(migration, "a migration adds the attempt-resume columns");
  const sql = readFileSync(path.join(dir, migration), "utf8");
  for (const column of ["questions_json", "progress_answers", "clock_t0"]) {
    assert.match(sql, new RegExp(column), `migration adds student_attempts.${column}`);
  }
}

// ------------------------------------------- the attempt engine, resume-safe
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");

  // The freeze. Selection may shuffle once; after that the attempt's questions
  // are a stored fact, not a re-roll.
  assert.match(
    attempt,
    /\.is\("questions_json", null\)/,
    "the first start freezes the selection race-safely (update guarded on questions_json is null)"
  );
  assert.match(
    attempt,
    /attempt\.questions_json/,
    "a resumed attempt is served its frozen questions, never a re-shuffle"
  );

  // The running answers. report_progress carries the student's answer map and
  // merges monotonically — a stale ping can add, never erase.
  assert.match(attempt, /progress_answers/, "report_progress persists the answer map");
  assert.match(
    attempt,
    /\.\.\.((existing|stored|prior)[A-Za-z]*),\s*\.\.\./s,
    "saved answers merge over the stored map — a stale ping cannot wipe answers"
  );

  // The clock anchor. Set once, server-side, so a reloaded phone cannot mint a
  // fresh full-length schedule.
  assert.match(attempt, /\.is\("clock_t0", null\)/, "clock_t0 is set exactly once");

  // Resume inside the grace: a student kicked in the final seconds can still
  // come back after the close and submit what was saved. The gate lives in
  // findOrCreateAttempt — the submit gate (open OR within grace) for an
  // existing attempt, the strict open gate only before creating a fresh one.
  const findOrCreate = attempt.slice(
    attempt.indexOf("async function findOrCreateAttempt"),
    attempt.indexOf("* A live-class quiz attempt gets a secret racer identity")
  );
  assert.match(
    findOrCreate,
    /assertActivityOpenForSubmit\(input\.instance, openAttempt\)/,
    "resuming an open attempt goes through the submit gate (open or within grace)"
  );
  assert.match(
    findOrCreate,
    /assertActivityOpenForSubmit[\s\S]*assertActivityOpen\(input\.instance\)/,
    "creating a fresh attempt still requires a genuinely open instance"
  );

  // Auth failures are auth failures.
  assert.match(
    attempt,
    /Invalid or expired session[\s\S]{0,200}status:\s*401/,
    "course-activity-attempt answers an expired token with 401, not 400"
  );
}

{
  const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");
  assert.match(
    pulse,
    /Invalid or expired session[\s\S]{0,200}status:\s*401/,
    "course-pulse answers an expired token with 401, not 400 — a 400 cleared the student's join mid-quiz"
  );
}

// ------------------------------------------------------------- the player
{
  const player = readFileSync(frontend("src/features/quiz/Player.tsx"), "utf8");
  assert.match(player, /progress_answers/, "the player restores saved answers on resume");
  assert.match(player, /clock_t0/, "the player anchors the clock to the server's t0 on resume");
  assert.match(player, /clock_start/, "the Let's-go tap starts the server clock");
  assert.match(player, /answers:\s*/, "every progress ping carries the answer map");
}

{
  const quizApi = readFileSync(frontend("src/api/quiz.ts"), "utf8");
  assert.match(quizApi, /progress_answers/, "the attempt type carries the saved answers");
  assert.match(quizApi, /clock_t0/, "the attempt type carries the clock anchor");
}

// ------------------------------------------------------------- the live screen
{
  const live = readFileSync(frontend("src/screens/student/Live.tsx"), "utf8");
  assert.match(
    live,
    /quizHold/,
    "Live tracks a mid-attempt player in a ref the stale poll closure can read"
  );
  assert.match(
    live,
    /quizHold\.current[\s\S]{0,200}return/,
    "a poll error while the quiz is unfinished keeps the screen — no join clearing, no view blanking"
  );
}

console.log("verify-quiz-resume: OK");
