# Admin / instructor scope switcher — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put one switcher in the top bar that narrows every Teach screen to a single group — the professor's own Group 401 under INSTRUCTOR, or any group under ADMIN — while "All groups" keeps today's behaviour exactly.

**Architecture:** Two pure modules hold every rule (`features/scope/model.ts` for the menu and the saved choice, `features/scope/filters.ts` for narrowing rows). A thin signal module (`state/scope.ts`) wires them to the app and to `localStorage`. Each Teach screen asks the filters instead of inventing its own rule, and one new verifier fails the build if a screen stops asking.

**Tech Stack:** Vite + TypeScript + Preact, `@preact/signals`, `preact-iso` router. Tests are Node `.mjs` verifiers under `tools/` — Node 26 imports `.ts` directly, which is how `tools/verify-auto-reveal.mjs` already tests `src/features/live/autoReveal.ts`.

**Spec:** `docs/superpowers/specs/2026-08-15-admin-instructor-scope-switcher-design.md`

**Branch:** `feat/instructor-admin-scope-switcher` (already created, spec already committed there).

## Global Constraints

- **No edge function is edited or deployed.** All filtering is in the browser. The server's per-section guard for non-owner instructors stays exactly as it is.
- **Every user-facing string is added to `src/i18n/strings.ts` as an EN + ES pair.** `tools/verify-i18n.mjs` fails the build otherwise.
- **`src/features/scope/model.ts` and `src/features/scope/filters.ts` must stay pure** — no `@preact/signals`, no `localStorage`, no network, no `.tsx` imports. Type-only imports are fine (they are erased). `tools/verify-scope-filter.mjs` imports both under plain Node and will crash if this is broken.
- **Components live at module scope.** A component defined inside another component remounts its whole subtree — `docs/07-pitfalls.md` #4.
- **`npm run verify` and `npm run typecheck` must both pass before every commit.** 40 verifiers pass today; 41 after Task 1.
- **`activeSectionId === null` means no filtering at all.** Every screen must behave exactly as it does today in that case.
- **Manual testing happens in Groups 501 and 502 only.** Group 402 holds ~26 real students and Group 401 is the live teaching group where a half-finished class is deliberate. Never open, run, end, reset or delete a class in 401 or 402.

---

### Task 1: The scope model (menu, saved choice, defaults)

**Files:**
- Create: `src/features/scope/model.ts`
- Create: `tools/verify-scope-filter.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Scope = { kind: "instructor"; sectionId: string } | { kind: "admin"; sectionId: string | null }`
  - `interface ScopeGroup { id: string; section_code: string; section_name: string }`
  - `interface ScopeInput { groups: ScopeGroup[]; myGroupIds: string[]; isOwner: boolean }`
  - `interface ScopeOption { value: string; scope: Scope; section: "instructor" | "admin"; groupLabel: string | null; youTeach: boolean }`
  - `serializeScope(scope: Scope): string`
  - `parseScope(raw: string | null | undefined): Scope | null`
  - `groupName(group: ScopeGroup): string`
  - `defaultScope(input: ScopeInput): Scope | null`
  - `buildScopeOptions(input: ScopeInput): ScopeOption[]`
  - `resolveScope(saved: Scope | null, input: ScopeInput): Scope | null`
  - `activeSectionId(scope: Scope | null): string | null`
  - `isForeignGroup(scope: Scope | null, myGroupIds: string[]): boolean`

- [ ] **Step 1: Write the failing verifier**

Create `tools/verify-scope-filter.mjs`:

```js
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

console.log("verify-scope-filter: OK");
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tools/verify-scope-filter.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` — `src/features/scope/model.ts` does not exist.

- [ ] **Step 3: Write the model**

Create `src/features/scope/model.ts`:

```ts
// Which group the Teach surface is looking at, and the menu that changes it.
//
// Pure on purpose: no signals, no network, no browser. tools/verify-scope-filter.mjs
// imports this file directly under plain Node, so nothing here may reach for
// localStorage, @preact/signals or i18n. That is also why the All-groups entry
// carries a null label — translating it is the component's job, not this file's.

export type Scope =
  | { kind: "instructor"; sectionId: string }
  | { kind: "admin"; sectionId: string | null }; // null = all groups

export interface ScopeGroup {
  id: string;
  section_code: string;
  section_name: string;
}

export interface ScopeInput {
  /** Every group this person may look at. For an owner, all of them. */
  groups: ScopeGroup[];
  /** The subset they actually teach, from their own section enrolments. */
  myGroupIds: string[];
  isOwner: boolean;
}

export interface ScopeOption {
  /** Stable string for <option value> and for comparing the current choice. */
  value: string;
  scope: Scope;
  section: "instructor" | "admin";
  /** The group's own name, or null for the All-groups entry. */
  groupLabel: string | null;
  youTeach: boolean;
}

/** The group's own words. Matches how People's group picker already reads. */
export function groupName(group: ScopeGroup): string {
  return group.section_name || group.section_code || "";
}

export function serializeScope(scope: Scope): string {
  if (scope.kind === "instructor") return `instructor:${scope.sectionId}`;
  return `admin:${scope.sectionId ?? "all"}`;
}

export function parseScope(raw: string | null | undefined): Scope | null {
  const text = String(raw ?? "");
  const separator = text.indexOf(":");
  if (separator < 1) return null;
  const kind = text.slice(0, separator);
  const rest = text.slice(separator + 1);
  if (kind === "instructor") return rest ? { kind: "instructor", sectionId: rest } : null;
  if (kind === "admin") {
    if (rest === "all") return { kind: "admin", sectionId: null };
    return rest ? { kind: "admin", sectionId: rest } : null;
  }
  return null;
}

function byCode(groups: ScopeGroup[]): ScopeGroup[] {
  return [...groups].sort((a, b) => groupName(a).localeCompare(groupName(b)));
}

function mineFirst(input: ScopeInput): ScopeGroup[] {
  return byCode(input.groups.filter((group) => input.myGroupIds.includes(group.id)));
}

export function buildScopeOptions(input: ScopeInput): ScopeOption[] {
  const options: ScopeOption[] = mineFirst(input).map((group) => ({
    value: serializeScope({ kind: "instructor", sectionId: group.id }),
    scope: { kind: "instructor", sectionId: group.id },
    section: "instructor",
    groupLabel: groupName(group),
    youTeach: true
  }));

  if (!input.isOwner) return options;

  options.push({
    value: serializeScope({ kind: "admin", sectionId: null }),
    scope: { kind: "admin", sectionId: null },
    section: "admin",
    groupLabel: null,
    youTeach: false
  });

  // Only the groups you do NOT teach. Owner controls stay visible in Instructor
  // mode, so an "Admin · Group 401" entry would render a screen identical to
  // "Instructor · Group 401" — two menu entries for one view is a bug.
  const theirs = byCode(input.groups.filter((group) => !input.myGroupIds.includes(group.id)));
  for (const group of theirs) {
    options.push({
      value: serializeScope({ kind: "admin", sectionId: group.id }),
      scope: { kind: "admin", sectionId: group.id },
      section: "admin",
      groupLabel: groupName(group),
      youTeach: false
    });
  }
  return options;
}

export function defaultScope(input: ScopeInput): Scope | null {
  const mine = mineFirst(input);
  if (mine.length) return { kind: "instructor", sectionId: mine[0].id };
  if (input.isOwner) return { kind: "admin", sectionId: null };
  return null;
}

/** A saved choice is honoured only while it still names something in the menu.
 *  An archived group, or an admin scope saved before ownership was removed,
 *  falls back to the default rather than rendering an empty screen. */
export function resolveScope(saved: Scope | null, input: ScopeInput): Scope | null {
  if (saved) {
    const wanted = serializeScope(saved);
    if (buildScopeOptions(input).some((option) => option.value === wanted)) return saved;
  }
  return defaultScope(input);
}

/** null means "all groups", which every filter reads as "do not filter". */
export function activeSectionId(scope: Scope | null): string | null {
  return scope ? scope.sectionId : null;
}

export function isForeignGroup(scope: Scope | null, myGroupIds: string[]): boolean {
  const id = activeSectionId(scope);
  return id !== null && !myGroupIds.includes(id);
}
```

- [ ] **Step 4: Run the verifier and the whole suite**

```bash
node tools/verify-scope-filter.mjs && npm run verify && npm run typecheck
```

Expected: `verify-scope-filter: OK`, then `All 41 verifiers passed.`, then typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add src/features/scope/model.ts tools/verify-scope-filter.mjs
git commit -m "Scope model: the switcher menu, its saved choice, and its fallbacks"
```

---

### Task 2: The row filters

**Files:**
- Create: `src/features/scope/filters.ts`
- Modify: `tools/verify-scope-filter.mjs` (append a section)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime (both modules are independent).
- Produces:
  - `inScope(sectionId: string | null | undefined, active: string | null): boolean`
  - `scopedSessions<T extends { section_id?: string | null }>(sessions: readonly T[], active: string | null): T[]`
  - `personSectionIds(person: RosterLike): string[]`
  - `scopedRoster<T extends RosterLike>(roster: readonly T[], active: string | null): T[]`
  - `ungroupedPeople<T extends RosterLike>(roster: readonly T[], active: string | null): T[]`
  - `scopedReleases<T extends { section_id?: string | null }>(releases: readonly T[], active: string | null): T[]`
  - `scopedScoreProfileIds<T extends { profile_id: string; section_id?: string | null }>(scores: readonly T[], active: string | null): Set<string>`
  - `interface RosterLike { sections?: Array<{ section_id: string; status?: string }> | null }`

- [ ] **Step 1: Append the failing assertions to the verifier**

Add to the end of `tools/verify-scope-filter.mjs`, immediately **before** the final `console.log` line:

```js
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tools/verify-scope-filter.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` — `src/features/scope/filters.ts` does not exist.

- [ ] **Step 3: Write the filters**

Create `src/features/scope/filters.ts`:

```ts
// The one place a Teach screen narrows its rows to the group in the switcher.
// Every screen calls these instead of writing its own `=== section_id`, so
// screen number six cannot quietly forget.
//
// Pure, for the same reason as model.ts: tools/verify-scope-filter.mjs imports
// this under plain Node. `active === null` always means "all groups", and every
// function must return the input untouched in that case — that is what keeps
// today's behaviour exactly as it is.

export interface RosterLike {
  sections?: Array<{ section_id: string; status?: string }> | null;
}

export function inScope(sectionId: string | null | undefined, active: string | null): boolean {
  if (active === null) return true;
  return sectionId != null && String(sectionId) === active;
}

export function scopedSessions<T extends { section_id?: string | null }>(
  sessions: readonly T[],
  active: string | null
): T[] {
  return sessions.filter((session) => inScope(session.section_id, active));
}

/** The groups a person is actually in. A dropped enrolment is not a group. */
export function personSectionIds(person: RosterLike): string[] {
  return (person.sections ?? [])
    .filter((enrolment) => enrolment.status !== "dropped")
    .map((enrolment) => String(enrolment.section_id));
}

export function scopedRoster<T extends RosterLike>(roster: readonly T[], active: string | null): T[] {
  if (active === null) return [...roster];
  return roster.filter((person) => personSectionIds(person).includes(active));
}

/** People in no group at all. A student who was just imported has none, and a
 *  group view that hid them would make importing a roster and then assigning it
 *  impossible. Empty for All groups, which already lists everyone once. */
export function ungroupedPeople<T extends RosterLike>(
  roster: readonly T[],
  active: string | null
): T[] {
  if (active === null) return [];
  return roster.filter((person) => personSectionIds(person).length === 0);
}

export function scopedReleases<T extends { section_id?: string | null }>(
  releases: readonly T[],
  active: string | null
): T[] {
  if (active === null) return [...releases];
  // A release with no group is course-wide: that group really can open it, and
  // hiding it would misrepresent what its students see.
  return releases.filter((release) => release.section_id == null || inScope(release.section_id, active));
}

/** Which students belong in the matrix. Built from the scores that are in the
 *  group, so a student's row can then carry all of their scores — including any
 *  older row that has no section_id — without leaking another group's student. */
export function scopedScoreProfileIds<T extends { profile_id: string; section_id?: string | null }>(
  scores: readonly T[],
  active: string | null
): Set<string> {
  const wanted = active === null ? scores : scores.filter((score) => inScope(score.section_id, active));
  return new Set(wanted.map((score) => String(score.profile_id)));
}
```

- [ ] **Step 4: Run the verifier and the whole suite**

```bash
node tools/verify-scope-filter.mjs && npm run verify && npm run typecheck
```

Expected: `verify-scope-filter: OK`, `All 41 verifiers passed.`, typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add src/features/scope/filters.ts tools/verify-scope-filter.mjs
git commit -m "Scope filters: one rule for narrowing rows to the chosen group"
```

---

### Task 3: The scope signal and its storage key

**Files:**
- Modify: `src/config.ts` (add `scopeStorageKey` beside `themeStorageKey`)
- Create: `src/state/scope.ts`
- Modify: `tools/verify-scope-filter.mjs` (append a static section)

**Interfaces:**
- Consumes: everything from `features/scope/model.ts` and `features/scope/filters.ts`; `context`, `isOwner` from `state/session`; `listSections` from `api/schedule`.
- Produces (all from `src/state/scope.ts`):
  - `scope: ReadonlySignal<Scope | null>`
  - `scopeOptions: ReadonlySignal<ScopeOption[]>`
  - `activeSectionId: ReadonlySignal<string | null>`
  - `isAllGroups: ReadonlySignal<boolean>`
  - `isForeignGroup: ReadonlySignal<boolean>`
  - `activeGroupName: ReadonlySignal<string>`
  - `myGroupIds: ReadonlySignal<string[]>`
  - `setScope(next: Scope): void`
  - `setScopeToSection(sectionId: string): boolean` — used by People's `?group=` link
  - `loadScopeGroups(): Promise<void>`

- [ ] **Step 1: Append the failing assertions to the verifier**

Add to `tools/verify-scope-filter.mjs`, immediately before the final `console.log`:

```js
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tools/verify-scope-filter.mjs
```

Expected: `ENOENT` for `src/state/scope.ts`.

- [ ] **Step 3: Add the config key**

In `src/config.ts`, replace this line:

```ts
  themeStorageKey: "cp.theme"
```

with:

```ts
  themeStorageKey: "cp.theme",

  // Which group the Teach surface is looking at. Per device, like the theme.
  scopeStorageKey: "cp.scope"
```

- [ ] **Step 4: Write the scope signal module**

Create `src/state/scope.ts`:

```ts
// Which group the Teach surface is looking at.
//
// Thin on purpose: every rule lives in features/scope/model.ts, which a Node
// verifier can import. This file is only signals, localStorage and one fetch.
import { computed, signal } from "@preact/signals";
import { listSections } from "../api/schedule";
import { config } from "../config";
import { context, isOwner } from "./session";
import {
  activeSectionId as sectionIdOf,
  buildScopeOptions,
  groupName,
  isForeignGroup as scopeIsForeign,
  parseScope,
  resolveScope,
  serializeScope,
  type Scope,
  type ScopeGroup,
  type ScopeInput,
  type ScopeOption
} from "../features/scope/model";

const TEACHING_ROLES = ["instructor", "teaching_assistant"];

/** Every group the person may look at. null until listSections() lands. */
const allGroups = signal<ScopeGroup[] | null>(null);

function readSavedScope(): Scope | null {
  try {
    return parseScope(localStorage.getItem(config.scopeStorageKey));
  } catch {
    // Private browsing: the choice simply is not remembered.
    return null;
  }
}

const savedScope = signal<Scope | null>(readSavedScope());

/** Until the full list arrives — or if it never does — the person's own
 *  enrolments are the only groups we know about. A shorter menu is a fine
 *  outcome; a broken top bar is not. */
function ownEnrolmentGroups(): ScopeGroup[] {
  return (context.value?.sections ?? []).map((section) => ({
    id: section.id,
    section_code: section.section_code,
    section_name: section.section_name
  }));
}

export const myGroupIds = computed<string[]>(() =>
  (context.value?.sections ?? [])
    .filter((section) => TEACHING_ROLES.includes(String(section.role)))
    .map((section) => section.id)
);

const scopeInput = computed<ScopeInput>(() => ({
  groups: allGroups.value ?? ownEnrolmentGroups(),
  myGroupIds: myGroupIds.value,
  isOwner: isOwner.value
}));

export const scope = computed<Scope | null>(() => resolveScope(savedScope.value, scopeInput.value));
export const scopeOptions = computed<ScopeOption[]>(() => buildScopeOptions(scopeInput.value));
export const activeSectionId = computed<string | null>(() => sectionIdOf(scope.value));
export const isAllGroups = computed<boolean>(() => activeSectionId.value === null);
export const isForeignGroup = computed<boolean>(() => scopeIsForeign(scope.value, myGroupIds.value));

export const activeGroupName = computed<string>(() => {
  const id = activeSectionId.value;
  if (!id) return "";
  const group = (allGroups.value ?? ownEnrolmentGroups()).find((candidate) => candidate.id === id);
  return group ? groupName(group) : "";
});

export function setScope(next: Scope) {
  savedScope.value = next;
  try {
    localStorage.setItem(config.scopeStorageKey, serializeScope(next));
  } catch {
    // The choice still applies for this session.
  }
}

/** Point the app at one group by id — the shape a `?group=` link needs.
 *  Returns false when the id names nothing in the menu, so the caller can
 *  ignore a stale link rather than blanking the screen. */
export function setScopeToSection(sectionId: string): boolean {
  const wanted = myGroupIds.value.includes(sectionId)
    ? ({ kind: "instructor", sectionId } as Scope)
    : ({ kind: "admin", sectionId } as Scope);
  const value = serializeScope(wanted);
  if (!scopeOptions.value.some((option) => option.value === value)) return false;
  if (serializeScope(scope.value ?? wanted) === value && scope.value) return true;
  setScope(wanted);
  return true;
}

/** Called once when the instructor surface mounts. Owners get every group;
 *  anyone else gets the ones the server already lets them manage. */
export async function loadScopeGroups(): Promise<void> {
  if (allGroups.value) return;
  try {
    const { sections } = await listSections();
    allGroups.value = sections.map((section) => ({
      id: section.id,
      section_code: section.section_code,
      section_name: section.section_name
    }));
  } catch {
    // course-section-management refuses a teaching assistant outright. Fall back
    // to their own enrolments; no error, just a shorter menu.
    allGroups.value = ownEnrolmentGroups();
  }
}
```

- [ ] **Step 5: Run the verifier and the whole suite**

```bash
node tools/verify-scope-filter.mjs && npm run verify && npm run typecheck
```

Expected: `verify-scope-filter: OK`, `All 41 verifiers passed.`, typecheck silent.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/state/scope.ts tools/verify-scope-filter.mjs
git commit -m "Scope signal: remember the chosen group per device"
```

---

### Task 4: The switcher in the top bar

**Files:**
- Create: `src/components/ScopeSwitcher.tsx`
- Modify: `src/i18n/strings.ts` (six new pairs)
- Modify: `src/app.tsx` (`Topbar`, and load the group list on the instructor surface)
- Modify: `src/styles/app.css` (one rule)
- Modify: `tools/verify-scope-filter.mjs` (append)

**Interfaces:**
- Consumes: `scope`, `scopeOptions`, `setScope`, `loadScopeGroups` from `state/scope`; `parseScope` from `features/scope/model`.
- Produces: `<ScopeSwitcher />`, rendered from `Topbar` in `src/app.tsx`.

- [ ] **Step 1: Append the failing assertions to the verifier**

Add to `tools/verify-scope-filter.mjs`, before the final `console.log`:

```js
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tools/verify-scope-filter.mjs
```

Expected: `ENOENT` for `src/components/ScopeSwitcher.tsx`.

- [ ] **Step 3: Add the strings**

In `src/i18n/strings.ts`, immediately after the `"app.pressAgainConfirm"` line, insert:

```ts
  // --------------------------------------------------------- scope switcher
  "scope.label": ["What you are looking at", "Lo que estás viendo"],
  "scope.instructor": ["Instructor", "Profesor"],
  "scope.admin": ["Admin", "Administración"],
  "scope.allGroups": ["All groups", "Todos los grupos"],
  "scope.youTeach": ["{group} (you teach this)", "{group} (tú lo impartes)"],
  "scope.viewingForeign": [
    "Viewing {group} — you are not the instructor of this group.",
    "Estás viendo {group} — no eres el profesor de este grupo."
  ],
```

- [ ] **Step 4: Write the switcher**

Create `src/components/ScopeSwitcher.tsx`:

```tsx
// The one control that separates "I am teaching Group 401" from "I am the
// owner looking at all of it". A native <select> with two <optgroup>s: it is
// keyboard- and screen-reader-correct for free, and it needs no new machinery.
//
// Module scope, per docs/07-pitfalls.md #4.
import { parseScope, serializeScope } from "../features/scope/model";
import { scope, scopeOptions, setScope } from "../state/scope";
import { t } from "../i18n";

export function ScopeSwitcher() {
  // One entry means there is nothing to switch between: an instructor who
  // teaches a single group sees no control and no change to their app.
  if (scopeOptions.value.length < 2) return null;

  const mine = scopeOptions.value.filter((option) => option.section === "instructor");
  const admin = scopeOptions.value.filter((option) => option.section === "admin");
  const current = scope.value ? serializeScope(scope.value) : "";

  return (
    <div class="scope-switcher">
      <select
        value={current}
        aria-label={t("scope.label")}
        onChange={(event) => {
          const next = parseScope((event.target as HTMLSelectElement).value);
          if (next) setScope(next);
        }}
      >
        {mine.length ? (
          <optgroup label={t("scope.instructor")}>
            {mine.map((option) => (
              <option value={option.value}>
                {t("scope.youTeach", { group: option.groupLabel ?? "" })}
              </option>
            ))}
          </optgroup>
        ) : null}
        {admin.length ? (
          <optgroup label={t("scope.admin")}>
            {admin.map((option) => (
              <option value={option.value}>{option.groupLabel ?? t("scope.allGroups")}</option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </div>
  );
}
```

- [ ] **Step 5: Render it from the top bar**

In `src/app.tsx`, add these imports beside the existing component imports:

```ts
import { ScopeSwitcher } from "./components/ScopeSwitcher";
import { loadScopeGroups } from "./state/scope";
```

Then in `Topbar`, replace:

```tsx
      <span class="spacer" />
      {profile ? <span class="hint">{profile.preferred_name || profile.full_name}</span> : null}
```

with:

```tsx
      {surface.value === "instructor" ? <ScopeSwitcher /> : null}
      <span class="spacer" />
      {profile ? <span class="hint">{profile.preferred_name || profile.full_name}</span> : null}
```

And in `InstructorSurface`, add the one-off group load at the top of the function body, before `const studentPreview = …`:

```tsx
  useEffect(() => {
    void loadScopeGroups();
  }, []);
```

`useEffect` is already imported at the top of `app.tsx`.

- [ ] **Step 6: Add the one CSS rule**

In `src/styles/app.css`, immediately after the `.topbar .spacer { flex: 1; }` line, add:

```css
/* The switcher sits with the toggles, not with the wordmark: it is something
   you change, not something that names the page. */
.scope-switcher select {
  max-width: 14rem;
  font-size: 0.85rem;
  padding: 0.3rem 0.5rem;
}
```

And inside the existing `@media (max-width: 480px)` block that already hides `.topbar .hint`, add:

```css
  .scope-switcher select { max-width: 8.5rem; font-size: 0.8rem; }
```

- [ ] **Step 7: Run everything**

```bash
node tools/verify-scope-filter.mjs && npm run verify && npm run typecheck
```

Expected: `verify-scope-filter: OK`, `All 41 verifiers passed.`, typecheck silent.

- [ ] **Step 8: Look at it**

```bash
npm run dev
```

Sign in as the professor. The top bar shows a dropdown reading `Group 401 (you teach this)`, with INSTRUCTOR and ADMIN headings inside. Nothing on any screen has changed yet — only the control exists.

- [ ] **Step 9: Commit**

```bash
git add src/components/ScopeSwitcher.tsx src/app.tsx src/i18n/strings.ts src/styles/app.css tools/verify-scope-filter.mjs
git commit -m "Scope switcher in the top bar, instructor above admin"
```

---

### Task 5: The foreign-group banner, and Teach home

**Files:**
- Create: `src/components/ScopeBanner.tsx`
- Modify: `src/app.tsx` (`InstructorSurface`)
- Modify: `src/screens/instructor/Home.tsx`
- Modify: `tools/verify-scope-filter.mjs` (append)

**Interfaces:**
- Consumes: `isForeignGroup`, `activeGroupName`, `activeSectionId`, `isAllGroups` from `state/scope`; `scopedSessions` from `features/scope/filters`.
- Produces: `<ScopeBanner />`, rendered once in `InstructorSurface` so it covers every Teach screen.

- [ ] **Step 1: Append the failing assertions**

Add to `tools/verify-scope-filter.mjs`, before the final `console.log`:

```js
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tools/verify-scope-filter.mjs
```

Expected: AssertionError — `the banner must be rendered once for every Teach screen`.

- [ ] **Step 3: Write the banner**

Create `src/components/ScopeBanner.tsx`:

```tsx
// You are about to change real students' grades, and the only thing telling
// you whose is a value in a dropdown. This says it out loud.
//
// Module scope, per docs/07-pitfalls.md #4.
import { activeGroupName, isForeignGroup } from "../state/scope";
import { t } from "../i18n";

export function ScopeBanner() {
  if (!isForeignGroup.value) return null;
  return (
    <p class="hint" role="status">
      {t("scope.viewingForeign", { group: activeGroupName.value })}
    </p>
  );
}
```

- [ ] **Step 4: Render it once, above every Teach screen**

In `src/app.tsx`, add the import:

```ts
import { ScopeBanner } from "./components/ScopeBanner";
```

In `InstructorSurface`, replace:

```tsx
      {studentPreview ? null : <InstructorNav />}
```

with:

```tsx
      {studentPreview ? null : <InstructorNav />}
      {studentPreview ? null : <ScopeBanner />}
```

- [ ] **Step 5: Narrow Teach home**

In `src/screens/instructor/Home.tsx`, add the imports:

```ts
import { scopedSessions } from "../../features/scope/filters";
import { activeSectionId, isAllGroups } from "../../state/scope";
```

Replace:

```tsx
  const sessions = [...(ctx.teacher_sessions ?? [])].sort((a, b) =>
    String(a.planned_date ?? "").localeCompare(String(b.planned_date ?? ""))
  );
```

with:

```tsx
  const sessions = scopedSessions(ctx.teacher_sessions ?? [], activeSectionId.value)
    .sort((a, b) => String(a.planned_date ?? "").localeCompare(String(b.planned_date ?? "")));
```

Then drop the Group column when there is only one group on screen. Replace:

```tsx
                <th>{t("teach.col.section")}</th>
```

with:

```tsx
                {isAllGroups.value ? <th>{t("teach.col.section")}</th> : null}
```

and replace:

```tsx
                  <td>{s.section_code || "—"}</td>
```

with:

```tsx
                  {isAllGroups.value ? <td>{s.section_code || "—"}</td> : null}
```

- [ ] **Step 6: Run everything**

```bash
node tools/verify-scope-filter.mjs && npm run verify && npm run typecheck
```

Expected: `verify-scope-filter: OK`, `All 41 verifiers passed.`, typecheck silent.

- [ ] **Step 7: Look at it**

```bash
npm run dev
```

On `/teach`: with **Instructor · Group 401** selected, only 401's classes are listed and the Group column is gone. Switch to **Admin · All groups** — every group returns, Group column back. Switch to **Admin · Group 501** — the banner appears above the nav.

- [ ] **Step 8: Commit**

```bash
git add src/components/ScopeBanner.tsx src/app.tsx src/screens/instructor/Home.tsx tools/verify-scope-filter.mjs
git commit -m "Teach home follows the switcher, and a banner names a group you do not teach"
```

---

### Task 6: Classes — the schedule and the group list

**Files:**
- Modify: `src/components/Schedule.tsx`
- Modify: `src/components/Sections.tsx`
- Modify: `tools/verify-scope-filter.mjs` (append)

**Interfaces:**
- Consumes: `scopedSessions`, `inScope` from `features/scope/filters`; `activeSectionId`, `isAllGroups` from `state/scope`.
- Produces: nothing new.

- [ ] **Step 1: Append the failing assertions**

Add to `tools/verify-scope-filter.mjs`, before the final `console.log`:

```js
const schedule = readFileSync(new URL("../src/components/Schedule.tsx", import.meta.url), "utf8");
const sectionsView = readFileSync(new URL("../src/components/Sections.tsx", import.meta.url), "utf8");

assert.match(
  schedule,
  /import \{[^}]*\bscopedSessions\b[^}]*\} from "\.\.\/features\/scope\/filters"/,
  "the schedule must narrow its class days through the shared filter"
);
assert.match(
  schedule,
  /const visible = scopedSessions\(/,
  "the schedule's visible list is the scoped one"
);
assert.match(
  sectionsView,
  /import \{[^}]*\binScope\b[^}]*\} from "\.\.\/features\/scope\/filters"/,
  "the group list must narrow to the chosen group"
);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tools/verify-scope-filter.mjs
```

Expected: AssertionError — `the schedule must narrow its class days through the shared filter`.

- [ ] **Step 3: Narrow the schedule**

In `src/components/Schedule.tsx`, add the imports:

```ts
import { scopedSessions } from "../features/scope/filters";
import { activeSectionId, isAllGroups } from "../state/scope";
```

Replace:

```tsx
  const usableSections = sections.filter((s) => ["planned", "active"].includes(s.status));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const visible = sessions;
```

with:

```tsx
  const active = activeSectionId.value;
  // A new class day belongs to the group you are looking at. Offering the
  // others here would let you file it against a group that is not on screen.
  const usableSections = sections
    .filter((s) => ["planned", "active"].includes(s.status))
    .filter((s) => active === null || s.id === active);
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const visible = scopedSessions(sessions, active);
```

The existing `setSectionId` default in `load()` picks the first usable section and stays correct, but it runs before the scope is known. Add this effect immediately after the existing `useEffect(() => { void load(); }, [])`:

```tsx
  // Keep the "add a class day" group in step with the switcher, including when
  // the professor changes groups while this screen is open.
  useEffect(() => {
    if (activeSectionId.value) setSectionId(activeSectionId.value);
  }, [activeSectionId.value]);
```

Then drop the Group column when a single group is on screen. Replace:

```tsx
                <th>{t("schedule.col.group")}</th>
```

with:

```tsx
                {isAllGroups.value ? <th>{t("schedule.col.group")}</th> : null}
```

and replace:

```tsx
                      <td>{section?.section_code ?? session.section_code ?? "—"}</td>
```

with:

```tsx
                      {isAllGroups.value
                        ? <td>{section?.section_code ?? session.section_code ?? "—"}</td>
                        : null}
```

Finally, hide the now-single-option group picker in the add form. Replace:

```tsx
              <label class="field">
                {t("schedule.group")}
                <select
                  value={sectionId}
                  onChange={(e) => setSectionId((e.target as HTMLSelectElement).value)}
                >
                  {usableSections.map((s) => (
                    <option value={s.id}>{s.section_name || s.section_code}</option>
                  ))}
                </select>
              </label>
```

with:

```tsx
              {isAllGroups.value ? (
                <label class="field">
                  {t("schedule.group")}
                  <select
                    value={sectionId}
                    onChange={(e) => setSectionId((e.target as HTMLSelectElement).value)}
                  >
                    {usableSections.map((s) => (
                      <option value={s.id}>{s.section_name || s.section_code}</option>
                    ))}
                  </select>
                </label>
              ) : null}
```

- [ ] **Step 4: Narrow the group list**

In `src/components/Sections.tsx`, add the imports:

```ts
import { inScope } from "../features/scope/filters";
import { activeSectionId } from "../state/scope";
```

Find where the component renders its rows from `sections` and narrow the source. Immediately after the guard that returns while `sections` is null, add:

```tsx
  const visibleSections = sections.filter((section) => inScope(section.id, activeSectionId.value));
```

Then use `visibleSections` everywhere the table body currently maps over `sections`. Leave every owner control — Add a group, Edit, Retire — exactly as it is: they were explicitly kept visible in every mode.

- [ ] **Step 5: Run everything**

```bash
node tools/verify-scope-filter.mjs && npm run verify && npm run typecheck
```

Expected: `verify-scope-filter: OK`, `All 41 verifiers passed.`, typecheck silent.

- [ ] **Step 6: Look at it**

```bash
npm run dev
```

On `/teach/classes`: in **Instructor · Group 401**, only 401's class days and only the 401 row in Groups; the add form has no group picker and files against 401. In **Admin · All groups**, everything and the picker return.

- [ ] **Step 7: Commit**

```bash
git add src/components/Schedule.tsx src/components/Sections.tsx tools/verify-scope-filter.mjs
git commit -m "Classes follows the switcher; a new class day lands in the group on screen"
```

---

### Task 7: People — the roster, the ungrouped, and the `?group=` link

**Files:**
- Modify: `src/screens/instructor/People.tsx`
- Modify: `src/i18n/strings.ts` (two new pairs)
- Modify: `tools/verify-scope-filter.mjs` (append)

**Interfaces:**
- Consumes: `scopedRoster`, `ungroupedPeople` from `features/scope/filters`; `activeSectionId`, `setScopeToSection` from `state/scope`.
- Produces: nothing new.

- [ ] **Step 1: Append the failing assertions**

Add to `tools/verify-scope-filter.mjs`, before the final `console.log`:

```js
const people = readFileSync(new URL("../src/screens/instructor/People.tsx", import.meta.url), "utf8");

assert.match(
  people,
  /import \{[^}]*\bscopedRoster\b[^}]*\} from "\.\.\/\.\.\/features\/scope\/filters"/,
  "People must narrow the roster through the shared filter"
);
assert.match(
  people,
  /\bungroupedPeople\b/,
  "People must still show students who are in no group yet, or a roster import strands them"
);
assert.match(
  people,
  /setScopeToSection\(/,
  "an existing ?group= link must move the switcher rather than fight it"
);
assert.match(
  strings,
  /"people\.ungroupedTitle": \[/,
  "the ungrouped block needs a bilingual heading"
);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tools/verify-scope-filter.mjs
```

Expected: AssertionError — `People must narrow the roster through the shared filter`.

- [ ] **Step 3: Add the strings**

In `src/i18n/strings.ts`, beside the other `people.*` pairs, add:

```ts
  "people.ungroupedTitle": ["Not in a group yet", "Todavía sin grupo"],
  "people.ungroupedBody": [
    "These people are on the course but have no group. Assign one to bring them into a class.",
    "Estas personas están en el curso pero no tienen grupo. Asigna uno para incluirlas en una clase."
  ],
```

- [ ] **Step 4: Narrow the roster and add the ungrouped block**

In `src/screens/instructor/People.tsx`, add the imports:

```ts
import { scopedRoster, ungroupedPeople } from "../../features/scope/filters";
import { activeSectionId, setScopeToSection } from "../../state/scope";
```

The screen already resolves `?group=` into `groupId`. Make that link move the switcher instead of running its own parallel filter. Immediately after the existing `const groupId = selectedGroup?.id ?? null;` line, add:

```tsx
  // The link predates the switcher. Rather than two competing ideas of what is
  // on screen, the link now moves the switcher and the top bar tells the truth.
  useEffect(() => {
    if (groupId) setScopeToSection(groupId);
  }, [groupId]);
```

Then replace the roster derivation:

```tsx
  const roster = (groupId
    ? (data?.roster ?? []).filter((person) => hasActiveStudentEnrollment(person.sections, groupId))
    : (data?.roster ?? [])
  ).filter(matchesSearch);
```

with:

```tsx
  const active = activeSectionId.value;
  const roster = scopedRoster(data?.roster ?? [], active).filter(matchesSearch);
  // A student who was just imported has no group at all. Without this list,
  // importing a roster inside a group view would leave nobody to assign.
  const ungrouped = ungroupedPeople(data?.roster ?? [], active).filter(matchesSearch);
```

`hasActiveStudentEnrollment` may now be unused; if TypeScript reports it, remove it from the import list at the top of the file.

Immediately after the closing tag of the roster `<div class="table-scroll">…</div>`, add the ungrouped block:

```tsx
      {ungrouped.length ? (
        <div class="card stack">
          <h3>{t("people.ungroupedTitle")}</h3>
          <p class="hint">{t("people.ungroupedBody")}</p>
          <div class="table-scroll">
            <table class="data">
              <thead>
                <tr>
                  <th>{t("people.col.name")}</th>
                  <th>{t("people.email")}</th>
                  <th>{t("people.group")}</th>
                </tr>
              </thead>
              <tbody>
                {ungrouped.map((person) => (
                  <tr key={person.profile_id}>
                    <td>{person.full_name}</td>
                    <td>{person.institutional_email}</td>
                    <td>
                      {person.course_role === "student" &&
                      person.membership_status === "active" &&
                      isAssignableStudentProfileStatus(person.profile_status) &&
                      person.profile_id !== myProfileId ? (
                        <GroupAssignment
                          person={person}
                          groups={groups ?? []}
                          courseGroupIds={courseGroupIds}
                          assigning={assigning === person.profile_id}
                          onAssign={(sectionId) => void assignGroup(person, sectionId)}
                        />
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
```

Leave the `groups` list passed to `GroupAssignment` unfiltered: moving a student from 401 into 402 is the entire point of that control, and filtering it would make the move impossible.

- [ ] **Step 5: Run everything**

```bash
node tools/verify-scope-filter.mjs && npm run verify && npm run typecheck
```

Expected: `verify-scope-filter: OK`, `All 41 verifiers passed.`, typecheck silent.

- [ ] **Step 6: Look at it**

```bash
npm run dev
```

On `/teach/people`: in **Instructor · Group 401**, only 401's people, plus a "Not in a group yet" card if anyone is unassigned. The group dropdown inside each row still lists every group. In **Admin · All groups**, the whole roster and no ungrouped card.

- [ ] **Step 7: Commit**

```bash
git add src/screens/instructor/People.tsx src/i18n/strings.ts tools/verify-scope-filter.mjs
git commit -m "People follows the switcher, and never strands a student with no group"
```

---

### Task 8: Grades — the semester matrix and the per-class tab

**Files:**
- Modify: `src/screens/instructor/Gradebook.tsx`
- Modify: `tools/verify-scope-filter.mjs` (append)

**Interfaces:**
- Consumes: `scopedScoreProfileIds`, `scopedSessions` from `features/scope/filters`; `activeSectionId` from `state/scope`.
- Produces: nothing new.

- [ ] **Step 1: Append the failing assertions**

Add to `tools/verify-scope-filter.mjs`, before the final `console.log`:

```js
const gradebook = readFileSync(new URL("../src/screens/instructor/Gradebook.tsx", import.meta.url), "utf8");

assert.match(
  gradebook,
  /import \{[^}]*\bscopedScoreProfileIds\b[^}]*\} from "\.\.\/\.\.\/features\/scope\/filters"/,
  "the matrix must pick its students through the shared filter"
);
assert.match(
  gradebook,
  /\bscopedSessions\b/,
  "the per-class tab and the unposted nudge must both narrow to the chosen group"
);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tools/verify-scope-filter.mjs
```

Expected: AssertionError — `the matrix must pick its students through the shared filter`.

- [ ] **Step 3: Narrow the per-class tab**

In `src/screens/instructor/Gradebook.tsx`, add the imports:

```ts
import { scopedScoreProfileIds, scopedSessions } from "../../features/scope/filters";
import { activeSectionId } from "../../state/scope";
```

In `PerClassReview`, replace:

```tsx
  const sessions = [...(context.value?.teacher_sessions ?? [])].reverse();
```

with:

```tsx
  const sessions = scopedSessions(
    context.value?.teacher_sessions ?? [],
    activeSectionId.value
  ).reverse();
```

The existing `useState` default reads `sessions` on first render only. Add this effect immediately after the existing `useEffect(() => { setSelectedStudentId(""); }, [sessionId])`:

```tsx
  // Changing groups must not leave the picker pointing at a class that is no
  // longer listed — the panels below would keep showing the old group's data.
  useEffect(() => {
    if (sessionId && sessions.some((session) => session.session_id === sessionId)) return;
    const firstHeldNow = sessions.find((session) => session.state !== "planned") ?? sessions[0];
    setSessionId(firstHeldNow?.session_id ?? "");
  }, [activeSectionId.value, sessions.length]);
```

- [ ] **Step 4: Narrow the matrix and the nudge**

In `Gradebook`, replace:

```tsx
  const students = new Map<
    string,
    { name: string; email: string; scores: Map<string, GradebookSummary["scores"][number]> }
  >();
  for (const score of data.scores) {
    const key = score.profile_id;
```

with:

```tsx
  // Students are chosen by the group their scores are in; each chosen student
  // then keeps all of their scores, including any older row with no section_id,
  // so a row is never half-built.
  const visibleProfileIds = scopedScoreProfileIds(data.scores, activeSectionId.value);
  const students = new Map<
    string,
    { name: string; email: string; scores: Map<string, GradebookSummary["scores"][number]> }
  >();
  for (const score of data.scores) {
    const key = score.profile_id;
    if (!visibleProfileIds.has(key)) continue;
```

Then narrow the unposted nudge. Replace:

```tsx
        const unposted = (context.value?.teacher_sessions ?? []).filter(
          (session) => session.state === "closed" && !postedSessionIds.has(session.session_id)
        );
```

with:

```tsx
        const unposted = scopedSessions(
          context.value?.teacher_sessions ?? [],
          activeSectionId.value
        ).filter(
          (session) => session.state === "closed" && !postedSessionIds.has(session.session_id)
        );
```

- [ ] **Step 5: Run everything**

```bash
node tools/verify-scope-filter.mjs && npm run verify && npm run typecheck
```

Expected: `verify-scope-filter: OK`, `All 41 verifiers passed.`, typecheck silent.

- [ ] **Step 6: Look at it**

```bash
npm run dev
```

On `/teach/grades`: in **Instructor · Group 401**, only 401's students in the matrix, and the per-class picker lists only 401's classes. Switch to **Admin · All groups** and everyone returns. Switch groups while the per-class tab is open and confirm the picker moves to a class in the new group rather than keeping the old one.

- [ ] **Step 7: Commit**

```bash
git add src/screens/instructor/Gradebook.tsx tools/verify-scope-filter.mjs
git commit -m "Grades follows the switcher, matrix and per-class alike"
```

---

### Task 9: Content — releases and class-linked panels

**Files:**
- Modify: `src/components/ContentLibrary.tsx`
- Modify: `tools/verify-scope-filter.mjs` (append)

**Interfaces:**
- Consumes: `scopedReleases`, `scopedSessions` from `features/scope/filters`; `activeSectionId` from `state/scope`.
- Produces: nothing new.

- [ ] **Step 1: Append the failing assertions**

Add to `tools/verify-scope-filter.mjs`, before the final `console.log`:

```js
const library = readFileSync(new URL("../src/components/ContentLibrary.tsx", import.meta.url), "utf8");

assert.match(
  library,
  /import \{[^}]*\bscopedReleases\b[^}]*\} from "\.\.\/features\/scope\/filters"/,
  "the content library must narrow releases through the shared filter"
);
assert.match(
  library,
  /\bscopedSessions\b/,
  "the class-linked panels must narrow to the chosen group too"
);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tools/verify-scope-filter.mjs
```

Expected: AssertionError — `the content library must narrow releases through the shared filter`.

- [ ] **Step 3: Narrow the library**

In `src/components/ContentLibrary.tsx`, add the imports:

```ts
import { scopedReleases, scopedSessions } from "../features/scope/filters";
import { activeSectionId } from "../state/scope";
```

Replace the release grouping:

```tsx
  const releasesByItem = new Map<string, ReleaseRow[]>();
  for (const release of releases) {
```

with:

```tsx
  const active = activeSectionId.value;
  // A release with no group is course-wide: Group 402 really can open it, so
  // hiding it would misrepresent what that group's students see.
  const visibleReleases = scopedReleases(releases, active);
  const releasesByItem = new Map<string, ReleaseRow[]>();
  for (const release of visibleReleases) {
```

Then narrow the class-linked panels. Every place the component maps over the `sessions` state to offer or list a class, read from a scoped list instead. Immediately after the guard that returns while `sessions` is null, add:

```tsx
  const visibleSessions = scopedSessions(sessions, active);
```

and use `visibleSessions` wherever the component currently maps over `sessions`.

Leave `library.shareable_sections` — the "share with group" target dropdown — unfiltered. Sharing content *into* another group is the point of it, exactly as with People's assignment dropdown.

- [ ] **Step 4: Run everything**

```bash
node tools/verify-scope-filter.mjs && npm run verify && npm run typecheck
```

Expected: `verify-scope-filter: OK`, `All 41 verifiers passed.`, typecheck silent.

- [ ] **Step 5: Look at it**

```bash
npm run dev
```

On `/teach/content`: in **Instructor · Group 401**, the availability lines describe 401 and whole-course releases only, and class pickers list 401's classes. The "share with a group" dropdown still lists every group.

- [ ] **Step 6: Commit**

```bash
git add src/components/ContentLibrary.tsx tools/verify-scope-filter.mjs
git commit -m "Content follows the switcher, whole-course releases included"
```

---

### Task 10: Prove it in production data, and write down what changed

**Files:**
- Modify: `docs/05-status.md`
- Modify: `docs/07-pitfalls.md` (one entry)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing in code.

- [ ] **Step 1: Run the full build**

```bash
npm run verify && npm run typecheck && npm run build
```

Expected: `All 41 verifiers passed.`, typecheck silent, vite build succeeds.

- [ ] **Step 2: Walk it through, in Groups 501 and 502 only**

```bash
npm run dev
```

**Do not open, run, end, reset or delete any class in Group 401 or Group 402.** 402 holds around 26 real students; 401 is the live teaching group and a class left half-finished there is deliberate.

Check each of these and note the result:

1. The switcher lists `Group 401 (you teach this)` under INSTRUCTOR, and `All groups`, `Group 402`, `Group 501`, `Group 502` under ADMIN. Group 401 appears once.
2. **Instructor · Group 401** — Home, Classes, Grades, People and Content each show 401 only. No Group column anywhere. No banner.
3. **Admin · All groups** — every group returns on all five screens, Group columns present, no banner.
4. **Admin · Group 501** — 501's view, banner reads "Viewing Group 501 — you are not the instructor of this group."
5. Reload the tab. The last choice is still selected.
6. Open `/teach/people?group=<501's id>` directly. The switcher moves to Group 501 and the roster matches.
7. Sign in as a QA student account enrolled in 501 and confirm the student surface is completely unchanged.

- [ ] **Step 3: Write the status entry**

At the top of `docs/05-status.md`, immediately under the `**Last updated:**` line (updating that date to 2026-08-15), add a section in the voice of the existing entries: what the professor asked for, what the switcher does, that filtering is in the browser and no edge function was touched, which screens follow it, the two judgement calls that are not obvious (ungrouped people stay visible inside a group view; whole-course content stays visible inside a group view), and what was verified in which group.

- [ ] **Step 4: Write the pitfall entry**

At the end of `docs/07-pitfalls.md`, add an entry recording the trap this feature sets for the next agent:

> **A Teach screen that filters by section on its own will drift.** Every screen narrows through `src/features/scope/filters.ts`, and `tools/verify-scope-filter.mjs` fails the build if one stops importing it. `activeSectionId === null` means *all groups* and must always return the rows untouched — a filter that treats null as "no group" empties the admin view. `src/features/scope/model.ts` and `filters.ts` are imported by a Node verifier, so neither may import Preact, i18n, or `localStorage`.

- [ ] **Step 5: Commit**

```bash
git add docs/05-status.md docs/07-pitfalls.md
git commit -m "Docs: the scope switcher, and the rule that keeps it from rotting"
```

- [ ] **Step 6: Hand back**

Report to the professor: what was checked in 501/502, what was deliberately not touched in 401/402, and that merging to `main` deploys the frontend on push while no edge function needs deploying. Do not merge or push without his word.

---

## Self-review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `Scope` type, serialize/parse, `localStorage` under a config key | 1, 3 |
| Menu: INSTRUCTOR half, ADMIN half, no duplicate 401 | 1 |
| Switcher hidden when the menu holds ≤1 entry | 1 (rule), 4 (render) |
| Group list from `listSections()`, fallback to `context.sections` on failure | 3 |
| Defaults and stale-scope recovery table | 1 |
| Home, Schedule, Sections | 5, 6 |
| People incl. ungrouped block and full assignment dropdown | 7 |
| Gradebook matrix + per-class | 8 |
| ContentLibrary incl. course-wide releases and full share dropdown | 9 |
| People `?group=` sets the scope | 7 |
| Foreign-group banner | 5 |
| Admin, CourseReset, RunClass, ClassRecord, Projector unchanged | not touched by any task, by design |
| Six `scope.*` strings, EN + ES | 4 |
| `verify-scope-filter.mjs`: self-tests, static import checks, switcher-is-reachable check | 1, 2, 3, 4, 5, 6, 7, 8, 9 |
| Manual testing in 501/502 only | 10 |

**Type consistency:** `activeSectionId` is a function in `features/scope/model.ts` and a signal in `state/scope.ts`; Task 3 imports the function as `sectionIdOf` to keep the two apart, and every screen imports the signal from `state/scope`. `isForeignGroup` is aliased the same way. `ScopeOption.section` (not `.group`) is the half-of-the-menu discriminator in Tasks 1 and 4. `scopedScoreProfileIds` is spelled identically in Tasks 2 and 8.

**Placeholders:** none. Every step names exact files, exact old text and exact new text.
