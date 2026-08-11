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
import type { StringKey } from "../i18n/strings";

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
  // Computed per row by course-content-library. can_edit is false for an item
  // shared with one of your groups but owned by somebody else; the screen must
  // not offer write controls that would 403. Optional so an older deployed
  // function that omits them is treated as "yours", which is what the
  // pre-ownership behaviour was.
  can_edit?: boolean;
  is_shared_with_me?: boolean;
  owner_profile_id?: string | null;
  forked_from_content_item_id?: string | null;
  // Only populated for an item you own — course-content-library returns an
  // empty array for anything you don't, so this is never a list of shares you
  // merely received.
  shares?: ContentShare[];
}

export interface ContentShare {
  section_id: string;
  section_code: string;
  section_name: string;
  can_release: boolean;
  can_copy: boolean;
}

export interface LibrarySection {
  id: string;
  course_id: string;
  section_code: string;
  section_name: string;
  status: string;
}

/**
 * A course-wide, id/code/name-only section list for the share picker.
 * course-section-management deliberately hides sections an instructor
 * doesn't teach (pitfall #38), but sharing requires naming a group you don't
 * teach — this list carries no roster or session data, so widening it here
 * doesn't reopen that pitfall.
 */
export interface ShareableSection {
  id: string;
  section_code: string;
  section_name: string;
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
  shareable_sections: ShareableSection[];
}

export function contentLibrary() {
  return callFn<ContentLibrary>("course-content-library", {});
}

export interface RepositorySyncResult {
  status: "synced" | "unchanged";
  slug: string;
  source_commit: string;
  content_sha256: string;
  version: number;
}

/** Pull one owned storage-backed item from the validated private repository. */
export function syncContentFromRepository(contentItemId: string) {
  return callFn<RepositorySyncResult>("course-content-sync", {
    action: "sync",
    content_item_id: contentItemId
  });
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

export function studentsCanOpen(state: string, opensAt: string | null, now = new Date()) {
  if (!STUDENT_VISIBLE_STATES.includes(state)) return false;
  if (state === "scheduled") {
    return Boolean(opensAt) && new Date(opensAt as string) <= now;
  }
  return !opensAt || new Date(opensAt) <= now;
}

/** Take a copy of an item shared with one of your groups. The copy is yours:
 *  your own storage object, your own question bank, and the original is never
 *  written. */
export function copyContentItem(contentItemId: string) {
  return callFn<{ item: ContentItem; copied_from: { id: string; slug: string }; questions_copied: number }>(
    "course-content-library",
    { action: "copy_content_item", content_item_id: contentItemId }
  );
}

/**
 * Grant a group visibility into an item you own. This is visibility only —
 * the recipient sees it and can take their own copy; it does not make them a
 * co-owner and they cannot re-share it further.
 */
export function shareContentItem(contentItemId: string, sectionId: string) {
  return callFn<{ shared: true } & ContentLibrary>("course-content-library", {
    action: "share_content_item",
    content_item_id: contentItemId,
    section_id: sectionId
  });
}

export function unshareContentItem(contentItemId: string, sectionId: string) {
  return callFn<{ shared: false } & ContentLibrary>("course-content-library", {
    action: "unshare_content_item",
    content_item_id: contentItemId,
    section_id: sectionId
  });
}

export function deleteContentItem(contentItemId: string) {
  return callFn<{ content_item_id: string; deleted: boolean }>("course-content-library", {
    action: "delete_content_item",
    content_item_id: contentItemId
  });
}

const CONTENT_ITEM_DELETE_ERROR_KEYS = new Set<StringKey>([
  "content.library.content_item_not_found",
  "content.library.content_item_not_owned",
  "content.library.content_item_has_active_release",
  "content.library.content_item_has_active_bank"
]);

export function contentItemDeleteErrorKey(code?: string | null): StringKey | null {
  const next = `content.library.${String(code || "").trim()}` as StringKey;
  return CONTENT_ITEM_DELETE_ERROR_KEYS.has(next) ? next : null;
}
