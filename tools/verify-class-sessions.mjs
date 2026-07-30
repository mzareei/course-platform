import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  consumeAuthReturnPath,
  normalizeReturnPath,
  saveAuthReturnPath
} from "../src/features/auth/returnPath.ts";
import {
  canJoinClassSession,
  fallbackLiveSessionId,
  selectLiveSessionId
} from "../src/features/join/sessionState.ts";

const types = readFileSync("src/api/types.ts", "utf8");
const today = readFileSync("src/screens/student/Today.tsx", "utf8");
const live = readFileSync("src/screens/student/Live.tsx", "utf8");
const app = readFileSync("src/app.tsx", "utf8");

assert.match(types, /student_sessions\??:\s*StudentSession\[\]/);
assert.match(today, /ctx\.student_sessions/);
assert.doesNotMatch(today, /sessionIsLive = allReleases/);
assert.match(live, /ctx\?\.student_sessions/);
assert.match(app, /path="\/teach\/classes"/);
const authenticatedJoinGate = app.indexOf('if (location.pathname.startsWith("/join/"))');
const contextErrorGate = app.indexOf("if (contextError.value)");
const rosterGate = app.indexOf('if (ctx && ctx.roster_status !== "active")');
assert.ok(authenticatedJoinGate >= 0);
assert.ok(authenticatedJoinGate < contextErrorGate);
assert.ok(authenticatedJoinGate < rosterGate);

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

const liveSessions = [
  { session_id: "other-live", state: "live" },
  { session_id: "joined-target", state: "paused" }
];
assert.equal(selectLiveSessionId(liveSessions, "joined-target"), "joined-target");
assert.equal(selectLiveSessionId(liveSessions, null), "other-live");
assert.equal(fallbackLiveSessionId(liveSessions, "stale-id"), "other-live");
assert.equal(fallbackLiveSessionId(liveSessions, "other-live"), "joined-target");

if (originalLocalStorage) {
  Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
} else {
  delete globalThis.localStorage;
}
console.log("verify-class-sessions: OK");
