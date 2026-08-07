# Content-repo sync — handoff

**Date:** 2026-08-07
**Status:** not started. Documentation only — nothing described here has been
built or run.

This file exists because a routine question ("is my content in `course-content`
yet?") turned up a gap that two other documents had implied was already closed.
It is scoped narrowly: closing the loop the professor actually asked for, not
the whole private-content project. Read `05-status.md`'s newest entry and
pitfall #62 in `07-pitfalls.md` for how the gap was found.

## What the professor wants, in his own words

> The course content should be inside the course content repository, and it
> can be simply synced inside my laptop and then, basically, get modified
> there, then push to the GitHub, and then in the course platform, it can be
> pulled.

Concretely: `mzareei/course-content` is the single place lecture/mission HTML
is authored. `git clone` it, edit a file, `git push`. Separately, the platform
(production Supabase storage) can be updated *from* that repo by an explicit
publish step. This is not a new idea — it is exactly what
`docs/superpowers/specs/2026-08-05-private-content-publishing-design.md`
already designed and the professor already approved on 2026-08-05 (see
`04-decisions.md`). What's missing is that the loop was never actually wired
up end to end.

## Verified state of `mzareei/course-content`, checked directly, 2026-08-07

One commit exists, `8f34c26`, on both `main` and this session's branch:

```
README.md          — the original scaffold placeholder text
course.json         — course id, allowed external hosts, forbidden_hosts
lib/validate.mjs
tools/publish.mjs
tools/validate.mjs
.github/workflows/validate.yml
```

Confirmed missing, by diffing against `course-platform/tools/content-repo/`
(the newer copy of the same scaffold, which is the actual source of truth for
what should be there):

| Missing | Why it matters |
|---|---|
| `tools/pull.mjs`, `lib/pull-metadata.mjs` | The fetch half of the loop. Without it there is no way to get a lecture's live bytes into this repo to edit in the first place. |
| `courses/` (entire directory) | None of the 27 production content items has ever been pulled down. There is nothing to `git clone` and open in an editor yet. |
| `shared/` | The repo's own README documents this as the mirrored deck-engine copy (`script.js`/`style.css`), kept in sync with `mzareei.github.io/supabase/functions/_shared/templates/`. Not present, so `validate.mjs`'s mirror check has nothing to check against. |

Everything else — `course.json`, `validate.mjs`, `publish.mjs`, the CI
workflow — matches the `course-platform` copy exactly (`diff` clean).

## What this is not blocked on

Populating `course-content` with pulled-down content is **additive and
read-only against production** — `pull.mjs` fetches through the same gated
`course-content-access` / `course-content-serve` path the app's own instructor
preview uses, with the instructor's own short-lived session token. It writes
nothing to Supabase and touches no `content_items` row. It is not one of the
D1–D8 destructive/irreversible steps in the design doc's register, and it does
not need to wait on D5/D6 (public-site retirement) or anything else in that
ordering. It can start immediately.

Publishing *back* (`publish.mjs`) does write to production and should follow
the same care as any other content-touching action — but that tool already
exists and was already used for the live decks-cleanup work (see the "Private
content work — deployed to production" entry in `05-status.md`). It is not
what's missing.

## Closing the gap — concrete steps, in order

1. **Copy the two missing files** from `course-platform/tools/content-repo/`
   into `mzareei/course-content`, matching directory structure exactly:
   - `tools/pull.mjs` → `tools/pull.mjs`
   - `lib/pull-metadata.mjs` → `lib/pull-metadata.mjs`
   Also copy the current `README.md` over (it documents the pull → edit →
   publish loop and where `COURSE_ACCESS_TOKEN` comes from; the real repo's
   copy predates `pull.mjs` and doesn't mention it). Diff first — confirm
   `course.json`, `validate.mjs`, `publish.mjs`, and the CI workflow really are
   still identical before overwriting anything, so nothing hand-edited
   directly in `course-content` gets silently clobbered.
2. **Add `shared/`** — copy the deck-engine template from
   `mzareei.github.io/supabase/functions/_shared/templates/` (see that repo's
   `CLAUDE.md` and the design doc §2c for exactly what's mirrored and why it's
   a mirror rather than an original).
3. **Pull every real item down**, using the instructor's own session token
   (from the browser, `localStorage`, `sb-ojmbupftdikwmlqvibwt-auth-token` —
   see the README once step 1 lands):
   ```bash
   COURSE_ACCESS_TOKEN=<token> node tools/pull.mjs <slug>
   ```
   Run once per slug. The 23 real slugs are listed in
   `docs/audits/2026-08-05-content-origin-audit.md` §1 (11 lectures, 12
   missions/bridges); there's also `week-12-lecture-1-access-control-deep-dive`,
   the one AI-generated lecture, for 24 total, plus the two `static_path`
   items (`review-coach`, `teacher`) which are **not** storage objects and
   won't pull the same way — check with the design doc before assuming they
   need to.
   - The Spanish-translation caveat is real: `content_items.title`/`summary`
     are English-only in the database, so a first pull sets `title.es` /
     `summary.es` to the English text and prints a warning. Someone has to
     write the actual Spanish before that's a real bilingual source. A re-pull
     never clobbers a translation already written to disk.
4. **Validate and commit.** `node tools/validate.mjs` (or let the CI workflow
   do it on a PR) before pushing, then `git add -A && git commit && git push`.
5. **Prove the loop both directions**, on one lecture, before calling it done:
   - Edit a harmless piece of the pulled HTML locally.
   - `node tools/publish.mjs <slug> --confirm`.
   - Open that lecture through the real app (Content → your lectures, or
     Review as a student on a released item) and confirm the edit shows up —
     per pitfall #1, a reported success is not the same as seeing it through
     the real entry point.
6. **Update `05-status.md` and `07-pitfalls.md`** in the same commit, same as
   every other piece of this project — record exactly which slugs were pulled,
   what was verified live, and what (if anything) is still missing.

## Constraints to respect while doing this

- `forbidden_hosts` in `course.json` already blocks `mzareei.github.io` — any
  authored artifact that references it fails validation. That's intentional
  (see the file's own comment): a link from inside the gate to the ungated
  public copy is the exact failure this repository exists to end. Don't weaken
  it to get a pull to validate cleanly; fix the content instead.
- Never scan the storage bucket to decide what to pull — pitfall #58 and
  finding F8 in the audit: there are 23 orphaned `index.html` objects sitting
  next to the real `deck.html` ones, referenced by nothing. Pull by the known
  slug list, not by listing bucket contents.
- `publish.mjs` upserts; there is no version history in the repo layer beyond
  `content.json`'s own history field. Production-side versioning
  (`content_versions`, `.versions/`) is separate and already shipped — see the
  "deployed to production" status entry.
- Nothing in steps 1–4 touches production. Step 5's `publish.mjs --confirm` is
  the one write — do it once, deliberately, on a single lecture, before
  batching anything.

## Reading list for whoever picks this up

1. This file.
2. `docs/05-status.md` — top entry, the gap this file is closing.
3. `docs/07-pitfalls.md` #62.
4. `mzareei/course-content`'s own `README.md` (real repo — not the
   `course-platform` copy) once you've looked at both, since they currently
   differ.
5. `docs/superpowers/specs/2026-08-05-private-content-publishing-design.md` —
   §2 (repository structure) and §3 (publishing workflow) specifically.
6. `docs/audits/2026-08-05-content-origin-audit.md` §1 — the 23-item slug list.

---

## Paste-into-a-fresh-session prompt

Paste everything below the line into a new AI session to continue this
specific piece of work.

---

I'm Mahdi Zareei, a research professor at Tecnológico de Monterrey. You're
continuing one specific, narrow piece of a larger in-progress project: wiring
up the content-authoring repository so I can actually clone it to my laptop,
edit a lecture, push, and separately publish it to production. That loop does
not work yet, despite what some earlier status notes implied — a previous
session traced the gap precisely and left a full account of it. Read that
account before doing anything else:

**Read `~/Documents/GitHub/course-platform/docs/CONTENT-REPO-SYNC-HANDOFF.md`
first, in full.** It has the verified current state of `mzareei/course-content`
(checked directly against the real repository, not inferred), exactly what's
missing, why it's safe to fix without touching production, and the ordered
steps to close it.

Then, for the wider project context you'll need: read
`~/Documents/GitHub/course-platform/docs/00-START-HERE.md` and follow its
reading order through at least `04-decisions.md`, `05-status.md` (its newest
entry is directly about this task), and `07-pitfalls.md` (entry #62 is
directly about this task; the rest are traps already paid for once — don't
re-pay them).

You'll need three repositories:
- `~/Documents/GitHub/course-platform` — has the current, correct copy of the
  scaffold tooling in `tools/content-repo/`, including `pull.mjs`, which the
  real content repo is missing.
- `~/Documents/GitHub/mzareei.github.io` — has `supabase/functions/_shared/templates/`,
  the deck engine that needs to be mirrored into `course-content/shared/`.
- `mzareei/course-content` — the actual private content repository. Clone it
  fresh; don't assume any prior clone on this machine reflects its real state.

Do the work in the order the handoff file lays out: sync the two missing
tooling files (diff everything else first — don't blindly overwrite), add the
`shared/` mirror, pull every one of the ~24 real items down by its known slug
(never by scanning the storage bucket — see why in the handoff file and
pitfall #58), validate, commit, push. Then prove the full loop works by
editing one real lecture, publishing it, and confirming the change through the
actual app — signed in, clicking from a real screen, not by reasoning about
the code. I test for real and will tell you plainly if something doesn't work.

Update `docs/05-status.md` and `docs/07-pitfalls.md` in the same commit as
whatever you do, same as every other piece of this project — that's how I can
swap agents at any point without losing the thread.

Tell me what you plan to do first before you start.
