# Platform Content Repository Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an instructor sync one validated lecture or mission from private `mzareei/course-content` through the platform Content screen without copying a session token or running the CLI.

**Architecture:** Add an instructor-authenticated `course-content-sync` Supabase Edge Function that reads a selected item from GitHub with a server-side read-only token, validates identity/artifact safety, and publishes to the existing private storage path. Add a localized `Sync from repository` action to the existing Content library; it never changes student release state.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), GitHub Git Trees/Blobs REST API, Supabase Storage/Postgres, Vite + TypeScript + Preact, repository verifier scripts.

## Global Constraints

- The browser never queries a table; all reads/writes go through Edge Functions.
- Every user-facing string is EN + ES and must be added in pairs to `src/i18n/strings.ts`.
- The GitHub credential is read-only, stored only as the Supabase secret `COURSE_CONTENT_GITHUB_TOKEN`, and never sent to the browser.
- Sync updates the existing `content_items.source_ref` object in place and never changes `content_releases`.
- The selected repository metadata must match the existing item slug, ID, content type, and storage filename.
- The artifact must have a `<title>`, contain no relative `src`/`href`, and contain no `mzareei.github.io` reference.

---

### Task 1: Backend sync contract and verifier

**Files:**
- Create: `mzareei.github.io/supabase/functions/course-content-sync/index.ts`
- Create: `mzareei.github.io/tools/verify-content-repo-sync.mjs`

**Interfaces:**
- Consumes: signed-in instructor JWT, `{ course_id, action: "sync", content_item_id }`, and `COURSE_CONTENT_GITHUB_TOKEN`.
- Produces: `{ status: "synced" | "unchanged", slug, source_commit, content_sha256, version }`.

- [ ] **Step 1: Write the failing verifier**

  Assert that the new Edge Function is present and includes the `sync` action,
  GitHub secret use, instructor auth, ownership checks, repository ID/slug
  checks, forbidden-host validation, SHA no-op behavior, storage upload, audit
  logging, `content_versions`, `source_commit`, and no `content_releases` write.

- [ ] **Step 2: Run the verifier and confirm RED**

  Run:

  ```bash
  node tools/verify-content-repo-sync.mjs
  ```

  Expected: FAIL because `supabase/functions/course-content-sync/index.ts`
  does not exist.

- [ ] **Step 3: Implement the minimal Edge Function**

  Implement these concrete stages in `index.ts`:

  ```text
  POST request
    → bearer token + active instructor membership
    → selected content item + owner check
    → GitHub ref heads/main → recursive tree
    → content.json blob + declared entry blob
    → slug/id/type/storage filename and HTML safety checks
    → SHA-256 no-op comparison against latest content_versions
    → copy current live object to .versions/v<version>.html when present
    → upload new HTML to the unchanged source_ref
    → update title/summary/type/default_points and updated_at
    → insert content_versions + audit_log
    → return sync result
  ```

  Use `published_from = "github_action"` and the Git commit SHA as
  `source_commit`. Keep all GitHub API errors fail-closed and do not write
  storage or database state until metadata and HTML validation pass.

- [ ] **Step 4: Run the verifier and confirm GREEN**

  Run the same command; expected output:

  ```text
  verify-content-repo-sync: OK
  ```

- [ ] **Step 5: Commit the backend contract**

  ```bash
  git add supabase/functions/course-content-sync/index.ts tools/verify-content-repo-sync.mjs
  git commit -m "Add instructor content repository sync endpoint"
  ```

### Task 2: Frontend API and Content action

**Files:**
- Modify: `course-platform/src/api/content.ts`
- Modify: `course-platform/src/components/ContentLibrary.tsx`
- Modify: `course-platform/src/i18n/strings.ts`
- Create: `course-platform/tools/verify-content-repo-sync-ui.mjs`

**Interfaces:**
- Consumes: `course-content-sync` response from Task 1.
- Produces: `syncContentFromRepository(contentItemId)` and an owned,
  storage-backed Content-library button.

- [ ] **Step 1: Write the failing UI verifier**

  Assert the API wrapper, localized EN/ES strings, storage/ownership gating,
  confirmation text, button label, and a success/error path are present.

- [ ] **Step 2: Run the verifier and confirm RED**

  ```bash
  node tools/verify-content-repo-sync-ui.mjs
  ```

  Expected: FAIL because the API wrapper and sync control do not exist.

- [ ] **Step 3: Implement the API wrapper**

  Add:

  ```ts
  export interface RepositorySyncResult {
    status: "synced" | "unchanged";
    slug: string;
    source_commit: string;
    content_sha256: string;
    version: number;
  }

  export function syncContentFromRepository(contentItemId: string) {
    return callFn<RepositorySyncResult>("course-content-sync", {
      action: "sync",
      content_item_id: contentItemId
    });
  }
  ```

- [ ] **Step 4: Add the localized Content action**

  Render `Sync from repository` only when `can_edit !== false` and
  `source_kind === "storage_object"`. On click, confirm that the private
  artifact will be updated but students will not see it until a separate
  release. Run through the existing per-item busy/error path, reload the
  library, and show distinct synced/unchanged notices.

- [ ] **Step 5: Run the UI verifier, typecheck, and build**

  ```bash
  node tools/verify-content-repo-sync-ui.mjs
  npm run typecheck
  npm run build
  ```

  Expected: all commands exit 0.

- [ ] **Step 6: Commit the frontend action**

  ```bash
  git add src/api/content.ts src/components/ContentLibrary.tsx src/i18n/strings.ts tools/verify-content-repo-sync-ui.mjs
  git commit -m "Add Content screen repository sync action"
  ```

### Task 3: Deployment and handoff documentation

**Files:**
- Modify: `course-platform/docs/operations/supabase-powershell-command-sheet.md`
- Modify: `course-platform/docs/05-status.md`
- Modify: `course-platform/docs/07-pitfalls.md`
- Modify: `course-platform/README.md`

**Interfaces:**
- Consumes: Edge Function and frontend action from Tasks 1–2.
- Produces: exact secret, deploy commands, operator workflow, and known limits.

- [ ] **Step 1: Document the read-only GitHub secret and deployment**

  Add exact commands:

  ```bash
  npx supabase secrets set COURSE_CONTENT_GITHUB_TOKEN="<fine-grained-read-only-token>"
  npx supabase functions deploy course-content-sync --project-ref ojmbupftdikwmlqvibwt
  ```

  Document that the token is limited to `mzareei/course-content` Contents:Read,
  is never committed, and the frontend deployment is the normal push to
  `course-platform` main.

- [ ] **Step 2: Record the workflow and limitations**

  State that GitHub validation remains automatic, repository sync is explicit
  per item, sync never releases students, and Spanish metadata still requires
  human translation.

- [ ] **Step 3: Run documentation/verifier checks and commit**

  ```bash
  git diff --check
  git add docs/05-status.md docs/07-pitfalls.md README.md docs/operations/supabase-powershell-command-sheet.md
  git commit -m "Document platform content repository sync"
  ```

### Task 4: Verification and live rollout gate

- [ ] **Step 1: Run the complete frontend checks**

  ```bash
  npm run verify
  npm run typecheck
  npm run build
  ```

- [ ] **Step 2: Run the backend verifier**

  ```bash
  node tools/verify-content-repo-sync.mjs
  ```

- [ ] **Step 3: Deploy only after the secret exists**

  Deploy `course-content-sync` and push the frontend. If the secret is absent,
  the endpoint must fail with a clear configuration error and perform no write.

- [ ] **Step 4: Live smoke test one non-student-visible item**

  Edit a harmless title marker in one local item, push the repository, click
  **Sync from repository**, confirm the item remains unavailable to students,
  and inspect the item through the existing instructor/student preview path.

- [ ] **Step 5: Record evidence**

  Update status with the tested slug, source commit, result, and final release
  state before claiming the feature is complete.
