# Separating the admin view from the instructor view

## Decision

The professor is both `platform_owner` of the platform and instructor of Group
401. Today those two facts collapse into one screen: `loadTeacherSessions`
treats a platform owner as a global instructor, so every Teach screen shows all
four groups' classes, students and grades in a single undifferentiated pile.

A **scope switcher** in the top bar splits them. One control, two halves:

```
INSTRUCTOR
  ✓ Group 401   (you teach this)
──────────────────────────
ADMIN
    All groups
    Group 402
    Group 501
    Group 502
```

- **Instructor · Group 401** — every Teach screen shows Group 401 and nothing
  else.
- **Admin · All groups** — today's behaviour: everything at once, with a Group
  column so rows are attributable.
- **Admin · Group 402** — Group 402 exactly as its own instructor would see it.

The filtering happens **in the app, not on the server**. No edge function is
edited and none is redeployed. For a platform owner the switcher is a focus
tool, not an authorization boundary: the server already permits the owner to
see everything, and the existing per-section guard that stops a non-owner
instructor reading another group's data is untouched.

## What is deliberately not built

- **No server-side scope.** Passing the chosen group to `course-gradebook-
  summary`, `course-roster-management`, `course-section-management`,
  `course-auth-context` and the rest would mean editing and manually deploying
  around eight edge functions (frontend deploys on push; edge functions do
  not). It would change nothing the professor can see, and every one of those
  functions already refuses a non-owner asking for a group they do not teach.
- **No separate `/admin/*` routes.** A second set of Classes / Grades / People
  screens doubles every future change.
- **No course level in the switcher.** The platform hosts one course
  (`tc2007b`); groups are what the professor means by "401" and "402". The
  scope type leaves room for a course level without a rewrite, but nothing
  builds it now.
- **Owner-only controls are not hidden in Instructor mode.** Explicitly asked
  for: the Admin tab, group create/rename/retire, Course reset and Force delete
  stay exactly where they are in every mode. What the switcher changes is the
  data on screen — which rows appear, and whether a Group column is worth
  showing — never which controls exist.
- **Scope is not in the URL.** It lives on the device, like theme and language.

## The scope model

New module `src/state/scope.ts`.

```ts
export type Scope =
  | { kind: "instructor"; sectionId: string }
  | { kind: "admin"; sectionId: string | null };   // null = all groups
```

Persisted to `localStorage` under a new `config.scopeStorageKey`
(`"cp.scope"`), serialized as `instructor:<uuid>` / `admin:all` /
`admin:<uuid>`.

Derived signals:

| Signal | Meaning |
|---|---|
| `activeSectionId` | `string \| null` — `null` means all groups |
| `isAllGroups` | `activeSectionId === null` |
| `isForeignGroup` | a single group is active and the user does not teach it |
| `scopeOptions` | the menu, already grouped and ordered |

### Where the group list comes from

Two sources, both already in the app:

- **Groups you teach** — `context.value.sections`, filtered to entries whose
  `role` is `instructor` or `teaching_assistant`. This is what
  `course-auth-context.loadSections` returns from `section_enrollments`, so it
  is per-person and correct for every professor.
- **All groups** — `listSections()` (`course-section-management`), fetched once
  after boot on the instructor surface and cached in the scope module. That
  function returns every group to a `platform_owner` and only permitted groups
  to anyone else, so one code path serves both.

`course-section-management` gates on `platform_owner | instructor`, so a
teaching assistant's fetch is refused. On any failure the module falls back to
the groups in `context.value.sections`. No error is shown: a failed fetch means
a shorter menu, never a broken top bar.

### Choosing the menu

- **INSTRUCTOR** — one entry per group you teach, ordered by `section_code`.
- **ADMIN** — rendered only when `isOwner`. "All groups", then every group from
  the full list that is *not* one you teach, ordered by `section_code`.

Group 401 deliberately appears once. Because owner controls stay visible in
Instructor mode, an "Admin · Group 401" entry would render a screen identical
to "Instructor · Group 401"; two menu entries for one view is a bug, not a
feature.

**The switcher renders nothing when the menu holds one entry or fewer.** An
instructor who teaches only Group 402 sees no dropdown and no change to their
app.

### Defaults and recovery

| Situation | Result |
|---|---|
| Nothing saved, you teach ≥1 group | `instructor` on your lowest `section_code` |
| Nothing saved, owner teaching no group | `admin` / all groups |
| Nothing saved, neither | no switcher; screens behave as today |
| Saved group no longer in the list | fall back to the default above, silently |
| Saved `admin` scope, user is not an owner | fall back to the default above |

A group archived mid-session is caught on the next `refreshContext`, and the
scope falls back rather than rendering an empty screen.

## What each screen does

`activeSectionId === null` means **no filtering at all** — current behaviour,
preserved exactly. Everything below describes a single active group.

The filters live in one pure module, `src/features/scope/filters.ts`, so no
screen invents its own rule and the verifier has something to self-test:

```ts
inScope(sectionId: string | null | undefined, active: string | null): boolean
scopedSessions(sessions, active)
scopedRoster(roster, active)      // includes the ungrouped — see below
scopedReleases(releases, active)  // includes course-wide — see below
```

| Screen / component | Behaviour when one group is active |
|---|---|
| `screens/instructor/Home.tsx` | `teacher_sessions` filtered to the group. The Group column in the upcoming table is hidden — every row would carry the same value. |
| `components/Schedule.tsx` | Class days filtered to the group. The Group column hidden. The "add a class day" group picker is filtered to the active group, so a new class day lands in the group you are looking at without a second choice. |
| `components/Sections.tsx` | The list shows only the active group. Create / rename / retire controls unchanged in every mode. |
| `components/CourseReset.tsx` | Unchanged. Course-wide and deliberately left alone. |
| `screens/instructor/People.tsx` | Roster filtered to people holding a `sections[]` entry for the active group, **plus a separate "Not in a group yet" block** for people with no group at all. Freshly imported students have no group; without that block, importing a roster and then assigning it would be impossible from inside a group view. The group `<select>` used to *assign* a person stays the full list — moving a student from 401 to 402 is the point of it. |
| `screens/instructor/Gradebook.tsx` | Matrix scores filtered by `section_id`; students filtered through `scopedRoster`. The per-class tab's session picker filtered through `scopedSessions`. `sessionStudents` already scopes to the chosen session's group and is untouched. |
| `components/ContentLibrary.tsx` | Releases where `section_id === active` **or** `section_id == null` — whole-course content is genuinely available to that group and hiding it would misrepresent what the group can see. The share list filtered to the group; the "share with group" target dropdown stays the full list. |
| `screens/instructor/Content.tsx` | Session-linked panels filtered through `scopedSessions`. |
| `screens/instructor/Admin.tsx` | Unchanged — courses and professors are course-level. |
| `RunClass`, `ClassRecord`, `Projector`, `Viewer` | Unchanged. Each is already one class at a time. Opening one outside the active scope is allowed and shows the banner below. |

### People's existing `?group=` deep link

`People.tsx` already reads `?group=<uuid>`. When that parameter names a valid
group it now **sets the app scope** instead of competing with it — `instructor`
kind if it is a group you teach, `admin` kind otherwise — so the link keeps
working and the top bar tells the truth about what is on screen. An unknown or
malformed `?group=` is ignored exactly as it is today.

## The foreign-group banner

New `src/components/ScopeBanner.tsx`, rendered on the Teach screens whenever
`isForeignGroup` is true:

> **Viewing Group 402** — you are not the instructor of this group.

It exists because grades edited from that screen belong to real students in
someone else's group, and the only thing distinguishing the screen from the
professor's own is a value in a dropdown.

## Strings

Every label added to `src/i18n/strings.ts` as an EN + ES pair, which
`verify-i18n` already enforces:

`scope.label`, `scope.instructor`, `scope.admin`, `scope.allGroups`,
`scope.youTeach`, `scope.viewingForeign`.

## Error handling

| Failure | Behaviour |
|---|---|
| `listSections()` rejects | Fall back to the groups in `context.sections`. No user-facing error; a shorter menu, never a broken top bar. |
| Saved scope unparseable or stale | Fall back to the default. No error. |
| `localStorage` unavailable | Scope works for the session and is not remembered. No error. |
| Active group archived while open | Next `refreshContext` recomputes the menu; scope falls back to the default. |

Nothing in this feature can produce a blocking error state. The worst outcome
is the switcher not rendering, which leaves today's behaviour exactly as it is.

## Verification

New `tools/verify-scope-filter.mjs`, following the shape of the existing
self-test verifiers, added to `tools/run-verifiers.mjs`:

1. **Self-tests the pure helpers** in `src/features/scope/filters.ts`:
   - a `null` active scope returns every row unchanged;
   - a single group returns only that group's rows;
   - `scopedRoster` keeps people with no group at all;
   - `scopedReleases` keeps releases with `section_id == null`;
   - a stale saved scope resolves to the default.
2. **Statically asserts** that `Home.tsx`, `Schedule.tsx`, `People.tsx`,
   `Gradebook.tsx` and `ContentLibrary.tsx` each import from
   `features/scope/filters`, so a Teach screen cannot quietly go back to
   reading `teacher_sessions` or the raw roster directly.
3. **Asserts the switcher is rendered from the top bar** in `app.tsx` —
   pitfall #12's shape is a feature no user can reach.

`npm run verify` must stay green (40 verifiers today, 41 after this), and
`npm run typecheck` must pass.

## Manual testing

**In Groups 501 and 502 only.** Group 402 holds around 26 real students and
Group 401 is the professor's live teaching group; a class left half-finished
there is deliberate. Nothing in this work opens, runs, ends, resets or deletes
a class in 401 or 402.

1. Sign in as the professor. Confirm the switcher shows Group 401 under
   INSTRUCTOR and All groups + 402 + 501 + 502 under ADMIN.
2. Instructor · 401 — Home, Classes, Grades, People and Content each show 401
   only, and no Group column.
3. Admin · All groups — everything returns, Group columns present.
4. Admin · Group 501 — 501's (empty) view, banner visible.
5. Reload the tab: the last choice is still selected.
6. Sign in as a QA student account in 501 and confirm the student surface is
   untouched.
