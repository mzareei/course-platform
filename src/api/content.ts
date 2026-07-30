// The content library and the release gate.
//
// These two functions existed on the backend from the first generation but the
// v2 SPA never called either of them, which meant the app could *show* content
// it had no way to *release* — every release in the system had been made in the
// old app. This module closes that.
//
// Shapes read off listContentLibrary in course-content-library and
// listReleases / createRelease in course-release-management. See pitfalls #3.
//
// Releases are created and moved ONLY through course-release-management.
// course-content-library's save_content_item can also create a draft release,
// but it rewrites the entire content item to do it — which failed on all 23
// real lectures and would silently blank any field not echoed back.
import { callFn } from "./client";
import { canReleaseToReview } from "./contentVisibility";

export class ContentNotReviewableError extends Error {
  constructor() {
    super("Content is not reviewable");
  }
}

export interface ContentItem {
  id: string;
  course_id: string;
  content_type: string;
  slug: string;
  title: string;
  summary: string | null;
  source_kind: string;
  source_ref: string;
  contains_sensitive_content: boolean;
  default_points: number;
  created_at?: string;
  updated_at?: string;
  release_counts: { draft: number; active: number; total: number };
}

export interface LibrarySection {
  id: string;
  course_id: string;
  section_code: string;
  section_name: string;
  status: string;
}

export interface LibrarySession {
  id: string;
  course_id: string;
  section_id: string;
  title: string;
  planned_date: string;
  state: string;
}

export interface ContentLibrary {
  content_items: ContentItem[];
  sections: LibrarySection[];
  sessions: LibrarySession[];
}

export function contentLibrary() {
  return callFn<ContentLibrary>("course-content-library", {});
}

/**
 * Mint a private lecture token for the instructor cockpit. This is deliberately
 * content-item based: it checks teaching staff membership on the server and
 * never creates or consults a student release.
 */
export function requestInstructorContent(contentItemId: string): Promise<{
  token: string;
  expires_in: number;
  content: { id: string; title: string; slug: string };
}> {
  return callFn<{
    token: string;
    expires_in: number;
    content: { id: string; title: string; slug: string };
  }>("course-content-access", {
    action: "request_instructor_url",
    content_item_id: contentItemId
  });
}

/** Create a draft release without touching the content item. */
export function createRelease(input: {
  content_item_id: string;
  section_id?: string;
  class_session_id?: string;
}) {
  return callFn<{ release: { id: string; state: string } }>("course-release-management", {
    action: "create_release",
    ...input
  });
}

/**
 * One button, at most two calls: make a library item openable by students.
 *
 * A professor's mental model is "give this to my class", not "create a draft
 * release then transition it". The draft step exists so generated content
 * cannot skip review; for a professor's own lecture it is ceremony, so it is
 * collapsed here rather than exposed.
 *
 * This deliberately does NOT go through course-content-library's
 * save_content_item, which rewrites the whole content item as a side effect of
 * adding a release — see createRelease in course-release-management.
 */
export async function makeAvailable(input: {
  item: ContentItem;
  existingRelease?: ReleaseRow;
  section_id?: string;
  class_session_id?: string;
}) {
  if (!canReleaseToReview(input.item)) throw new ContentNotReviewableError();

  if (input.existingRelease) {
    return updateReleaseState({
      release_id: input.existingRelease.release_id,
      next_state: "released"
    });
  }
  const { release } = await createRelease({
    content_item_id: input.item.id,
    section_id: input.section_id,
    class_session_id: input.class_session_id
  });
  if (!release?.id) throw new Error("The release was not created.");
  if (release.state === "released") return { release };
  return updateReleaseState({ release_id: release.id, next_state: "released" });
}

export interface ReleaseRow {
  release_id: string;
  content_item_id: string;
  section_id: string | null;
  class_session_id: string | null;
  title: string;
  slug: string;
  content_type: string;
  source_ref: string;
  contains_sensitive_content: boolean;
  section_code: string;
  section_name: string;
  class_session_title: string;
  planned_date: string;
  session_state: string;
  state: string;
  opens_at: string | null;
  closes_at: string | null;
  allowed_attempts: number;
  updated_at: string;
}

export interface ReleaseList {
  releases: ReleaseRow[];
  allowedTransitions: Record<string, string[]>;
  actions: string[];
}

export function listReleases() {
  return callFn<ReleaseList>("course-release-management", {});
}

/**
 * `reason` is not optional in practice. course-release-management refuses to
 * reopen a closed release without one:
 *
 *     if (currentState === "closed" && !input.reason) throw ...
 *
 * Sending nothing meant "Make it available" failed every time on anything the
 * professor had previously taken back, while "Take it back" worked — because
 * closing needs no reason. Always send one; it lands in `release_events.reason`
 * and is audit text, not user-facing.
 */
export function updateReleaseState(input: {
  release_id: string;
  next_state: string;
  reason?: string;
}) {
  return callFn<{ release: ReleaseRow }>("course-release-management", {
    action: "update_state",
    ...input,
    reason: input.reason || `Set to ${input.next_state} from the Content screen.`
  });
}

/**
 * The states a professor actually needs to tell apart. `course-auth-context`
 * shows students `released | live | paused | review_only | scheduled` and hides
 * `draft | closed | archived`, so from where a professor sits there are only
 * two questions: can my students open this, and can I change that.
 *
 * Everything else in the release state machine is real but internal — `live`
 * and `paused` belong to the old admin pages, and the student app keys off the
 * class session rather than the release state (see 04-decisions.md).
 */
export const STUDENT_VISIBLE_STATES = ["released", "live", "paused", "review_only", "scheduled"];

export function studentsCanOpen(state: string) {
  return STUDENT_VISIBLE_STATES.includes(state);
}
