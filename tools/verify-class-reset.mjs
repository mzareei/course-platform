// Reopening and resetting a class day. Reset is the most destructive action an
// instructor can reach from Run Class, so its guard rails are checked here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = readFileSync(path.join(root, "src/api/session.ts"), "utf8");
const runClass = readFileSync(
  path.join(root, "src/screens/instructor/RunClass.tsx"),
  "utf8"
);

// ------------------------------------------------------------------ reopen
assert.match(
  api,
  /next_state: "continued"[\s\S]{0,300}next_state: "live"/,
  "reopening must take both hops: the server allows closed -> continued -> live only"
);
assert.match(
  api,
  /reopenClassSession\(sessionId: string, reason: string\)/,
  "the server requires a reason to continue a closed session, so it cannot be optional"
);
assert.match(
  runClass,
  /\{ended \? \([\s\S]{0,400}?onReopenClass\(\)/,
  "the reopen button must appear on an ended class, where the professor is looking"
);

// ------------------------------------------------------------------- reset
assert.match(
  api,
  /action: "reset_session", session_id: sessionId/,
  "reset must go through the dedicated server action, never a client-side sweep"
);
assert.match(
  runClass,
  /if \(!resetConfirming\) \{\s*setResetConfirming\(true\);\s*return;\s*\}/,
  "reset must take two presses — the first arms it, the second does it"
);
assert.match(
  runClass,
  /isLive \?[\s\S]{0,200}run\.reset\.endFirst/,
  "a live class must offer no reset button at all, not merely refuse on click"
);
assert.match(
  runClass,
  /setResetSummary\(removed\)/,
  "the professor must be told what was destroyed, not just that it worked"
);
assert.match(
  runClass,
  /autoSentCheckpoints\.current = new Set\(\)[\s\S]{0,400}?setCheckpointState\(\{ type: "idle" \}\)/,
  "after a reset the cockpit must forget the class it was holding, or stale latches survive it"
);

// The summary the UI prints must name fields the server actually returns.
const migration = readFileSync(
  path.resolve(root, "../mzareei.github.io/supabase/migrations/0047_reset_class_session.sql"),
  "utf8"
);
for (const field of [
  "pulse_rounds",
  "pulse_answers",
  "plan_checkpoints_reset",
  "attendance"
]) {
  assert.match(
    migration,
    new RegExp(`'${field}'`),
    `the reset function must report ${field}, which the cockpit renders`
  );
  assert.match(
    api,
    new RegExp(`${field}: number`),
    `the client contract must model ${field}`
  );
}

// ------------------------------------------------- the migration's own guards
assert.match(
  migration,
  /if locked_state = 'live' then\s*raise exception 'class_session_reset_state_invalid'/,
  "the database must refuse to reset a live class even if a client asks"
);
assert.match(
  migration,
  /for update/,
  "the session row must be locked before its activity is torn down"
);
assert.match(
  migration,
  /delete from public\.pulse_rounds[\s\S]{0,900}?update public\.class_question_plan_checkpoints/,
  "rounds must be deleted before their checkpoints: plan_checkpoint_id is ON DELETE RESTRICT"
);
assert.match(
  migration,
  /set state = 'planned'/,
  "the plan must survive a reset with its polls armed again, not be deleted"
);
assert.doesNotMatch(
  migration,
  /delete from public\.class_question_plans\b/,
  "resetting a class must never delete the question plan the professor wrote"
);
assert.doesNotMatch(
  migration,
  /delete from public\.class_sessions\b/,
  "reset is not delete — the class day itself must survive"
);
assert.match(
  migration,
  /revoke all on function public\.reset_class_session_atomic\(uuid, text\)\s*\n\s*from public, anon, authenticated/,
  "the browser must never be able to call the reset function directly"
);

const fn = readFileSync(
  path.resolve(
    root,
    "../mzareei.github.io/supabase/functions/course-session-management/index.ts"
  ),
  "utf8"
);
assert.match(
  fn,
  /assertSectionAllowed\(input\.permissions, session\.section_id\)[\s\S]{0,400}?reset_class_session_atomic/,
  "reset must re-check section permission on the server before touching anything"
);
assert.match(
  fn,
  /action: "class_session_reset"/,
  "a reset must leave an audit row it cannot itself erase"
);

console.log("verify-class-reset: OK");
