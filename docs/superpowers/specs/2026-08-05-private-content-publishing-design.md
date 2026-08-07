# Private content authoring and publishing — design

**Date:** 2026-08-05
**Status:** proposed. **Nothing here has been built, and nothing in production
has been changed.** Awaiting the professor's approval per requirement 13.
**Companion:** [`docs/audits/2026-08-05-content-origin-audit.md`](../../audits/2026-08-05-content-origin-audit.md)

Target architecture:

```
Private GitHub content repository        ← authoring, review, history
        ↓ controlled publish action      ← validation gate
Private Supabase Storage + content_items ← one canonical runtime copy
        ↓ explicit group/session release ← unchanged existing gate
Course Platform (students)
```

The third arrow already exists and works. This design adds the first two and
does not touch the third.

---

## 1. Why a separate private repository

The material has to live somewhere a professor can edit with normal tools, keep
history, and review before students see it. The three candidates:

| Option | Verdict |
|---|---|
| Keep authoring in `mzareei.github.io` | No. That repo is public and its Jekyll build publishes `assets/` — finding F1 of the audit. Making it private breaks the academic site. |
| Author in the platform UI | No. The professor edits decks as HTML; a web editor is a project of its own and loses git history. |
| **A new private repo** | Yes. Private by default, ordinary git review, and the publish step becomes a deliberate, auditable action. |

**Proposed name:** `mzareei/tc2007b-course-content`, private, owned by the same
account. **Not created.** Creating it is item D1 in the destructive/irreversible
register below.

### Naming note

`tc2007b-course-content` is course-specific. If a second course ever runs on
this platform, the repository name will need a sibling
(`tc3001b-course-content`), and the publish tool must take the course id as an
argument rather than assuming `tc2007b`. The layout below is designed so that
one repo maps to one `courses.id`, which keeps the mapping legible.

---

## 2. Repository structure

```
tc2007b-course-content/
  course.json                     # course id, title, default language, publish defaults
  README.md                       # how to author and how to publish
  .github/workflows/validate.yml  # PR gate: validate only, never publishes
  .gitignore                      # build output, node_modules, *.local.*

  content/
    week-01-lecture/
      content.json                # ← the metadata/version file (see §2b)
      index.html                  # the authored artifact
      assets/                     # optional; inlined at publish time
        diagram-tls.svg
      source/                     # optional; never published
        original-slides.pdf
    week-01-lecture-2/
    week-01-mission-01/
      content.json
      index.html
    week-04-mission-bridge/
      content.json
      index.html
    ...

  shared/
    deck-style.css                # the current shared engine, mirrored from
    deck-script.js                #   mzareei.github.io/supabase/functions/_shared/templates/
    mission-style.css
    README.md                     # "mirrored, not authored here — see §2c"

  tools/
    publish.mjs                   # the CLI (§5)
    validate.mjs                  # the validator, shared by CLI and CI
    lib/                          # inline/rewrite/validate helpers
```

### 2a. Why one directory per item, flat, keyed by slug

The slug is the join key to production (`content_items.unique (course_id, slug)`
and the storage prefix `courses/tc2007b/items/<slug>/`). Making the directory
name *be* the slug means the mapping is visible in `ls`, a rename is a visible
git rename, and the publish tool has nothing to infer.

Lectures, missions and bridge missions deliberately share one flat namespace
rather than living in `lectures/`, `missions/`, `bridge-missions/` folders.
Their type is a field (`content.json → content_type`), not a path, because the
existing slugs already encode week and kind (`week-04-mission-bridge`), and a
type-based hierarchy would create a second, competing source of truth for the
same fact. Bridge missions are `content_type: "mission"` in the schema today;
this design keeps them that way and distinguishes them with
`variant: "bridge"` for reporting only.

### 2b. `content.json` — metadata and version file

One per item. This is the file that makes publishing safe and reviewable.

```jsonc
{
  "slug": "week-01-lecture",              // must equal the directory name
  "content_item_id": "…uuid…",            // filled by the first publish; never edited by hand
  "content_type": "lecture",              // lecture | mission | resource | case_file
  "variant": null,                        // null | "bridge"
  "title": {
    "en": "Week 1 Lecture 1: Introduction to Cybersecurity",
    "es": "Semana 1 Clase 1: Introducción a la ciberseguridad"
  },
  "summary": { "en": "…", "es": "…" },
  "entry": "index.html",                  // the file that becomes the storage object
  "storage_filename": "index.html",       // what it is called in the bucket — see F8
  "default_points": 0,
  "contains_sensitive_content": false,
  "question_bank": {
    "expects_bank": true,                 // publish refuses to orphan an existing bank
    "known_bank_ids": ["…uuid…"]          // recorded at publish time, for the audit trail
  },
  "version": {
    "current": 7,
    "published_at": "2026-08-05T18:04:11Z",
    "published_by": "m.zareei@tec.mx",
    "content_sha256": "…",                // of the built artifact, not the source
    "storage_path": "courses/tc2007b/items/week-01-lecture/index.html"
  },
  "history": [
    { "version": 6, "published_at": "…", "content_sha256": "…", "note": "fixed slide 22 typo" }
  ]
}
```

Three properties worth naming:

- **`content_item_id` is written once and then treated as immutable.** It is
  what guarantees requirement 5's "preserve stable slugs and content IDs" and
  what keeps `question_banks.content_item_id` valid (audit finding F9).
- **`storage_filename` is explicit, never inferred.** Migrated items are
  `index.html`; AI-generated ones are `deck.html` (finding F8). The first
  publish of an existing item reads the production value and writes it here;
  it is never guessed.
- **`history` is append-only in git.** The repo *is* the history; this array is
  the human-readable index of it, so `git log` and the platform agree.

### 2c. `shared/` is mirrored, not authored

The deck engine's real home is
`mzareei.github.io/supabase/functions/_shared/templates/`, and
`tools/verify-gated-content-source.mjs` already fails closed when that source is
missing. Duplicating the engine as an editable copy would create a second truth
and a silent drift path — exactly pitfall #18's shape.

So `shared/` carries a checked-in **mirror** with a `SOURCE.sha256` file, and
`validate.mjs` fails if the mirror does not match the backend checkout. Updating
the engine stays a backend change; the mirror is refreshed by a script, never
hand-edited.

### 2d. `source/` — optional PDFs

Original slide PDFs may be committed under `content/<slug>/source/`. They are
**never published**: `publish.mjs` refuses to upload anything outside the entry
file and its inlined assets. They exist so the authored HTML has a provenance
record, and so the AI generation pipeline has an input to re-run from. If any
PDF carries licensing restrictions, it does not belong here — the repo is
private, but private is not the same as licensed.

---

## 3. The publishing workflow

One command, seven gates, and it stops at the first failure. Nothing is written
to Supabase until every read-only step has passed — the ordering discipline
pitfall #30 paid for.

```
 1  resolve      slug ↔ directory ↔ content.json agree; course id matches
 2  build        inline shared CSS/JS + local assets into one HTML file
 3  validate     structure, bilingual fields, asset paths, no local refs,
                 no public-GitHub-Pages links, engine mirror current
 4  reconcile    read production: content item, its storage object, its banks
 5  preflight    print the exact diff and refuse without --confirm
 6  upload       PUT the artifact to the SAME storage path (never a new one)
 7  register     update content_items in place; append the version record
```

### 3a. What `validate` actually checks

These are the rules, and each one is a test in the TDD plan.

**Structure and identity**
- Directory name, `content.json.slug`, and the slug in any `data-slug`
  attribute all agree.
- `content_type` is one of the schema's eight values; `variant` is `null` or
  `"bridge"`.
- `content_item_id`, if present, is a well-formed UUID.

**Bilingual fields** (requirement 5, and the platform's rule #4)
- `title.en` / `title.es` both present, non-empty, ≤ 180 chars (the DB check).
- `summary.en` / `summary.es` both present or both absent, ≤ 1000 chars.
- Any `data-i18n-en` / `data-i18n-es` pair inside the HTML has both halves.
- **The existing `verify-i18n` culture applies:** a missing Spanish string is a
  build failure, not a warning.

**HTML / CSS / JS**
- Parses as a balanced document using the same structural scanner as
  `checkpoint-deck.ts` (`scanTopLevelSections`) — *not* a `<section>.*?</section>`
  regex, per pitfall #30.
- Exactly one `<title>`; the deck engine's `data-course-deck-engine="current"`
  style and script blocks present and byte-identical to the mirror.
- No `<script src>` or `<link rel=stylesheet>` pointing anywhere local after
  the build — the artifact must be self-contained, matching what the gated
  viewer serves today.
- Teaching sections carry `data-teaching-slide`; checkpoint sections do not
  (pitfall #29). Teaching-slide count and text are re-extracted from the built
  artifact and compared to the source — a build that changes the deck is a
  failed build.

**Asset paths** (requirement 5)
- Every `src`/`href` resolves to: an inlined data URI, an allow-listed external
  host, or a fragment. Anything else fails.
- Allow-list is explicit in `course.json`:
  `fonts.googleapis.com`, `fonts.gstatic.com`, plus per-item teaching links
  declared in `content.json → external_links`. `amiunique.org` and `tosdr.org`
  (audit §2d) are declared this way, so a new external host is a reviewed change
  rather than a silent one.
- **Zero references to `mzareei.github.io`.** This is the rule that fixes audit
  finding F2 and makes F1 safe to act on. It is a hard failure, and it is the
  single most important validator in this design.

**Question-bank safety** (requirement 5)
- If production has an active bank pointing at this `content_item_id`, publish
  refuses unless `expects_bank` is true.
- If the item is a lecture whose bank is `checkpoint_preparation_state = 'ready'`,
  publish refuses unless the built artifact contains the same checkpoint
  sections at the same `after_slide` boundaries. Re-publishing a prepared
  lecture without its checkpoints would silently break the live class, and
  pitfall #30 records what that costs.
- Publish **never** writes to `questions`, `question_banks`, or any checkpoint
  metadata. Checkpoint preparation stays a separate, already-built action.

### 3b. `reconcile` and `preflight` — the human gate

Before any write, the tool prints:

```
week-01-lecture
  content item   3f2a…  (existing, unchanged id)
  storage path   courses/tc2007b/items/week-01-lecture/index.html   (unchanged)
  artifact       114 KB, sha256 9c1f…  (was 7a30…)
  title          unchanged
  question bank  1 active, 18 questions, checkpoints ready — 4 checkpoints matched
  releases       1 review_only (Group 401), 0 live sessions
  ⚠ this content is currently visible to Group 401 students
```

and refuses to proceed without `--confirm`. The "currently visible" line is
there because publishing over live content is legitimate but should never be
accidental.

### 3c. What publish deliberately does **not** do

Requirement 5's last two bullets, made structural rather than procedural:

- **It never creates a `content_release`.** Not draft, not scheduled, not
  anything. The publish path has no code that writes to `content_releases`.
- **It never touches `class_sessions`.** Attaching a lecture to a class stays a
  Classes-screen action.

Release remains exactly what it is today: an explicit instructor action scoped
to a group or a session, through `course-release-management`. A newly published
item is simply present in the library, invisible to every student, until someone
releases it. This is the same guarantee that Phase 5's "approval creates a
draft, not a release" decision made for AI-generated content, and it is kept for
the same reason.

### 3d. Versioning and rollback

Storage today is `upsert: true` with no history (audit F5). The design adds:

```
courses/tc2007b/items/<slug>/<storage_filename>          ← the live object, path never changes
courses/tc2007b/items/<slug>/.versions/<n>-<sha8>.html   ← immutable prior copies
```

The live path is stable because `content_items.source_ref` points at it and the
gated chain resolves it; changing the path on every publish would mean rewriting
the item row and would break any cached token. So: copy the current object into
`.versions/` **before** overwriting it, then overwrite.

A new `content_versions` table records the same facts in Postgres:

```sql
create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  version int not null,
  storage_path text not null,          -- the .versions/ copy
  content_sha256 text not null,
  published_by uuid references public.profiles(id) on delete set null,
  published_from text,                 -- 'cli' | 'github_action', + git sha
  note text,
  created_at timestamptz not null default now(),
  unique (content_item_id, version)
);
```

Rollback is then "publish version n-1", which runs the same seven gates. There
is no separate rollback code path to get wrong.

`.versions/` grows without bound; a retention policy (keep last 10) is a later
decision, and deleting old versions is itself a destructive action requiring
approval.

---

## 4. CLI vs GitHub Action — recommendation

**Recommendation: build the CLI first and make it the only thing that writes to
production. Add a GitHub Action that validates on every PR and never publishes.**

| | Secure local CLI | GitHub Action with Supabase secrets | Both, split by role |
|---|---|---|---|
| What holds the credential | The professor's own short-lived instructor access token — the same one the browser gets | A long-lived secret in GitHub, usable by any workflow run | CLI holds the token; the Action holds **nothing** |
| Blast radius if compromised | One session, expires | Standing write access to the private bucket and `content_items` | Same as CLI |
| Works with the existing auth model | Yes — `course-content-upload` already validates an instructor token per call, exactly as `migrate-gated-content.mjs` does today | Needs either a service-role key or a machine account, both new trust surfaces | Yes |
| Enforces review before publish | No — a local run can skip the PR | Yes, if publish is gated on merge | Yes for validation; publish stays deliberate |
| Catches a broken deck before merge | Only if the author runs it | Yes, on every PR | Yes |
| Fails safely when the network is unavailable mid-class | Yes — nothing runs unless invoked | An auto-publish on merge can fire at a bad moment | Yes |

The deciding argument is the one the architecture already made: **the platform
has no standing credential that can write content, and that is a feature.**
Every existing write path — the migration tool, the browser, the AI pipeline —
authenticates as a signed-in instructor whose role is re-checked in-function.
Putting a Supabase secret in GitHub Actions would create the first long-lived
content-write credential in the system, held by a service the professor does not
operate, in order to save one command.

So the split:

- **`node tools/publish.mjs <slug> --confirm`**, authenticated with
  `COURSE_ACCESS_TOKEN` (an instructor's session token, as today). This is the
  only thing that can write.
- **`.github/workflows/validate.yml`**, running `node tools/validate.mjs --all`
  on every PR and push. No secrets, no network access to Supabase, no publish
  capability. It answers "is this deck well-formed, bilingual, self-contained
  and free of public links?" — which is where most mistakes will be.

If auto-publish-on-merge becomes genuinely desirable later, the honest way to
add it is a dedicated machine instructor account with its own membership and its
own audit trail, not a shared service key. That is a separate decision with its
own approval.

---

## 5. Owner and content-sharing policy (requirement 7)

### The model

| Rule | Mechanism |
|---|---|
| Content is private to its owner by default | New `content_items.owner_profile_id`, not null going forward. Visibility defaults to owner-only. |
| Instructors see their own content plus content shared with their assigned groups | `listContentLibrary` filters to `owner_profile_id = me` ∪ items shared with any of my `permittedSectionIds`. |
| An owner can share with selected groups | New `content_shares (content_item_id, section_id, shared_by, can_release, created_at)`. |
| A receiving instructor sees shared content read-only | Share grants *visibility and release capability*, never edit. Enforced in `save_content_item`, `course-content-upload`, and the publish path. |
| A receiving instructor cannot re-share | `content_shares` may only be written by the item's owner or a `platform_owner`. |
| Students see content only after a valid group/session release | **Unchanged.** The existing release gate is the only student-facing door, and this design adds nothing to it. |

### Schema sketch

```sql
alter table public.content_items
  add column if not exists owner_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists visibility text not null default 'owner_private'
    check (visibility in ('owner_private', 'course_shared'));

create table if not exists public.content_shares (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  section_id uuid not null references public.course_sections(id) on delete cascade,
  can_release boolean not null default true,
  shared_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (content_item_id, section_id)
);
```

`platform_owner` remains global and bypasses both, consistent with the rule the
platform already enforces everywhere else.

### The backfill problem, and the honest answer

Audit finding F6: `created_by` is null on the 23 migrated items, because
`register_item` never set it. So ownership **cannot be recovered** from the
data — it has to be assigned.

The proposal: a one-time, reviewed migration that sets
`owner_profile_id` to the single active `platform_owner` profile for every
existing item, and `visibility = 'owner_private'`. That is factually correct
(the professor authored all of them) and it is the least-surprising default. But
it is a write to 27 production rows and it is item **D3** in the register below.

Until it runs, the new filters must **fail open for a null owner** — an item
with no owner stays visible to course instructors exactly as today — or the
professor's own Content screen would empty out the moment the migration deploys
and before the backfill runs. Deploying the filter before the backfill, with
null-owner items hidden, is the single most likely way to break this feature in
production. It is called out here so it does not have to be learned.

---

## 6. Group-management policy (requirement 8)

Current state, from the audit: create is owner-only on the backend and ungated
in the UI; **rename and archive are open to any assigned instructor**.

The change:

**Backend — `course-section-management`**
- `save_section`'s update branch requires `isGlobalOwner`. A non-owner update
  returns 403 with a stable error code (`section_management_owner_only`), so the
  UI can show localized guidance rather than a raw message.
- The read path is unchanged: an instructor still lists their assigned groups.
- This is enforced for crafted requests by construction — the check is in the
  function, and there is no client-side authorization to bypass because the
  browser cannot reach the table (RLS on, zero policies).

**Frontend — `src/components/Sections.tsx`**
- The **Add a group** card renders only when `isOwner.value` is true.
- The Retire button and `SectionEditor` render only when `isOwner.value` is true.
- A non-owner sees the group table read-only, with a bilingual line explaining
  that group changes are made by the platform owner.
- `isOwner` already exists in `src/state/session.ts` and is computed from active
  memberships; no new state is needed.

**Class scheduling stays as it is.** A regular instructor schedules classes in
their assigned groups — already enforced in `course-session-management` by the
pitfall-#56 pass. Requirement 8 does not change it, and this design must not
regress it.

---

## 7. Destructive and irreversible steps — the register

Requirement 13 asks these be identified before anything runs. **None have been
performed.** Each needs explicit approval on its own; approving the design is
not approving these.

| Id | Action | Reversible? | Risk if wrong |
|---|---|---|---|
| **D1** | Create the private repository `mzareei/tc2007b-course-content` | Yes — delete it | Low. Listed only because it creates a new asset. |
| **D2** | Deploy migration adding `content_versions`, `content_shares`, `owner_profile_id`, `visibility` | Additive; forward-only | Low. Additive-only, per the standing decision. |
| **D3** | Backfill `owner_profile_id` on ~27 existing items | Yes — the prior value is null and recorded first | **Medium.** Wrong owner hides content from the professor. Ordering with the filter deploy matters (§5). |
| **D4** | Re-publish all 23 objects with public links removed | Prior objects preserved in `.versions/` **only if D2 shipped first** | **High if D2 has not shipped** — today's upsert overwrites with no copy. |
| **D5** | Remove `assets/course-materials/information-security/` from the public site, or exclude it in `_config.yml` | Yes — git revert | **High if D4 has not completed** — audit F7: every mission's primary navigation 404s from inside the private bucket. |
| **D6** | Retire the first-generation apps (`progress/`, `exit-ticket/`, `quiz/teacher.html`, `app/`, guides) and add redirects | Yes | Medium. Students with bookmarks lose them; redirects mitigate. |
| **D7** | Prune `.versions/` under a retention policy | **No** | Medium. Deferred; not part of the first implementation. |
| **D8** | Any deletion of `content_items`, `question_banks`, `questions`, students, grades, attempts, releases, or storage objects | **No** | **Not proposed. Not part of this design.** F9: deleting an item nulls its bank link silently. |

**Mandatory ordering:** D2 → D1 → D4 → D5 → D6. D3 sits between D2 and the
deploy of the owner filter. D4 before D5 is not a preference; reversing it
breaks student-visible content.

### Preserved without exception

Per requirement 9: the existing 27 content items, 14 question banks, 223
questions, all groups, and the clean production reset. Nothing in this design
deletes a row. Publishing updates content items **in place** by
`(course_id, slug)`, exactly as `register_item` does today, precisely so
`question_banks.content_item_id` (`on delete set null`) is never given the
chance to go null.

---

## 8. Test-driven implementation plan (requirement 10)

Existing verifier baseline, confirmed green this session:

```
npm run typecheck                                        → passes
COURSE_PLATFORM_BACKEND_ROOT=… npm run verify            → 13/13 verifiers pass
```

Verifiers are plain `node:assert` scripts auto-discovered by
`tools/run-verifiers.mjs` as `tools/verify-*.mjs`. New tests follow that shape.
The backend has its own `tools/verify-*.{js,mjs}` set with the same culture.

Each item below is written failing first, confirmed to fail *for the stated
reason*, then implemented.

**Frontend — `course-platform`**

| New verifier | Asserts | Expected initial failure |
|---|---|---|
| `verify-group-ownership.mjs` | `Sections.tsx` gates the add-group card, Retire, and `SectionEditor` on `isOwner`; the read-only explanation string exists in EN + ES | Fails — the add card is unconditional today |
| `verify-content-ownership.mjs` | `ContentLibrary.tsx` distinguishes owned / shared-read-only; no edit control renders for a shared item; share UI is owner-only | Fails — no such distinction exists |
| `verify-i18n.mjs` (existing) | Every new string added in EN + ES pairs | Fails until pairs are added |

**Backend — `mzareei.github.io`**

| New verifier | Asserts | Expected initial failure |
|---|---|---|
| `verify-section-owner-only.mjs` | `save_section`'s update branch requires `isGlobalOwner` and returns the stable error code | Fails — update only checks `permittedSectionIds` |
| `verify-content-ownership-scope.mjs` | `listContentLibrary` filters items by owner ∪ shares; `saveContentItem` and `course-content-upload` refuse a non-owner | Fails — items are returned course-wide and unscoped |
| `verify-content-publish-guards.mjs` | The publish path never writes `content_releases`, never writes `questions`/`question_banks`, and always writes the version record before overwriting | Fails — the path does not exist |

**Content repo — `tc2007b-course-content`**

| New test | Asserts |
|---|---|
| `validate.test.mjs` | Fixture decks: missing `title.es` fails; a `mzareei.github.io` href fails; an undeclared external host fails; a nested-`<section>` deck fails closed; a prepared lecture missing its checkpoints fails; a clean deck passes |
| `publish.test.mjs` | Against a fixture double: slug and `content_item_id` are preserved; the storage path is unchanged; the version record is written before the overwrite; `--confirm` is required; no release is created |

The `mzareei.github.io` reference test is the one to write first. It is the
validator that makes audit findings F1 and F2 fixable, and having it fail
loudly on all 23 current items is the clearest possible proof the audit is
right.

**Full gate before any deploy:** backend verifiers, frontend verifiers,
`npm run typecheck`, `npm run build`, and a clean `git diff` review — as
`06-runbook.md` already requires.

---

## 9. What is explicitly out of scope here

- Re-authoring or improving any deck's *content*. Publishing is a transport, not
  an edit.
- Changing the gated delivery chain (`/content?t=…`). It is load-bearing and
  correct.
- Changing the release state machine, the quiz engine, or grading.
- The real-phone classroom rehearsal, which remains the other pending item in
  `PROJECT-HANDOFF.md`.

---

## 10. Open questions for the professor

1. **Repository name and scope** — `tc2007b-course-content`, or a
   course-agnostic `course-content` that could hold a second course later?
2. **Ownership backfill (D3)** — assign all 27 existing items to your owner
   profile? That is the only factually correct answer available, but it is a
   production write and needs your word.
3. **Sharing default** — when you share a lecture with Group 402's instructor,
   should they be able to *release* it to their own group (`can_release = true`,
   proposed), or only view it?
4. **Public-site retirement (D5/D6)** — remove `assets/course-materials/`
   entirely, or keep the directory serving redirects to a "this course now runs
   on the platform" page? The second preserves any external links you have
   published in a syllabus.
5. **Publish authentication** — confirm the CLI-only recommendation in §4, or do
   you want the GitHub Action to be able to publish on merge (which requires a
   standing credential)?
