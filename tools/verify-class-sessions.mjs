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
const classesApi = readFileSync("src/api/classes.ts", "utf8");
const rosterApi = readFileSync("src/api/roster.ts", "utf8");
const studentNotesApi = readFileSync("src/api/studentNotes.ts", "utf8");
const schedule = readFileSync("src/components/Schedule.tsx", "utf8");
const sections = readFileSync("src/components/Sections.tsx", "utf8");
const sessionEditor = readFileSync("src/components/SessionEditor.tsx", "utf8");
const sectionEditor = readFileSync("src/components/SectionEditor.tsx", "utf8");
const people = readFileSync("src/screens/instructor/People.tsx", "utf8");

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

assert.match(classesApi, /action:\s*["']update_session["']/);
assert.match(classesApi, /course-session-management/);
assert.match(studentNotesApi, /course-student-notes/);
assert.match(studentNotesApi, /action:\s*["']list_session["']/);
assert.match(studentNotesApi, /action:\s*["']list_student["']/);
assert.match(studentNotesApi, /action:\s*["']create["']/);
assert.match(studentNotesApi, /action:\s*["']resolve["']/);

// A class can only be corrected before it has actually begun. This prevents a
// professor from changing the group, date, or lecture under students mid-class.
assert.match(schedule, /const EDITABLE_SESSION_STATES = \["planned", "open", "continued"\]/);
assert.match(schedule, /session\.actual_start_at == null/);
assert.match(schedule, /<SessionEditor/);
assert.match(sessionEditor, /updateClass/);
assert.match(sessionEditor, /content_item_id:\s*contentItemId \|\| null/);

// save_section replaces its row, so the inline editor must echo every persisted
// field instead of accidentally erasing the optional group metadata.
assert.match(sections, /<SectionEditor/);
assert.match(sectionEditor, /saveSection/);
assert.match(sectionEditor, /section_code:\s*code\.trim\(\)/);
assert.match(sectionEditor, /section_name:\s*name\.trim\(\)/);
assert.match(sectionEditor, /meeting_pattern:\s*meetingPattern\.trim\(\) \|\| null/);
assert.match(sectionEditor, /campus:\s*campus\.trim\(\) \|\| null/);
assert.match(sectionEditor, /status/);
assert.match(sections, /href=\{`\/teach\/people\?group=\$\{section\.id\}`\}/);

// Group links must be safe to share and easy to leave: accept only a UUID and
// render a clear route without the query parameter.
assert.match(people, /new URLSearchParams\(location\.search\)\.get\("group"\)/);
assert.match(people, /GROUP_UUID\.test\(groupParam\)/);
assert.match(people, /section_id === groupId/);
assert.match(people, /href="\/teach\/people"/);
assert.match(people, /listSections\(\)/, "People must load the authoritative course group list");
assert.doesNotMatch(people, /context\.value\?\.sections/, "People must not treat the instructor's enrollments as course groups");
assert.doesNotMatch(
  people,
  /selectedGroup\?\.(?:section_name|section_code)[\s\S]{0,100}\|\|\s*groupId/,
  "A group label must never fall back to a raw UUID"
);
assert.match(rosterApi, /action:\s*["']assign_person_section["']/);
assert.match(rosterApi, /profile_id:\s*profileId/);
assert.match(rosterApi, /section_id:\s*sectionId/);
assert.match(people, /assignPersonSection/);
assert.match(people, /people\.changeGroup/);
assert.match(people, /people\.assignGroup/);
assert.match(people, /people\.assignToViewingGroup/);
assert.match(people, /await refreshContext\(\)/);
assert.match(sessionEditor, /const \{ session: saved \} = await updateClass/);
assert.match(sessionEditor, /onSaved\(saved\)/);
assert.match(sectionEditor, /const \{ section: saved \} = await saveSection/);
assert.match(sectionEditor, /onSaved\(saved\)/);

if (originalLocalStorage) {
  Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
} else {
  delete globalThis.localStorage;
}
console.log("verify-class-sessions: OK");
