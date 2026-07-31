// Guards the projector's deliberately narrow classroom boundary. It may
// observe presentation state and acknowledge what the physical deck displayed,
// but never becomes a second controller or exposes instructor-only results.
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyProjectorSafetySource } from "./lib/projector-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

for (const rel of [
  "src/screens/instructor/Projector.tsx",
  "src/features/presentation/ProjectorPulse.tsx"
]) {
  assert.equal(existsSync(path.join(root, rel)), true, `Missing ${rel}`);
}

verifyProjectorSafetySource(
  read("src/screens/instructor/Projector.tsx"),
  read("src/features/presentation/ProjectorPulse.tsx")
);

console.log("verify-projector-safety: OK");
