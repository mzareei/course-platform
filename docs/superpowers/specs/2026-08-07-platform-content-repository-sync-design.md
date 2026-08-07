# Platform Content-Repository Sync Design

**Date:** 2026-08-07  
**Status:** Approved for implementation by the professor in this task

## Goal

Make the private `mzareei/course-content` repository the practical authoring
source without requiring the professor to copy a Supabase session token or run
the publish CLI. After pushing a change to GitHub, the instructor can open the
platform Content screen and explicitly sync one selected item.

## User flow

1. The professor edits an item in `course-content` and pushes to `main`.
2. The repository's existing GitHub Action validates the change.
3. The professor opens Content and chooses **Sync from repository** for an owned
   storage-backed item.
4. The platform fetches `content.json` and the declared HTML entry from the
   private repository, validates the identity and artifact safety rules, and
   updates the existing private storage object in place.
5. The platform records the source commit and content hash in the existing
   version table and audit log.
6. Student visibility remains unchanged. A separate release action is still
   required to make the item available in Review.

## Architecture

The frontend adds a small API wrapper and a button to the existing
`ContentLibraryView`. The browser sends only the signed-in instructor JWT; it
never sees a GitHub credential and never reads GitHub directly.

The backend adds an instructor-authenticated `course-content-sync` Edge
Function. It uses a read-only fine-grained GitHub token stored as the
`COURSE_CONTENT_GITHUB_TOKEN` Supabase secret. The function reads the
repository's `main` ref through the GitHub Git Trees/Blobs API, checks the
repository metadata against the selected `content_items` row, validates the
self-contained artifact, uploads the HTML to the existing `source_ref`, and
records the new version with `published_from = 'github_action'` and the source
commit SHA. The stable storage path and content-item ID never change.

The sync endpoint is explicit and item-scoped rather than an automatic
repository-wide deploy. This keeps a pushed edit from becoming student-visible
or changing every lecture at once, while removing the manual token/CLI steps.

## Safety rules

- Only active course instructors and platform owners may call the endpoint.
- The caller must own the item, using the same ownership rule as content upload;
  a shared recipient cannot overwrite the original.
- The repository slug, `content_item_id`, content type, and storage filename
  must match the selected item. A mismatch stops before any storage write.
- The HTML must contain a title, no relative `src`/`href`, no forbidden public
  origin, and only allow-listed or item-declared external hosts.
- An identical SHA is a no-op and does not create a new version.
- Sync never creates, updates, or releases `content_releases`.
- The GitHub token is read-only and server-side only; it is never committed,
  sent to the browser, or placed in GitHub Actions.

## Testing and rollout

The backend gets a verifier for authentication, repository identity checks,
artifact validation, no-op behavior, version/source-commit recording, and the
absence of release writes. The frontend gets a verifier for the localized sync
button, ownership/storage gating, confirmation copy, and API call. Existing
typecheck, verifier, and build commands remain required.

Deployment requires setting `COURSE_CONTENT_GITHUB_TOKEN` in Supabase and
deploying the new function plus the frontend. The first live smoke test uses
one harmless item edit and confirms the item remains unreleased after sync.
