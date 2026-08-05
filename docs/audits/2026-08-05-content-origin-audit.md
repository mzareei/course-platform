# Content-origin audit — TC2007B

**Date:** 2026-08-05
**Scope:** requirement 1 and 2 of the private-content-authoring brief.
**Status:** repository evidence complete; production database confirmation pending.
**Nothing in this audit changed production.** No SQL was executed, no storage
object was written or deleted, no release was altered.

---

## What this session could and could not verify

Be clear about the boundary before reading the findings.

| Source | Reachable from this session | Evidence quality |
|---|---|---|
| `mzareei/course-platform` (frontend) | Yes — full checkout, verifiers run | Direct |
| `mzareei/mzareei.github.io` (backend + public site) | Yes — read-only clone at `9d40cc0` | Direct |
| Production Supabase `ojmbupftdikwmlqvibwt` | **No** — no service key, no CLI token | Not verified |
| Private `course-content` bucket | **No** | Not verified |
| Live `https://mzareei.github.io/...` | **No** — outbound HTTPS to that host is blocked by the sandbox proxy (403 on CONNECT) | Not verified live; verified from committed source |

So: everything below that describes *files, code and configuration* is direct
evidence. Everything that describes *rows in production* is a derivation from
the code that wrote those rows, and must be confirmed by running
[`content-origin-audit.sql`](./content-origin-audit.sql) — a read-only script,
safe to run at any time.

---

## 1. The four origin classes, and what actually exists

`content_items.source_kind` is constrained (migration `0004`, widened by `0012`)
to exactly four values:

```sql
check (source_kind in ('static_path', 'supabase_record', 'external_url', 'storage_object'))
```

The brief asks for a four-way classification of `storage_object` /
`static_path` / `external_url` / `other`. Mapping onto the schema:

| Brief's class | Schema value | Meaning in this platform |
|---|---|---|
| `storage_object` | `storage_object` | Private bucket object, served through `/content?t=…`. The intended state. |
| `static_path` | `static_path` | A path resolved against the public site. Legacy first-generation shape. |
| `external_url` | `external_url` | An `https://` URL on a third-party host. |
| `other` | `supabase_record` | Not a document at all — an activity/quiz bank that lives in Postgres. `studentDelivery()` classifies these `live_only` and no student viewer ever opens them. |

`supabase_record` is the only value that lands in "other", and it is not a
content-privacy problem: `src/api/contentVisibility.ts` already refuses to put
it in front of a student, and pitfall #23/#25 record why.

### Derived production inventory

The clean reset of 2026-08-03 recorded **27 retained content items, 14 question
banks, 223 questions** (`PROJECT-HANDOFF.md`). Of those 27, 23 are accounted
for exactly, from the tool that created them.

`tools/migrate-gated-content.mjs` in the backend repo discovers content by
walking `assets/course-materials/information-security/week-NN/`. Running it in
`--dry-run` mode this session (build only — it never contacts Supabase without
`COURSE_ACCESS_TOKEN`) produced **23 items, 11 lectures and 12 missions, all
building cleanly**:

| # | Slug | Type | Title as registered |
|---|---|---|---|
| 1 | `week-01-lecture` | lecture | Week 1 Lecture 1: Introduction to Cybersecurity |
| 2 | `week-01-lecture-2` | lecture | Week 1 Lecture 2: Legal & Ethical Aspects |
| 3 | `week-01-mission-01` | mission | Mission 01: Think Like an Attacker |
| 4 | `week-02-lecture` | lecture | Week 2 Lecture 1: Authentication |
| 5 | `week-02-lecture-2` | lecture | Week 2 Lecture 2: Access Control |
| 6 | `week-02-mission-02` | mission | Mission 02: Prove Who You Are |
| 7 | `week-02-mission-03` | mission | Mission 03: Control The Door |
| 8 | `week-03-lecture` | lecture | Week 3 Lecture 1: Database and Application Security |
| 9 | `week-03-mission-04` | mission | Mission 04: Break The App Safely |
| 10 | `week-04-mission-bridge` | mission | Bridge Mission: Harden The Release |
| 11 | `week-05-lecture` | lecture | Week 5 Lecture 1: Asymmetric Encryption & Public-Key Algorithms |
| 12 | `week-05-mission-05` | mission | Mission 05: Exchange The Secret |
| 13 | `week-06-lecture` | lecture | Week 6 Lecture: Symmetric Encryption |
| 14 | `week-06-mission-bridge` | mission | Bridge Mission: Protect The Data |
| 15 | `week-07-lecture` | lecture | Week 7 Lecture: Security Protocols & Hash Functions |
| 16 | `week-07-mission-06` | mission | Mission 06: Authenticate The Message |
| 17 | `week-08-mission-bridge` | mission | Bridge Mission: Secure The Channel |
| 18 | `week-09-lecture` | lecture | Week 9 Lecture: Malicious Code (Malware) |
| 19 | `week-09-mission-07` | mission | Mission 07: Contain The Malware |
| 20 | `week-10-lecture` | lecture | Week 10 Lecture 1: Firewalls |
| 21 | `week-10-mission-08` | mission | Mission 08: Build The Perimeter |
| 22 | `week-11-lecture` | lecture | Week 11 Lecture: Intrusion Detection (IDS/IPS) |
| 23 | `week-11-mission-09` | mission | Mission 09: Tune The Detector |

Storage path for every one of them, from `course-content-upload`'s
`create_upload_url`:

```
courses/tc2007b/items/<slug>/index.html
```

Note the filename: the migration tool passes `filename: "index.html"`, so the
real production paths end in **`index.html`**, not the `deck.html` named in the
brief. `deck.html` is what the AI pipeline writes for *generated* lectures.
This is exactly the kind of detail a publish tool must not guess at — query 5 in
the SQL script reconciles `content_items.source_ref` against `storage.objects`
so the true filenames are established before anything is written.

The remaining **4 of 27** are not identified from the repository alone. The
likely composition, to be confirmed by query 2:

- `Week 1 Quiz: Security Foundations` — `content_type = 'activity'`,
  `source_kind = 'supabase_record'` (named in pitfall #23; the item the Content
  screen used to offer an availability control for).
- Up to three AI-generated lectures from the Phase 5 dogfooding, which would be
  `storage_object` at `courses/tc2007b/items/<slug>/deck.html` with
  `generation_job_id` set.

**Do not act on that guess.** Query 1 answers it definitively.

### Question-bank references

14 banks / 223 questions were retained. `question_banks.content_item_id` is
`references content_items(id) on delete set null` — so the link survives an
item *update* but is silently dropped if an item is ever deleted and recreated.
That single line is the strongest argument in this audit for the publishing
design's "never delete, always update in place" rule (see §5 of the design doc).

223 is not a multiple of 18, so the banks are not uniformly legacy-prepared
18-question banks; query 4 breaks down which banks are `active`, which reached
`checkpoint_preparation_state = 'ready'`, and which are stranded at
`pending_upload` (the durable-retry state from pitfall #30).

---

## 2. What still depends on public GitHub Pages

This is the substantive finding of the audit, and it is worse than "some old
links".

### 2a. The public site still publishes every lecture and mission

`_config.yml` in the backend repo excludes `supabase` and `docs/superpowers`
from the Jekyll build. It does **not** exclude `assets/`. And
`_courses/information-security.md` links to all 23 of them by hand:

```
| 1 | Security mindset… | [Deck](/assets/course-materials/information-security/week-01/lecture/) | [Mission 01](…/week-01/mission-01/) |
| 1 | Legal & ethical aspects | [Deck](…/week-01/lecture-2/) | — |
…11 rows…
```

So the entire course is reachable without signing in, from a page that is
itself linked from the professor's public academic site. The private bucket is
not currently protecting anything that is not also published in the clear. The
gate is real; it just has a door next to it.

This is Phase 6 work that `PROJECT-HANDOFF.md` already lists as pending. The
audit's contribution is to say it precisely: **23 of 23 migrated items, plus the
`progress/`, `exit-ticket/`, `quiz/teacher.html`, `app/`, `student-guide/` and
`teacher-guide/` first-generation apps.**

### 2b. The gated copies link *back out* to the public copies

This one is not in the pending list, and it matters more.

`migrate-gated-content.mjs` inlines CSS and JS into a single file, then
deliberately rewrites every remaining relative link to an **absolute public
URL** (`resolvePublicUrl()`), so cross-navigation would not break while the
public copies still existed. That was the right call in Phase 2. It means every
object in the private bucket carries hard links to `mzareei.github.io`.

Rebuilding all 23 this session and counting the baked-in public references:

| Item class | Count | Public destinations baked into each object |
|---|---|---|
| Lectures (11) | 4 unique each | course home · its mission · `quiz/teacher.html?lecture=…` · `exit-ticket/?lecture=…` |
| Missions incl. bridges (12) | 2–4 unique each | course home or **the public copy of its lecture** · `progress/` · for bridges also `quiz/teacher.html` and `exit-ticket/` |

Two consequences:

1. **A student inside the gated viewer can click out to the ungated site.** For
   the 9 non-bridge missions the "Back to the lecture" button
   (`class="btn"`) points at
   `https://mzareei.github.io/assets/course-materials/information-security/week-NN/lecture/`
   — the public copy of the very deck the gate exists to protect. Ten of the
   twelve missions also link to the public `progress/` app.
2. **Retiring the public site breaks the private content.** If §2a is fixed by
   deleting or redirecting `assets/course-materials/`, every one of those links
   becomes a 404 *from inside the private bucket*, and the fix requires
   rewriting and re-uploading all 23 objects. The two problems have to be solved
   in one plan, not sequentially.

### 2c. Partial cleanup exists, and does not cover the missions

`removeLegacyDeckNavigation()` in
`supabase/functions/_shared/checkpoint-deck.ts` strips exactly four legacy
destinations — course home, `mission-NN/`, `quiz/teacher.html`, `exit-ticket/` —
and only from anchors carrying the `ui-btn` class. Two limits:

- It runs **only** during "Prepare checkpoints" (`course-checkpoint-backfill`),
  which applies to **lectures with an active 18-question bank**. Missions never
  go through it at all.
- Mission anchors use `class="btn"` / `class="btn btn-secondary"`, not
  `ui-btn`, so even if a mission were passed through it, nothing would be
  removed. The `progress/` destination is not in the match list either.

So the current state of a production object depends on whether its lecture has
been checkpoint-prepared:

| Object | Legacy nav stripped? |
|---|---|
| Lecture, checkpoint-prepared (`checkpoint_preparation_state = 'ready'`) | Yes — its 4 destinations removed |
| Lecture, not prepared | No |
| Any mission or bridge mission | **No — and no code path currently would** |

Query 4 in the SQL script tells you which lectures are in which state. That is
the only way to know how many production objects still carry the links, and it
is the reason the audit does not assert a single number here.

### 2d. Assets and fonts

Every built object also references `fonts.googleapis.com` / `fonts.gstatic.com`,
and two decks reference `amiunique.org` and `tosdr.org` as teaching examples.
These are third-party, not GitHub Pages, and they are content — not a leak. The
`/content` CSP in `public/_headers` must keep allowing the font hosts, or every
deck loses its typography. Worth stating so a future "tighten the CSP" change
does not break all 23 decks at once.

No object references a local image, script or stylesheet: the migration tool
fails closed (`Unresolved local references remain: …`) if anything local
survives, and all 23 built cleanly this session. **There are no orphan asset
files to migrate.** Everything is inside the single HTML file.

---

## 3. Ownership and scoping, as they stand today

Requirement 7 asks for owner-private content. The audit's job here is to record
what exists now, so the design is measured against reality.

| Question | Today |
|---|---|
| Does `content_items` have an owner? | Only `created_by uuid references profiles(id) on delete set null`. Nothing reads it. |
| Is `created_by` populated for the 23 migrated items? | **No.** `course-content-upload`'s `register_item` upsert does not set `created_by` at all. Only `course-content-library`'s insert path sets it. So the migrated decks almost certainly have `created_by = null` (query 1 reports it). |
| Can instructor B see instructor A's content? | **Yes.** `listContentLibrary()` filters *sections, sessions and releases* by `permittedSectionIds`, but returns `content_items` unfiltered for the whole course. |
| Can instructor B edit instructor A's content? | **Yes.** `saveContentItem()`'s update path checks only that the item belongs to the course — no section scope, no ownership check. Slug, title and `source_ref` are all rewritable. |
| Can instructor B overwrite instructor A's storage object? | **Yes.** `course-content-upload` has no section or ownership scoping whatsoever; `create_upload_url` mints an upsert-enabled signed URL for any slug in the course. |
| Is there any version history? | **No.** `register_item` upserts the row and PUTs the object with `upsert: true`. The previous deck is gone. |

None of this is a regression — the section-scope hardening recorded in
pitfall #56 deliberately covered rosters, sessions, releases, grades, notes and
audit. Content authorship was never in that pass. It is the gap the new
architecture has to close.

## 4. Group management, as it stands today

Requirement 8 asks that only `platform_owner` may create, rename, archive or
otherwise modify a group. Current state:

| Operation | Backend (`course-section-management`) | Frontend (`src/components/Sections.tsx`) |
|---|---|---|
| Create a group | ✅ Enforced — `"Only the platform owner can create new course sections."` | ❌ The **Add a group** card is rendered unconditionally for every instructor. `isOwner` exists in `src/state/session.ts` and is used only for the Admin tab. A regular instructor sees the form and gets a 403 after clicking. |
| Rename / change meeting pattern / campus | ❌ **Not enforced.** `saveSection()`'s update branch requires only that the section be in `permittedSectionIds`. | ❌ `SectionEditor` is offered on every row the instructor can see. |
| Archive / retire | ❌ **Not enforced** — same update branch; `status` is a plain field on the update. | ❌ The Retire button renders for any instructor. |
| Schedule a class in an unassigned group | ✅ Enforced in `course-session-management` (pitfall #56 pass). | ✅ Pickers are section-scoped. |

So requirement 8 is currently satisfied for *create* only, on the backend only.
Rename and archive are open to any assigned instructor, which is precisely the
"crafted request" case the requirement calls out.

---

## 5. Findings, ranked

| # | Finding | Severity | Reversible? |
|---|---|---|---|
| F1 | Every lecture and mission is published in the clear on the public academic site, linked from a public course index | High — defeats the gate | Yes (site change) |
| F2 | 9 missions link from inside the private bucket to the **public copy of their lecture**; 10 link to the public `progress/` app | High — click-out from behind the gate | Yes (re-publish objects) |
| F3 | Any course instructor can read, edit and overwrite any other instructor's content item and storage object | High — requirement 7 is unimplemented | n/a (new capability) |
| F4 | A regular instructor can rename and archive their assigned group | Medium — requirement 8 half-enforced | n/a (new guard) |
| F5 | No content version history; publish overwrites the object and the row | Medium — no rollback after a bad publish | n/a (new capability) |
| F6 | `created_by` is null on migrated items, so ownership cannot be inferred retroactively | Medium — owner must be assigned deliberately, once, with approval | Yes |
| F7 | Fixing F1 without first fixing F2 turns every mission's primary navigation into a 404 | Medium — ordering hazard | Yes |
| F8 | Storage filenames are `index.html` (migrated) vs `deck.html` (generated); a publish tool that assumes one will corrupt the other | Medium — silent data hazard | Yes |
| F9 | `question_banks.content_item_id` is `on delete set null` — deleting and recreating an item silently orphans its bank | Medium — data-loss hazard during migration | **No, once triggered** |

F9 is the one that would be genuinely expensive to undo, and it is the reason
the design forbids delete-then-recreate anywhere in the publish path.

---

## 6. To confirm against production

Run [`content-origin-audit.sql`](./content-origin-audit.sql) in the SQL editor
and record:

1. The 27-row report from query 1 — paste it under "Production inventory" here.
2. Query 2's totals against the derived 23 + 4 above.
3. Query 3 — any non-`storage_object` item is a live public-path dependency.
4. Query 4 — which lectures are `ready` (nav stripped) vs `none` (nav intact),
   and whether any bank is stranded at `pending_upload`.
5. Query 5 — the true filename of every object, and any `content_items` row
   pointing at a path the bucket does not have (or vice versa).

Until those five results are recorded, no publish, migration, or public-site
retirement should run.
