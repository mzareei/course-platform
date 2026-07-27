# Course Platform

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

## Roadmap (approved plan)

1. **Phase 1 — this shell**: SPA against the existing backend.
2. **Phase 2**: content moves to private Supabase Storage, released per class, served
   through the gate via signed URLs.
3. **Phase 3**: live pulse questions + guided Run Class flow + projector view.
4. **Phase 4**: end-of-class quiz in the flow, 50–100-word reflections, per-class review.
5. **Phase 5**: multi-professor onboarding + AI generation (upload a PDF → web deck +
   question bank drafts for review).
6. **Phase 6**: public repo stops carrying course content.
