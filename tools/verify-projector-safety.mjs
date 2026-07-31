// Guards the projector's deliberately narrow classroom boundary. It may
// observe presentation state and acknowledge what the physical deck displayed,
// but never becomes a second controller or exposes instructor-only results.
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

for (const rel of [
  "src/screens/instructor/Projector.tsx",
  "src/features/presentation/ProjectorPulse.tsx"
]) {
  assert.equal(existsSync(path.join(root, rel)), true, `Missing ${rel}`);
}

const projector = read("src/screens/instructor/Projector.tsx");
const pulse = read("src/features/presentation/ProjectorPulse.tsx");

assert.match(projector, /projectorCurrent\(/, "projector must poll its safe view");
assert.match(projector, /acknowledgeSlide\(/, "projector must acknowledge applied deck revisions");
assert.match(projector, /checkpointReached\(/, "projector must report reached checkpoints");
assert.match(projector, /presentationHeartbeat\([\s\S]*?"projector"/, "projector heartbeat must identify its surface");
assert.match(projector, /POLL_MS\s*=\s*2000/, "projector safe-state polling must run every two seconds");
assert.match(projector, /HEARTBEAT_MS\s*=\s*5000/, "projector heartbeat must run every five seconds");
assert.match(projector, /<InstructorDeck/, "projector must display the private lecture deck");
assert.match(projector, /goToTeachingSlide\(/, "projector must apply newer remote slide revisions");
assert.match(projector, /<ProjectorPulse/, "an active pulse must take over the projector");

for (const forbidden of [
  "controllerCurrent",
  "requestSlide",
  "setPresentationPhase",
  "InstructorNav",
  "CheckpointPanel",
  "pulseResults",
  "closePulse",
  "revealPulse",
  "pushBankQuestion",
  "<button"
]) {
  assert.doesNotMatch(projector, new RegExp(forbidden), `projector must not include ${forbidden}`);
}

assert.doesNotMatch(pulse, /<button/, "projector pulse must not expose controls");
assert.match(pulse, /pulse\.state\s*===\s*"revealed"/, "reveal-only content must be guarded by the server pulse state");
assert.match(pulse, /correct_option/, "projector may show the server-provided correct option after reveal");
assert.match(pulse, /explanation/, "projector may show the server-provided explanation after reveal");
assert.match(pulse, /submitted/, "projector pulse must show only aggregate response progress");
assert.match(pulse, /eligible/, "projector pulse must show the eligible aggregate");

console.log("verify-projector-safety: OK");
