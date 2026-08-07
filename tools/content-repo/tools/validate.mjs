// CI entry point. No secrets, no network, cannot publish.
//
//   node tools/validate.mjs            # every course
//   node tools/validate.mjs <slug>     # one item
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCourse, validateItem } from "../lib/validate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(path.join(root, "course.json"), "utf8"));
const target = process.argv[2];

let failures = [];
for (const [courseId, course] of Object.entries(config.courses)) {
  const courseDir = path.join(root, course.directory);
  if (!existsSync(courseDir)) {
    failures.push(`${courseId}: ${course.directory} is missing`);
    continue;
  }
  if (target) {
    const itemDir = path.join(courseDir, "content", target);
    if (existsSync(itemDir)) failures.push(...validateItem(itemDir, config));
  } else {
    failures.push(...validateCourse(courseDir, config));
  }
}

if (failures.length) {
  console.error(`${failures.length} validation failure(s):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(target ? `${target}: OK` : "All content validated.");
