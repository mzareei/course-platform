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
