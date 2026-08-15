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
