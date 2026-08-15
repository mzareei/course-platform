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
