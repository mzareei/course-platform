import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const required = [
  "src/api/classQuestionPlans.ts",
  "src/api/pulse.ts",
  "src/components/ClassQuestionPlanBoard.tsx",
  "src/i18n/strings.ts"
];

for (const rel of required) {
  assert.equal(existsSync(path.join(root, rel)), true, `Missing file: ${rel}`);
}

const api = read("src/api/classQuestionPlans.ts");
const pulse = read("src/api/pulse.ts");
const board = read("src/components/ClassQuestionPlanBoard.tsx");
const runClass = read("src/screens/instructor/RunClass.tsx");
const strings = read("src/i18n/strings.ts");
const pushPlanQuestionBlock =
  pulse.match(/export function pushPlanQuestion[\s\S]+?\n}\n/)?.[0] || "";

assert.match(api, /export function getClassQuestionPlan\s*\(/);
assert.match(api, /export function createClassQuestionPlan\s*\(/);
assert.match(api, /export function saveCheckpointCandidates\s*\(/);
assert.match(api, /callFn<[\s\S]+>\("course-class-question-plan"/);
assert.match(api, /action:\s*["']get["']/);
assert.match(api, /action:\s*["']create["']/);
assert.match(api, /action:\s*["']set_candidates["']/);
assert.match(api, /question_bank_id:\s*string;/);
assert.match(api, /final_quiz_question_count:\s*number(?:\s*\|\s*null)?;/);
assert.match(api, /notes:\s*string\s*\|\s*null;/);
assert.match(api, /copied_from_plan_id:\s*string\s*\|\s*null;/);
assert.match(api, /classQuestionPlanErrorKey/);
assert.match(api, /run\.plan\.class_question_plan_failed/);
assert.match(api, /run\.plan\.class_question_plan_auth_required/);
assert.match(api, /run\.plan\.class_question_plan_question_bank_not_active/);

assert.match(pushPlanQuestionBlock, /export function pushPlanQuestion\s*\(/);
assert.match(pushPlanQuestionBlock, /callFn<\{ round: PulseRound \}>\("course-pulse"/);
assert.match(pushPlanQuestionBlock, /plan_checkpoint_id:\s*input\.plan_checkpoint_id/);
assert.match(pushPlanQuestionBlock, /question_id:\s*input\.question_id/);
assert.doesNotMatch(
  pushPlanQuestionBlock,
  /checkpoint_after_slide/,
  "pushPlanQuestion must not send checkpoint_after_slide"
);

assert.match(board, /export function ClassQuestionPlanBoard\s*\(/);
assert.match(board, /classSessionId:\s*string/);
assert.match(board, /isLive:\s*boolean/);
assert.match(board, /getClassQuestionPlan\(/);
assert.match(board, /listBanks\(/);
assert.match(board, /t\("run\.plan\.title"\)/);
assert.match(board, /t\("run\.plan\.create"\)/);
assert.match(board, /t\("run\.plan\.askNow"\)/);
assert.match(board, /t\("run\.plan\.afterSlide"/);
assert.match(board, /t\("run\.plan\.alreadyAsked"\)/);
assert.match(board, /t\("run\.plan\.noCandidates"\)/);
assert.match(board, /candidate_question_ids/);
assert.match(board, /checkpoint\.slide_hint\s*===\s*null/);
assert.match(board, /checkpoint\.state\s*===\s*["']sent["']\s*\|\|\s*checkpoint\.state\s*===\s*["']skipped["']/);
assert.match(board, /resolvedCandidateQuestions/);
assert.match(board, /disabled=\{[^}]*!isLive[^}]*\|\|[^}]*!selectedQuestion/);
assert.match(board, /pushPlanQuestion\(/);
assert.match(board, /function sortedPlannedCheckpoints\s*\(/);
assert.match(board, /function checkpointLabel\s*\(/);
assert.match(board, /t\("run\.plan\.pickSlideLabel"\)/);
assert.match(board, /t\("run\.plan\.slideOption",/);
assert.match(board, /t\("run\.plan\.slideOnlyOption"/);
assert.match(board, /t\("run\.plan\.noUpcoming"\)/);
assert.match(board, /t\("run\.plan\.history"\)/);
assert.doesNotMatch(
  board,
  /t\("run\.plan\.checkpointNumber"/,
  "the per-checkpoint numbered heading was removed by the slide-first redesign"
);
assert.doesNotMatch(
  board,
  /cause instanceof Error && cause\.message/,
  "board must not expose raw backend error messages"
);

assert.match(runClass, /import\s+\{\s*ClassQuestionPlanBoard\s*\}\s+from\s+["']\.\.\/\.\.\/components\/ClassQuestionPlanBoard["']/);
assert.match(runClass, /pushBankQuestion\(/, "RunClass must keep the legacy deck question send path");
assert.match(runClass, /loadQuestion\(/, "RunClass must keep the bridge-driven loadQuestion path");
assert.match(runClass, /<CheckpointPanel[\s\S]+?\/>/, "RunClass must keep the checkpoint panel");
assert.match(runClass, /<ClassQuestionPlanBoard[\s\S]+classSessionId=\{sessionId\}[\s\S]+isLive=\{isLive\}[\s\S]+onRefresh=\{/);
assert.match(
  runClass,
  /<CheckpointPanel[\s\S]+?\/>\s*\n\s*\)\}\s*\n\s*\{sessionId\s*&&\s*banksLoaded\s*\?\s*\(\s*\n\s*<ClassQuestionPlanBoard[\s\S]+?\/>/,
  "RunClass must render the plan board below the checkpoint controls"
);
assert.doesNotMatch(
  runClass,
  /if \(!Number\.isInteger\(afterSlide\) \|\| afterSlide < 1\) return;/,
  "RunClass must not drop active plan rounds when checkpoint_after_slide is null"
);
assert.match(
  runClass,
  /const checkpoint =\s*Number\.isInteger\(afterSlide\) && afterSlide >= 1[\s\S]+?\?\s*\{[\s\S]+afterSlide[\s\S]+?\}\s*:\s*null;/,
  "RunClass must recover active rounds with a nullable checkpoint"
);
assert.match(
  runClass,
  /setActiveCheckpoint\(checkpoint\);/,
  "RunClass recovery must allow activeCheckpoint to be null for plan rounds"
);
assert.match(
  runClass,
  /if \(!isLive \|\| recoveringCurrentRound \|\| !bridge\.checkpoint \|\| !bank\) return;/,
  "RunClass must block legacy checkpoint loading while active-round recovery is in flight"
);
assert.doesNotMatch(
  runClass,
  /if \(checkpointState\.type !== "open" \|\| !activeCheckpoint\) return;/,
  "plan rounds must still be revealable after reload without an authored checkpoint"
);
assert.doesNotMatch(
  runClass,
  /const checkpoint = checkpointOverride \?\? activeCheckpoint;\s*if \(!checkpoint\) return;/,
  "plan rounds must remain continuable after reload without inventing a slide checkpoint"
);

const copyKeys = [
  "run.plan.title",
  "run.plan.create",
  "run.plan.askNow",
  "run.plan.afterSlide",
  "run.plan.alreadyAsked",
  "run.plan.noPlan",
  "run.plan.noCandidates",
  "run.plan.bankLabel",
  "run.plan.createHint",
  "run.plan.addCheckpoint",
  "run.plan.topicLabel",
  "run.plan.slideHintLabel",
  "run.plan.notesLabel",
  "run.plan.candidatesLabel",
  "run.plan.edit",
  "run.plan.remove",
  "run.plan.save",
  "run.plan.cancel",
  "run.plan.liveRequired",
  "run.plan.loadFailed",
  "run.plan.saveFailed",
  "run.plan.createFailed",
  "run.plan.class_question_plan_failed",
  "run.plan.class_question_plan_action_invalid",
  "run.plan.class_question_plan_auth_invalid",
  "run.plan.class_question_plan_auth_required",
  "run.plan.class_question_plan_bank_mismatch",
  "run.plan.class_question_plan_checkpoint_id_invalid",
  "run.plan.class_question_plan_checkpoint_not_found",
  "run.plan.class_question_plan_topic_required",
  "run.plan.class_question_plan_slide_hint_invalid",
  "run.plan.class_question_plan_checkpoint_locked",
  "run.plan.class_question_plan_forbidden",
  "run.plan.class_question_plan_method_not_allowed",
  "run.plan.class_question_plan_not_found",
  "run.plan.class_question_plan_plan_id_invalid",
  "run.plan.class_question_plan_profile_not_found",
  "run.plan.class_question_plan_question_bank_id_invalid",
  "run.plan.class_question_plan_question_bank_not_active",
  "run.plan.class_question_plan_question_not_in_bank",
  "run.plan.class_question_plan_question_ids_invalid",
  "run.plan.class_question_plan_question_ids_duplicate",
  "run.plan.class_question_plan_question_id_invalid",
  "run.plan.class_question_plan_question_unavailable",
  "run.plan.class_question_plan_question_not_candidate",
  "run.plan.class_question_plan_payload_invalid",
  "run.plan.class_question_plan_exists",
  "run.plan.class_question_plan_session_id_invalid",
  "run.plan.class_question_plan_session_not_found",
  "run.plan.class_question_plan_session_state_invalid",
  "run.plan.class_question_plan_source_plan_id_invalid",
  "run.plan.class_question_plan_source_plan_not_found",
  "run.plan.staleCandidates",
  "run.plan.pickSlideLabel",
  "run.plan.slideOption",
  "run.plan.slideOnlyOption",
  "run.plan.noUpcoming",
  "run.plan.history"
];

for (const key of copyKeys) {
  assert.match(
    strings,
    new RegExp(`"${key.replaceAll(".", "\\.")}"\\s*:\\s*\\[\\s*"`, "m"),
    `Missing bilingual copy for ${key}`
  );
}

console.log("verify-class-question-plans: OK");
