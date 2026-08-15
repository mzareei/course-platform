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
import {
  currentCourseStudentSectionId,
  hasActiveStudentEnrollment
} from "../src/features/roster/sectionMembership.ts";
import {
  assignmentErrorKey,
  isAssignableGroupStatus,
  isAssignableStudentProfileStatus
} from "../src/features/roster/assignment.ts";

const types = readFileSync("src/api/types.ts", "utf8");
const today = readFileSync("src/screens/student/Today.tsx", "utf8");
const live = readFileSync("src/screens/student/Live.tsx", "utf8");
const app = readFileSync("src/app.tsx", "utf8");
const classesApi = readFileSync("src/api/classes.ts", "utf8");
const apiClient = readFileSync("src/api/client.ts", "utf8");
const rosterApi = readFileSync("src/api/roster.ts", "utf8");
const studentNotesApi = readFileSync("src/api/studentNotes.ts", "utf8");
const schedule = readFileSync("src/components/Schedule.tsx", "utf8");
const sections = readFileSync("src/components/Sections.tsx", "utf8");
const sessionEditor = readFileSync("src/components/SessionEditor.tsx", "utf8");
const sectionEditor = readFileSync("src/components/SectionEditor.tsx", "utf8");
const people = readFileSync("src/screens/instructor/People.tsx", "utf8");
const rosterAssignment = readFileSync("src/features/roster/assignment.ts", "utf8");

assert.equal(isAssignableGroupStatus("planned"), true);
assert.equal(isAssignableGroupStatus("active"), true);
assert.equal(isAssignableGroupStatus("completed"), false);
assert.equal(isAssignableGroupStatus("archived"), false);
assert.equal(isAssignableStudentProfileStatus("active"), true);
assert.equal(isAssignableStudentProfileStatus("invited"), true);
assert.equal(isAssignableStudentProfileStatus("inactive"), false);
assert.equal(isAssignableStudentProfileStatus(undefined), false);
assert.equal(assignmentErrorKey("group_not_assignable"), "people.assignGroupUnavailable");
assert.equal(assignmentErrorKey("student_not_assignable"), "people.assignStudentUnavailable");
assert.equal(assignmentErrorKey("student_role_required"), "people.assignRoleUnavailable");
assert.equal(assignmentErrorKey("unexpected"), "people.assignGroupFailed");

assert.match(types, /student_sessions\??:\s*StudentSession\[\]/);
assert.match(today, /ctx\.student_sessions/);
assert.doesNotMatch(today, /sessionIsLive = allReleases/);
assert.match(live, /ctx\?\.student_sessions/);
assert.match(app, /path="\/teach\/classes"/);
// The join gate reads the reactive currentPath signal, NOT location.pathname:
// App only re-renders on signals, so a plain location read left the app stuck
// in the join shell (rendering SignIn to a signed-in student) after JoinClass
// route("/live")-ed. PathSync inside the shell is what keeps the signal fresh.
const authenticatedJoinGate = app.indexOf('if (currentPath.value.startsWith("/join/"))');
const contextErrorGate = app.indexOf("if (contextError.value)");
const rosterGate = app.indexOf('if (ctx && ctx.roster_status !== "active")');
assert.ok(authenticatedJoinGate >= 0);
assert.ok(authenticatedJoinGate < contextErrorGate);
assert.ok(authenticatedJoinGate < rosterGate);
assert.doesNotMatch(app, /location\.pathname\.startsWith\("\/join\/"\)/);
assert.match(app, /const currentPath = signal\(location\.pathname\)/);
assert.match(app, /currentPath\.value = path/);

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

const groupA = "11111111-1111-4111-8111-111111111111";
const groupB = "22222222-2222-4222-8222-222222222222";
const otherCourseGroup = "33333333-3333-4333-8333-333333333333";
assert.equal(
  hasActiveStudentEnrollment([
    { section_id: groupA, role: "student", status: "dropped" }
  ], groupA),
  false,
  "dropped enrollment history must not keep a person in the filtered group"
);
assert.equal(
  hasActiveStudentEnrollment([
    { section_id: groupA, role: "observer", status: "active" }
  ], groupA),
  false,
  "a non-student enrollment must not count as current group membership"
);
assert.equal(
  hasActiveStudentEnrollment([
    { section_id: groupA, role: "student", status: "active" }
  ], groupA),
  true
);
assert.equal(
  currentCourseStudentSectionId(
    [
      { section_id: otherCourseGroup, role: "student", status: "active" },
      { section_id: groupA, role: "student", status: "dropped" },
      { section_id: groupB, role: "student", status: "active" }
    ],
    new Set([groupA, groupB])
  ),
  groupB,
  "current assignment must ignore active student enrollments from another course"
);
assert.equal(
  currentCourseStudentSectionId(
    [{ section_id: otherCourseGroup, role: "student", status: "active" }],
    new Set([groupA, groupB])
  ),
  ""
);

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
assert.match(people, /href="\/teach\/people"/);
assert.match(people, /listSections\(\)/, "People must load the authoritative course group list");
assert.match(rosterAssignment, /new Set\(\["planned", "active"\]\)/);
assert.match(
  people,
  /selectedGroupAssignable[\s\S]+isAssignableGroupStatus\(selectedGroup\.status\)/,
  "archived and completed filtered groups must not expose assignment controls"
);
assert.match(
  people,
  /const needsReason =\s*role !== ["']instructor["']/,
  "external instructor invites must not require an outside-institution reason"
);
assert.match(
  people,
  /invite_email_sent[\s\S]+people\.addedWithInvitation/,
  "People must tell the instructor whether the invitation email was sent"
);
assert.match(people, /people\.groupNotAssignable/);
assert.match(
  people,
  /isAssignableStudentProfileStatus\(person\.profile_status\)/,
  "active and invited students must both be movable before first sign-in"
);
assert.match(people, /new Set\(\(groups \?\? \[\]\)\.map\(\(group\) => group\.id\)\)/);
// People's group view now narrows through the shared scope filter, which lists
// everyone attached to the group — a TA of 401 must not vanish from 401 — and
// keeps a student who is invited but has not signed in yet. The old assertion
// here required role === "student" && status === "active" and encoded the
// opposite of both. The guarantee it really protected — that a dropped
// enrolment does not keep someone in a group — now lives in
// tools/verify-scope-filter.mjs, which self-tests personSectionIds against
// real dropped-enrolment data rather than matching a regex.
assert.match(
  people,
  /scopedRoster\(/,
  "People's group view must narrow the roster through the shared scope filter"
);
assert.match(people, /currentCourseStudentSectionId\(person\.sections, courseGroupIds\)/);
assert.match(people, /!data \|\| !groups/, "assignment controls must not mount before authoritative groups load");
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
assert.match(people, /cause instanceof ApiError/);
assert.match(rosterAssignment, /people\.assignGroupUnavailable/);
assert.match(rosterAssignment, /people\.assignStudentUnavailable/);
assert.doesNotMatch(
  people,
  /setError\(cause instanceof Error \? cause\.message : t\("people\.assignGroupFailed"\)\)/,
  "People must localize assignment errors instead of rendering raw backend English"
);
assert.match(people, /await refreshContext\(\)/);
assert.match(apiClient, /error_code\?: string/);
assert.match(apiClient, /new ApiError\([\s\S]+response\.status[\s\S]+error_code/);
assert.match(sessionEditor, /const \{ session: saved \} = await updateClass/);
assert.match(sessionEditor, /onSaved\(saved\)/);
assert.match(sectionEditor, /const \{ section: saved \} = await saveSection/);
assert.match(sectionEditor, /onSaved\(saved\)/);

// ------------------------------------------- a live class outranks a paused one
//
// One day can hold both: last week's lecture being finished, and a brand-new
// one. Sessions arrive in planned-date order, so the paused older class is
// first — and taking the first live-or-paused entry would put the whole room in
// the wrong class.
{
  const sessions = [
    { session_id: "paused-older", state: "paused" },
    { session_id: "live-newer", state: "live" }
  ];
  assert.equal(
    selectLiveSessionId(sessions, null),
    "live-newer",
    "a class actually running must outrank one that is paused"
  );
  assert.equal(
    selectLiveSessionId(sessions, "paused-older"),
    "paused-older",
    "a student who scanned into a specific class stays in it"
  );
  assert.equal(
    selectLiveSessionId([{ session_id: "only-paused", state: "paused" }], null),
    "only-paused",
    "a paused class is still the student's class when nothing else is running"
  );
  assert.equal(
    fallbackLiveSessionId(sessions, "live-newer"),
    "paused-older",
    "falling back off a stale session must still find the paused one"
  );
  assert.equal(
    fallbackLiveSessionId(sessions, "paused-older"),
    "live-newer",
    "and falling back off the paused one must find the live one"
  );
}

// ------------------------------------------------- a paused class says paused
assert.match(
  today,
  /const pausedSession = /,
  "Today must know a paused class apart from a running one"
);
assert.doesNotMatch(
  today,
  /\["live", ?"paused"\]\.includes\(session\.state\)/,
  "a paused class must not be announced as live"
);
assert.match(
  today,
  /t\("today\.classPaused"\)/,
  "a paused class must say so, in both languages"
);
assert.match(
  live,
  /view\?\.session_state === "paused"/,
  "the live screen must read the paused state the poll already returns"
);
assert.match(
  live,
  /t\("live\.pausedTitle"\)/,
  "the paused card must be translated"
);

if (originalLocalStorage) {
  Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
} else {
  delete globalThis.localStorage;
}
console.log("verify-class-sessions: OK");
