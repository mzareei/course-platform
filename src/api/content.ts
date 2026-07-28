// The content library and the release gate.
//
// These two functions existed on the backend from the first generation but the
// v2 SPA never called either of them, which meant the app could *show* content
// it had no way to *release* — every release in the system had been made in the
// old app. This module closes that.
//
// Shapes read off listContentLibrary / saveContentItem in
// course-content-library and listReleases in course-release-management.
// See pitfalls #3.
import { callFn } from "./client";

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
 * Attach an existing library item to a class session as a DRAFT release.
 *
 * The backend's only entry point for this is save_content_item, which rewrites
 * the item, so every field has to be echoed back — omitting one would blank it.
 * The item is passed in whole for exactly that reason.
 */
export function attachToSession(input: {
  item: ContentItem;
  section_id: string;
  class_session_id: string;
}) {
  return callFn<ContentLibrary & { content_item: ContentItem }>("course-content-library", {
    action: "save_content_item",
    content_item: {
      id: input.item.id,
      content_type: input.item.content_type,
      slug: input.item.slug,
      title: input.item.title,
      summary: input.item.summary,
      source_kind: input.item.source_kind,
      source_ref: input.item.source_ref,
      contains_sensitive_content: input.item.contains_sensitive_content,
      default_points: input.item.default_points
    },
    release: {
      create_draft_release: true,
      section_id: input.section_id,
      class_session_id: input.class_session_id
    }
  });
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

export function updateReleaseState(input: {
  release_id: string;
  next_state: string;
  reason?: string;
}) {
  return callFn<{ release: ReleaseRow }>("course-release-management", {
    action: "update_state",
    ...input
  });
}

/**
 * Transitions worth offering a professor, in plain language. The backend allows
 * more (scheduled, live, archived); those either need a date picker or exist
 * only for the old admin pages, and the student app keys off the class session
 * rather than the `live` release state. Anything not listed here is simply not
 * shown as a button.
 */
export const RELEASE_ACTIONS: Array<{ from: string; to: string; key: string }> = [
  { from: "draft", to: "released", key: "content.release.publish" },
  { from: "scheduled", to: "released", key: "content.release.publish" },
  { from: "released", to: "live", key: "content.release.open" },
  { from: "live", to: "review_only", key: "content.release.reviewOnly" },
  { from: "live", to: "closed", key: "content.release.close" },
  { from: "paused", to: "review_only", key: "content.release.reviewOnly" },
  { from: "paused", to: "closed", key: "content.release.close" },
  { from: "closed", to: "review_only", key: "content.release.reviewOnly" }
];
