// The professor is platform owner AND instructor of Group 401. The switcher is
// what keeps those two facts apart. These are its rules, tested directly:
// tools/ runs under plain Node, so src/features/scope/*.ts must stay free of
// Preact, localStorage and the network for this file to import them at all.
import assert from "node:assert/strict";
import {
  activeSectionId,
  buildScopeOptions,
  defaultScope,
  groupName,
  isForeignGroup,
  parseScope,
  resolveScope,
  serializeScope
} from "../src/features/scope/model.ts";

const g401 = { id: "id-401", section_code: "401", section_name: "Group 401" };
const g402 = { id: "id-402", section_code: "402", section_name: "Group 402" };
const g501 = { id: "id-501", section_code: "501", section_name: "Group 501" };

/** The professor: owner of the platform, instructor of 401 only. */
const professor = {
  groups: [g501, g402, g401],
  myGroupIds: ["id-401"],
  isOwner: true
};
/** Somebody who teaches 402 and nothing else. */
const otherInstructor = { groups: [g402], myGroupIds: ["id-402"], isOwner: false };

// ------------------------------------------------------------ serialize/parse
assert.equal(serializeScope({ kind: "instructor", sectionId: "id-401" }), "instructor:id-401");
assert.equal(serializeScope({ kind: "admin", sectionId: null }), "admin:all");
assert.equal(serializeScope({ kind: "admin", sectionId: "id-402" }), "admin:id-402");

assert.deepEqual(parseScope("instructor:id-401"), { kind: "instructor", sectionId: "id-401" });
assert.deepEqual(parseScope("admin:all"), { kind: "admin", sectionId: null });
assert.deepEqual(parseScope("admin:id-402"), { kind: "admin", sectionId: "id-402" });

for (const bad of [null, undefined, "", "nonsense", "instructor:", "admin:", "student:id-401", ":x"]) {
  assert.equal(parseScope(bad), null, `parseScope must reject ${JSON.stringify(bad)}`);
}

// Round-trips, because the menu compares options by their serialized value.
for (const scope of [
  { kind: "instructor", sectionId: "id-401" },
  { kind: "admin", sectionId: null },
  { kind: "admin", sectionId: "id-402" }
]) {
  assert.deepEqual(parseScope(serializeScope(scope)), scope, "serialize/parse must round-trip");
}

// -------------------------------------------------------------------- the menu
const menu = buildScopeOptions(professor);
assert.deepEqual(
  menu.map((option) => option.value),
  ["instructor:id-401", "admin:all", "admin:id-402", "admin:id-501"],
  "your own group first, then All groups, then the rest by section_code"
);
assert.deepEqual(
  menu.map((option) => option.section),
  ["instructor", "admin", "admin", "admin"]
);
assert.equal(menu[1].groupLabel, null, "the All-groups entry carries no group name — the caller translates it");
assert.equal(menu[0].groupLabel, "Group 401");
assert.equal(menu[0].youTeach, true);
assert.equal(menu[2].youTeach, false);

// Group 401 appears exactly once. Owner controls stay visible in Instructor
// mode, so an "Admin · Group 401" entry would render an identical screen.
assert.equal(
  menu.filter((option) => option.scope.sectionId === "id-401").length,
  1,
  "a group you teach must never appear twice in the menu"
);

// A non-owner gets no ADMIN half at all.
assert.deepEqual(
  buildScopeOptions(otherInstructor).map((option) => option.value),
  ["instructor:id-402"],
  "a non-owner sees only the groups they teach"
);
assert.equal(
  buildScopeOptions(otherInstructor).length,
  1,
  "one entry means the switcher renders nothing — their app is untouched"
);

// An owner who teaches nothing still gets the admin half.
const observerOwner = { groups: [g401, g402], myGroupIds: [], isOwner: true };
assert.deepEqual(
  buildScopeOptions(observerOwner).map((option) => option.value),
  ["admin:all", "admin:id-401", "admin:id-402"]
);

// ------------------------------------------------------------------- defaults
assert.deepEqual(
  defaultScope(professor),
  { kind: "instructor", sectionId: "id-401" },
  "the professor lands in his own group"
);
assert.deepEqual(defaultScope(observerOwner), { kind: "admin", sectionId: null });
assert.equal(
  defaultScope({ groups: [], myGroupIds: [], isOwner: false }),
  null,
  "somebody with nothing to look at gets no scope, and screens behave as today"
);

// Lowest section_code wins when you teach more than one.
assert.deepEqual(
  defaultScope({ groups: [g501, g402], myGroupIds: ["id-501", "id-402"], isOwner: false }),
  { kind: "instructor", sectionId: "id-402" }
);

// ------------------------------------------------------------------- recovery
assert.deepEqual(
  resolveScope({ kind: "admin", sectionId: "id-402" }, professor),
  { kind: "admin", sectionId: "id-402" },
  "a saved choice that is still in the menu is honoured"
);
assert.deepEqual(
  resolveScope({ kind: "admin", sectionId: "id-999" }, professor),
  { kind: "instructor", sectionId: "id-401" },
  "an archived group falls back to the default, silently"
);
assert.deepEqual(
  resolveScope({ kind: "admin", sectionId: null }, otherInstructor),
  { kind: "instructor", sectionId: "id-402" },
  "an admin scope saved by someone who is no longer an owner falls back"
);
assert.deepEqual(resolveScope(null, professor), { kind: "instructor", sectionId: "id-401" });

// -------------------------------------------------------------- derived facts
assert.equal(activeSectionId(null), null, "no scope means no filtering");
assert.equal(activeSectionId({ kind: "admin", sectionId: null }), null);
assert.equal(activeSectionId({ kind: "admin", sectionId: "id-402" }), "id-402");
assert.equal(activeSectionId({ kind: "instructor", sectionId: "id-401" }), "id-401");

assert.equal(isForeignGroup({ kind: "instructor", sectionId: "id-401" }, ["id-401"]), false);
assert.equal(isForeignGroup({ kind: "admin", sectionId: "id-402" }, ["id-401"]), true);
assert.equal(isForeignGroup({ kind: "admin", sectionId: null }, ["id-401"]), false,
  "All groups is not a foreign group — the banner would be on permanently");
assert.equal(isForeignGroup(null, ["id-401"]), false);

// ---------------------------------------------------------------------- label
assert.equal(groupName(g401), "Group 401", "the group's own name, as People already shows it");
assert.equal(groupName({ id: "x", section_code: "", section_name: "Only a name" }), "Only a name");
assert.equal(groupName({ id: "x", section_code: "402", section_name: "" }), "402");

// ---------------------------------------------------------------- row filters
const {
  inScope,
  personSectionIds,
  scopedReleases,
  scopedRoster,
  scopedScoreProfileIds,
  scopedSessions,
  ungroupedPeople
} = await import("../src/features/scope/filters.ts");

assert.equal(inScope("id-401", null), true, "all groups never filters");
assert.equal(inScope(null, null), true);
assert.equal(inScope("id-401", "id-401"), true);
assert.equal(inScope("id-402", "id-401"), false);
assert.equal(inScope(null, "id-401"), false, "a session with no group is not in a group");
assert.equal(inScope(undefined, "id-401"), false);

const sessions = [
  { session_id: "s1", section_id: "id-401" },
  { session_id: "s2", section_id: "id-402" },
  { session_id: "s3", section_id: "id-401" }
];
assert.deepEqual(scopedSessions(sessions, null).map((s) => s.session_id), ["s1", "s2", "s3"]);
assert.deepEqual(scopedSessions(sessions, "id-401").map((s) => s.session_id), ["s1", "s3"]);
assert.deepEqual(scopedSessions([], "id-401"), []);

const roster = [
  { profile_id: "p1", sections: [{ section_id: "id-401", status: "active" }] },
  { profile_id: "p2", sections: [{ section_id: "id-402", status: "active" }] },
  { profile_id: "p3", sections: [] },
  { profile_id: "p4", sections: null },
  { profile_id: "p5", sections: [{ section_id: "id-401", status: "dropped" }] },
  { profile_id: "p6", sections: [
    { section_id: "id-401", status: "active" },
    { section_id: "id-402", status: "active" }
  ] }
];

assert.deepEqual(personSectionIds(roster[0]), ["id-401"]);
assert.deepEqual(personSectionIds(roster[4]), [], "a dropped enrolment is not a group");
assert.deepEqual(personSectionIds(roster[3]), []);

assert.equal(scopedRoster(roster, null).length, 6, "all groups shows the whole roster");
assert.deepEqual(
  scopedRoster(roster, "id-401").map((p) => p.profile_id),
  ["p1", "p6"],
  "a group view shows that group, and a dropped enrolment does not count"
);

// A freshly imported student has no group at all. Without this list, importing
// a roster inside a group view would leave nobody to assign.
assert.deepEqual(
  ungroupedPeople(roster, "id-401").map((p) => p.profile_id),
  ["p3", "p4", "p5"],
  "people with no live group must stay reachable inside a group view"
);
assert.deepEqual(ungroupedPeople(roster, null), [], "All groups already lists everyone once");

const releases = [
  { id: "r1", section_id: "id-401" },
  { id: "r2", section_id: "id-402" },
  { id: "r3", section_id: null }
];
assert.deepEqual(scopedReleases(releases, null).map((r) => r.id), ["r1", "r2", "r3"]);
assert.deepEqual(
  scopedReleases(releases, "id-401").map((r) => r.id),
  ["r1", "r3"],
  "whole-course content is genuinely open to that group and must not be hidden"
);

const scores = [
  { profile_id: "p1", section_id: "id-401" },
  { profile_id: "p1", section_id: null },
  { profile_id: "p2", section_id: "id-402" }
];
assert.deepEqual([...scopedScoreProfileIds(scores, null)].sort(), ["p1", "p2"]);
assert.deepEqual(
  [...scopedScoreProfileIds(scores, "id-401")],
  ["p1"],
  "a student is in the matrix when any of their scores is in the group"
);
assert.deepEqual([...scopedScoreProfileIds(scores, "id-501")], []);

// ------------------------------------------------------- the glue, statically
// state/scope.ts reaches for signals and localStorage, so it cannot be imported
// here. These are the three things about it worth failing a build over.
const { readFileSync } = await import("node:fs");
const scopeState = readFileSync(new URL("../src/state/scope.ts", import.meta.url), "utf8");
const configSource = readFileSync(new URL("../src/config.ts", import.meta.url), "utf8");

assert.match(
  configSource,
  /scopeStorageKey: "cp\.scope"/,
  "the scope storage key belongs in config beside the theme and language keys"
);
assert.match(
  scopeState,
  /config\.scopeStorageKey/,
  "state/scope.ts must persist through the config key, never a literal"
);
// Private browsing throws on localStorage. Losing the remembered choice is
// fine; a white top bar is not.
assert.match(
  scopeState,
  /try \{[\s\S]{0,400}?localStorage[\s\S]{0,400}?\} catch/,
  "every localStorage access in state/scope.ts must be inside try/catch"
);
assert.match(
  scopeState,
  /resolveScope\(/,
  "the live scope must go through resolveScope so a stale saved group falls back"
);

// ------------------------------------------------------------- the switcher
// Pitfall #12: a feature no user can reach is a feature that did not ship.
const app = readFileSync(new URL("../src/app.tsx", import.meta.url), "utf8");
const switcher = readFileSync(new URL("../src/components/ScopeSwitcher.tsx", import.meta.url), "utf8");
const strings = readFileSync(new URL("../src/i18n/strings.ts", import.meta.url), "utf8");

assert.match(app, /<ScopeSwitcher\s*\/>/, "the switcher must be rendered from the top bar");
assert.match(
  app,
  /import \{ ScopeSwitcher \} from "\.\/components\/ScopeSwitcher"/,
  "app.tsx must import the switcher"
);
assert.match(
  app,
  /loadScopeGroups\(\)/,
  "the instructor surface must ask for the full group list once"
);
assert.match(
  switcher,
  /scopeOptions\.value\.length < 2/,
  "one entry or fewer means no switcher — a single-group instructor's app is untouched"
);
assert.match(switcher, /<optgroup/, "the menu is two labelled halves, instructor above admin");

for (const key of [
  "scope.label",
  "scope.instructor",
  "scope.admin",
  "scope.allGroups",
  "scope.youTeach",
  "scope.viewingForeign"
]) {
  assert.match(
    strings,
    new RegExp(`"${key.replace(".", "\\.")}": \\[`),
    `${key} must exist as a bilingual pair`
  );
}

// -------------------------------------------------------- screens must ask
// The whole point of one filter module is that no screen writes its own rule.
const home = readFileSync(new URL("../src/screens/instructor/Home.tsx", import.meta.url), "utf8");

assert.match(app, /<ScopeBanner\s*\/>/, "the banner must be rendered once for every Teach screen");
assert.match(
  home,
  /import \{[^}]*\bscopedSessions\b[^}]*\} from "\.\.\/\.\.\/features\/scope\/filters"/,
  "Teach home must narrow its classes through the shared filter"
);
assert.match(
  home,
  /scopedSessions\(ctx\.teacher_sessions/,
  "Teach home's list must come out of scopedSessions, not straight off the context"
);
assert.match(
  home,
  /isAllGroups\.value \? <th>\{t\("teach\.col\.section"\)\}<\/th> : null/,
  "the Group column belongs to the all-groups view only"
);

console.log("verify-scope-filter: OK");
