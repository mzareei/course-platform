# The private content repository — scaffold

This directory is the starting contents of **`mzareei/course-content`**, the
private repository where course materials are authored.

It lives here only because this session could not create the repository: the
GitHub integration token is not permitted to create repos (`403 Resource not
accessible by integration`). Creating it is a 30-second manual step.

## Setting it up

1. On GitHub: **New repository** → name `course-content` → **Private** →
   Create. Do not add a README; the files below become the first commit.
2. From your machine:

   ```bash
   git clone https://github.com/mzareei/course-content.git
   cd course-content
   cp -R /path/to/course-platform/tools/content-repo/. .
   git add -A && git commit -m "Course content authoring repository"
   git push
   ```

3. Delete `tools/content-repo/` from `course-platform` once it has moved —
   two copies of the same tooling is two copies of one fact, and they drift.

## Layout

```
course.json                      course id, allowed external hosts, defaults
courses/
  tc2007b-information-security/
    content/
      week-01-lecture/
        content.json             metadata + version history for this item
        index.html               the authored artifact
        assets/                  optional; inlined at publish time
        source/                  optional PDFs; NEVER published
shared/                          mirrored deck engine — see below
tools/
  validate.mjs                   the gate; runs in CI, no secrets
  publish.mjs                    the only thing that writes to production
.github/workflows/validate.yml   validates every PR; cannot publish
```

One directory per item, named for its slug, because the slug is the join key
to production (`content_items.unique (course_id, slug)` and the storage prefix
`courses/<course>/items/<slug>/`). Making the directory name *be* the slug
means the mapping is visible in `ls` and the tools have nothing to infer.

`shared/` is a **mirror** of the deck engine, whose real home is
`mzareei.github.io/supabase/functions/_shared/templates/`. Editing it here
would create a second source of truth and a silent drift path. `validate.mjs`
fails if the mirror does not match.

## Publishing

```bash
COURSE_ACCESS_TOKEN=<your instructor session token> \
  node tools/publish.mjs week-01-lecture --confirm
```

Publishing **never makes anything visible to students.** It replaces the file
in private storage; a release is still a separate, explicit action in the app.

The token is your own short-lived Supabase session token, re-validated by the
edge function on every call. Nothing here needs or touches a service key —
this repository holds no credentials, and neither does the CI workflow.
