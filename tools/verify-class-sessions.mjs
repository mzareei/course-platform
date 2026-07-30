import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync("src/api/types.ts", "utf8");
const today = readFileSync("src/screens/student/Today.tsx", "utf8");
const live = readFileSync("src/screens/student/Live.tsx", "utf8");
const app = readFileSync("src/app.tsx", "utf8");

assert.match(types, /student_sessions\??:\s*StudentSession\[\]/);
assert.match(today, /ctx\.student_sessions/);
assert.doesNotMatch(today, /sessionIsLive = allReleases/);
assert.match(live, /ctx\?\.student_sessions/);
assert.match(app, /path="\/teach\/classes"/);
console.log("verify-class-sessions: OK");
