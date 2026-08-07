# Course Platform

> **Picking this up fresh (human or AI)? Start with [`docs/00-START-HERE.md`](docs/00-START-HERE.md).**
> The `docs/` folder is the complete, current handoff: project goal, architecture,
> design system, decision log, status, runbook, and the traps that have already
> cost hours. [`docs/HANDOFF-PROMPT.md`](docs/HANDOFF-PROMPT.md) can be pasted
> into a new session to continue the work.

A teaching platform for running interactive university classes: released-per-class
content, live in-lecture pulse questions, graded end-of-class quizzes, short written
reflections, and a weighted gradebook — with one dead-simple surface per role.

This is the **v2 frontend**. The backend is the existing Supabase project shared with
[mzareei.github.io](https://github.com/mzareei/mzareei.github.io) (schema, edge
functions, and operations docs live there under `supabase/` and
`docs/course-platform/`). This repo only ever talks to it through edge functions with
the signed-in user's token — the database refuses browsers directly (RLS on, zero
policies).

## Surfaces

- **Student** (phone-first, one primary action per screen): Today · Review · My Grades,
  plus the in-class live screen (Phase 3+).
- **Instructor**: Home · Content · Gradebook · People, plus the guided Run Class flow
  (Phase 3+) and an Advanced drawer for rare operations.
- **Admin** (platform owner): professors and courses (Phase 5).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run verify     # static contract verifiers (tools/verify-*.mjs)
npm run build
```

Sign-in is passwordless email OTP against the live backend. During the testing period,
rostered non-instructor accounts can use "Sign in without email" (server-gated by the
`COURSE_TEST_SIGNIN_UNTIL` secret). QA addresses outside the institutional domains are
enrolled per device by opening the app once as `/?test-access=<email>` — the server
still requires an external access grant.

## Deploy

Cloudflare Pages, build command `npm run build`, output `dist/`. `public/_headers`
carries the CSP. The Supabase Auth redirect allowlist must include the deployed origin
before magic links will work.

## Update course materials from GitHub

The private [`mzareei/course-content`](https://github.com/mzareei/course-content)
repository is the authoring source. Edit and push a validated item there; then an
instructor can open **Content** and choose **Sync from repository** on that item.
The platform reads the selected item from the repository, validates its metadata and
HTML, writes a new private-storage version, and records the source commit. An
unchanged item is a no-op. Syncing never releases an item to students — use the
separate availability control when the reviewed version is ready.

The GitHub credential is server-only. Before the first production use, configure a
fine-grained read-only token as the Supabase secret
`COURSE_CONTENT_GITHUB_TOKEN`, deploy `course-content-sync`, and deploy the frontend.
See [`docs/06-runbook.md`](docs/06-runbook.md) for the exact commands.

## Roadmap (approved plan)

1. **Phase 1 — this shell**: SPA against the existing backend.
2. **Phase 2**: content moves to private Supabase Storage, released per class, served
   through the gate via signed URLs.
3. **Phase 3**: live pulse questions + guided Run Class flow + projector view.
4. **Phase 4**: end-of-class quiz in the flow, 50–100-word reflections, per-class review.
5. **Phase 5**: multi-professor onboarding + AI generation (upload a PDF → web deck +
   question bank drafts for review).
6. **Phase 6**: public repo stops carrying course content.
