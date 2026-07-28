# Architecture

## The two repos

| | `course-platform` | `mzareei.github.io` |
|---|---|---|
| Path | `~/Documents/GitHub/course-platform` | `~/Documents/GitHub/mzareei.github.io` |
| Holds | The SPA | Edge functions, migrations, public academic site, original decks |
| Stack | Vite + TypeScript + Preact (`preact-iso` router, `@preact/signals`) | Deno edge functions, SQL migrations, Jekyll |
| Deploys | Cloudflare Pages, automatically on push to `main` | GitHub Pages (site); functions deploy manually via CLI |
| Live at | https://course-platform-3ko.pages.dev | https://mzareei.github.io |

**Supabase project ref:** `ojmbupftdikwmlqvibwt`

You will almost always need both repos open.

## Data access model — the single most important constraint

**Every table has RLS enabled and zero policies.** The database refuses all
direct browser access, by design. Edge functions using the service role are the
only door.

Consequences:
- The browser never queries a table. It calls an edge function.
- Every function re-checks the caller's role itself against `course_memberships`.
- There is no client-side authorisation to bypass, because there is no
  client-side data access.

The one documented exception considered (an RLS policy on `realtime.messages`
for broadcast) was never needed — polling proved sufficient.

## Edge function conventions

Every function follows the same shape:

- `POST` only, JSON body, an `{ action: "..." }` discriminator.
- `Authorization: Bearer <user JWT>`.
- Resolves the caller's profile, then checks role in-function.
- `verify_jwt = false` in `supabase/config.toml` — the token is validated inside
  the function so it can produce good error messages.
- Returns `{ error: "..." }` with a 4xx on failure; the client's `callFn`
  turns that into a thrown `ApiError`.

Shared helpers live in `supabase/functions/_shared/`:
`client.ts` (service-role client), `cors.ts`, `identity.ts` (who is allowed to
sign in at all), `content-token.ts` (HMAC content tokens), `anthropic.ts`
(Claude API), `templates/` (deck skeleton + engine assets).

## Functions that matter for v2

| Function | Role |
|---|---|
| `course-auth-context` | The one call the SPA makes on boot: profile, memberships, sections, releases, teacher sessions. Everything routes off this. |
| `course-pulse` | Live in-class questions: push / reveal / close (instructor), current / answer (student). `current` also reports quiz + reflection state so `/live` runs off one poll. |
| `course-question-bank` | Lists banks, draws a question, imports generated banks. |
| `course-class-quiz` | End-of-class quiz orchestration: start / close / status / summary / reflections / current. Reuses the existing activity engine rather than adding a second grading path. |
| `course-activity-attempt` | The quiz engine itself: attempt creation, question selection (difficulty-stratified), grading, speed bonus, integrity signals. |
| `course-exit-ticket` | The reflection, with server-enforced word bounds and a grace window. |
| `course-content-access` → `course-content-serve` | The gated content chain (see below). |
| `course-content-upload` | Signed upload URLs; PDF `create_upload` / `confirm_upload`. |
| `course-generation` | AI job queue: create / status / advance / cancel / review_bundle / preview_url / approve / regenerate_questions. |
| `course-generation-worker` | Does the actual Claude API work, one resumable step per invocation. |
| `course-admin` | Platform-owner: create course, invite professor, list, deactivate. **No UI yet.** |
| `course-session-management` | Class session lifecycle. Used for "End the class". |
| `course-roster-management`, `course-gradebook-summary`, `course-student-progress` | People, Gradebook, My Grades. |

Everything named `quiz-*` and the other `course-*` functions belong to earlier
generations. Frozen; don't build on them.

## The gated content delivery chain

This exists because of two platform behaviours that took a long time to
diagnose. **Do not simplify it without reading `07-pitfalls.md`.**

```
Viewer.tsx
  → course-content-access { action: "request_url" }   ← checks the release gate
      mints an HMAC token (signed with the service-role key)
  → iframe src = /content?t=<token>                   ← same-origin Pages Function
      functions/content.ts proxies to:
  → course-content-serve?t=<token>                    ← verifies token, streams object
```

Why each hop exists:
- Supabase downgrades HTML to `text/plain` on its shared domain (anti-phishing),
  so a storage signed URL cannot serve a deck.
- The edge function response gets a locked-down CSP from the Supabase gateway.
- A `blob:` or `srcdoc` iframe **inherits the parent page's CSP**, which blocks
  the deck's inline script — the deck renders but the engine is dead.
- So: the deck must be served from *our* origin, where `public/_headers` scopes a
  relaxed CSP to `/content` only.

`tools/verify-gated-content.mjs` guards this chain in CI.

The AI preview uses the same chain via `course-generation`'s `preview_url`,
which mints a token without requiring a release.

## The live-class loop

Both live screens poll every 3–4 seconds. **Polling is the mechanism, not a
fallback** — realtime was never needed.

- Student `/live` calls `course-pulse { action: "current" }` and drives a
  five-state machine off one response: pulse question → quiz → reflection →
  done → waiting.
- Instructor Run Class polls pulse results and quiz status.

Pulse answer options are shuffled **per student, client-side**, seeded by
`round_id + profile_id`. The server grades by option key and never knows about
display order — so "pick number 2" means nothing to the person next to you.

## The AI generation pipeline

```
PDF → Storage (private bucket, signed upload URL, never through a function)
  → generation_jobs row
  → course-generation-worker, ONE resumable step per invocation:
      extract   (PDF sent natively to Claude → outline + teaching content)
      slides    (outline → structured bilingual slide JSON)
      questions (outline → 18 tiered bilingual MCQs, validated)
      assemble  (deck.ts builds HTML → Storage; content_item + question_bank rows)
  → ready_for_review → instructor approves → bank goes active, draft release created
```

Key properties:
- Each step's output is checkpointed into `generation_jobs.step_state` **before**
  the status advances, so a crash resumes instead of re-spending API calls.
- The worker re-invokes itself between steps (no cron). The Content screen also
  nudges `advance` in case a cold start drops the baton.
- **The model never emits HTML.** It returns structured slide JSON; `deck.ts`
  builds the markup deterministically and escapes all text. Generated decks are
  structurally identical to hand-authored ones, and a bad generation cannot
  inject markup into a page a student opens.
- Questions are validated before storage: exactly 4 options, exactly 1 correct,
  both languages present, valid difficulty.
- Nothing reaches students on approval — it becomes a **draft release**, which
  still has to be released for a class.

Secrets: `ANTHROPIC_API_KEY` (set), optional `ANTHROPIC_MODEL` (defaults
`claude-sonnet-5`), optional `GENERATION_WORKER_SECRET` (locks the worker
endpoint; currently unset, so the guard is inactive).

## Frontend structure

```
src/
  api/        one module per backend area; all go through client.ts callFn()
  state/      session.ts — signals: session, context, booting, surface
  screens/    student/ and instructor/ screens, one file each
  features/   quiz/Player.tsx, reflection/Reflection.tsx
  i18n/       strings.ts (EN/ES pairs) + index.ts (t(), lang signal)
  styles/     app.css — the whole design system, one file
```

**Surface routing has no role picker.** `surface` is computed from the caller's
highest active role: platform_owner / instructor / TA → instructor surface,
otherwise student. Instructors can still open `/student` explicitly.

## Verifiers

`npm run verify` runs three scripts in `tools/`, and they run in CI on push:

- `verify-i18n.mjs` — both languages complete, no drifting `{placeholders}`, no
  hardcoded English in screens.
- `verify-gated-content.mjs` — the content delivery chain is intact.
- `verify-app-shell.mjs` — app shell invariants.

Treat a verifier failure as a build failure.
