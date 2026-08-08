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
assert.match(board, /checkpoint\.slide_hint\s*!==\s*null/);
assert.match(board, /checkpoint\.state\s*===\s*["']sent["']/);
assert.match(board, /disabled=\{[^}]*!isLive/);
assert.match(board, /pushPlanQuestion\(/);

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
  "run.plan.class_question_plan_topic_required",
  "run.plan.class_question_plan_slide_hint_invalid",
  "run.plan.class_question_plan_checkpoint_locked",
  "run.plan.class_question_plan_question_not_in_bank",
  "run.plan.class_question_plan_question_ids_invalid",
  "run.plan.class_question_plan_question_ids_duplicate",
  "run.plan.class_question_plan_question_unavailable",
  "run.plan.class_question_plan_question_not_candidate",
  "run.plan.class_question_plan_payload_invalid",
  "run.plan.class_question_plan_exists"
];

for (const key of copyKeys) {
  assert.match(
    strings,
    new RegExp(`"${key.replaceAll(".", "\\.")}"\\s*:\\s*\\[\\s*"`, "m"),
    `Missing bilingual copy for ${key}`
  );
}

console.log("verify-class-question-plans: OK");
