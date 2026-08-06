// course-content-cleanup — removing the public-site links from a stored deck.
//
// Field names here were read off the edge function's actual `return json({...})`,
// not guessed from what the screen wanted. Pitfall #3: TypeScript cannot check
// a contract across a network boundary, and a `?? "—"` on a misspelled field
// renders forever without erroring.
import { callFn } from "./client";

/** One row of the dry run. `public_references` is what the stored file has
 *  now; `public_references_after` is what would survive the cleanup — which
 *  should be zero, and if it is not the backend refuses to write. */
export interface CleanupPreviewRow {
  content_item_id: string;
  slug: string;
  title: string;
  content_type: string;
  storage_path: string;
  public_references: number;
  public_references_after: number;
  would_change: boolean;
  still_public_after: string[];
  error: string | null;
}

export interface CleanupResult {
  item: { id: string; slug: string; title: string };
  version: { id: string; version: number; storage_path: string; content_sha256: string } | null;
  references_removed: number;
  already_clean: boolean;
}

/** Reads storage and writes nothing, anywhere. Safe to call during class. */
export function previewPublicLinks(contentItemId?: string) {
  return callFn<{ items: CleanupPreviewRow[] }>("course-content-cleanup", {
    action: "preview",
    ...(contentItemId ? { content_item_id: contentItemId } : {})
  });
}

/** Cleans exactly one item. The caller walks the list — a single request that
 *  swept every deck would be one timeout away from a partial run with no
 *  record of where it stopped. */
export function cleanPublicLinks(contentItemId: string, note?: string) {
  return callFn<CleanupResult>("course-content-cleanup", {
    action: "clean",
    content_item_id: contentItemId,
    ...(note ? { note } : {})
  });
}
