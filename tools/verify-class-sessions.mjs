import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  consumeAuthReturnPath,
  normalizeReturnPath,
  saveAuthReturnPath
} from "../src/features/auth/returnPath.ts";
import { canJoinClassSession } from "../src/features/join/sessionState.ts";

const types = readFileSync("src/api/types.ts", "utf8");
const today = readFileSync("src/screens/student/Today.tsx", "utf8");
const live = readFileSync("src/screens/student/Live.tsx", "utf8");
const app = readFileSync("src/app.tsx", "utf8");

assert.match(types, /student_sessions\??:\s*StudentSession\[\]/);
assert.match(today, /ctx\.student_sessions/);
assert.doesNotMatch(today, /sessionIsLive = allReleases/);
assert.match(live, /ctx\?\.student_sessions/);
assert.match(app, /path="\/teach\/classes"/);

assert.equal(normalizeReturnPath("/join/K7P4"), "/join/K7P4");
assert.equal(normalizeReturnPath("https://evil.example/"), null);
assert.equal(normalizeReturnPath("//evil.example/"), null);
assert.equal(normalizeReturnPath("/teach"), null);

const returnPathStorage = new Map();
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => returnPathStorage.get(key) ?? null,
    setItem: (key, value) => returnPathStorage.set(key, String(value)),
    removeItem: (key) => returnPathStorage.delete(key)
  }
});

saveAuthReturnPath("/join/K7P4");
assert.equal(consumeAuthReturnPath(), "/join/K7P4");
assert.equal(consumeAuthReturnPath(), null);
saveAuthReturnPath("https://evil.example/");
assert.equal(consumeAuthReturnPath(), null);

assert.equal(canJoinClassSession("planned"), true);
assert.equal(canJoinClassSession("live"), true);
assert.equal(canJoinClassSession("closed"), false);
assert.equal(canJoinClassSession("cancelled"), false);

if (originalLocalStorage) {
  Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
} else {
  delete globalThis.localStorage;
}
console.log("verify-class-sessions: OK");
