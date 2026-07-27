// Runs every verifier in tools/verify-*.mjs and fails on the first broken one.
// Same culture as the original repo: cheap static checks that catch drift early.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const verifiers = readdirSync(toolsDir).filter((f) => f.startsWith("verify-") && f.endsWith(".mjs")).sort();

let failed = 0;
for (const file of verifiers) {
  const result = spawnSync(process.execPath, [path.join(toolsDir, file)], { stdio: "inherit" });
  if (result.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} verifier(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${verifiers.length} verifiers passed.`);
