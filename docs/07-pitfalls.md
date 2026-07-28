# Pitfalls — read before debugging

Every entry here already cost real time, and several shipped broken behaviour to
the professor. They share a shape: **the code looks right, nothing errors, and
the UI is silently wrong.**

---

## 1. Test through the real entry points, not internal routes

**The single most important lesson in this document.**

A whole night of testing was done by navigating the browser directly to `/live`.
Everything "worked". Then the professor tested for real and nothing worked —
because the **"Join class" button never appeared on the Today screen**, so a
student had no way to reach `/live` at all. The code path being validated was
one no user could reach.

**Rule:** sign in as a student in a clean session and click from Today. If you
find yourself typing an internal URL to reach a feature, you are not testing it.

---

## 2. Never render deck HTML with `srcdoc` or `blob:`

**This has bitten twice**, in Phase 2 and again in Phase 5.

Both `srcdoc` and `blob:` iframes **inherit the parent page's CSP**. The app's
CSP forbids inline scripts, so the deck's engine `<script>` is silently blocked.
The symptom is maddening: all slides are present in the DOM, the page looks
fine, but the engine never initialises — stuck on slide 1, counter reading
"1 / 1", no navigation.

**Rule:** deck HTML is only ever loaded through `/content?t=<token>`, which is
same-origin and gets a relaxed CSP scoped to that path in `public/_headers`.
For unreleased drafts use `course-generation`'s `preview_url`.

---

## 3. Frontend/backend field-name mismatches are invisible

TypeScript cannot verify a contract across a network boundary. An interface that
*claims* the backend returns `weighted_percent` compiles perfectly while the
backend actually returns `weighted_course_percent` — and the UI renders "—"
forever with no error.

Four of these were found in one audit, three of them shipped and live:

| Screen | Frontend expected | Backend actually returns |
|---|---|---|
| Grades | `weighted_summary.weighted_percent` | `weighted_course_percent` |
| Grades | `categories[].{name,weight_percent,average_percent}` | `category_summaries[].{category_name,category_weight_percent,category_average_percent}` |
| People | `person.enrollments[]`, `.role`, `.status` | `person.sections[]`, `.course_role`, `.profile_status` |
| Gradebook | `score.student_email` | `institutional_email` |

**Rule:** when writing or changing a screen, open the edge function and read the
actual `return json({...})` — trace into helpers if it delegates. Never trust
the TypeScript interface as evidence.

A defensive `?? "—"` fallback is what makes these invisible. Consider whether a
missing field should be loud instead.

---

## 4. Never define a component inside another component

```tsx
// WRONG — new component identity on every render
function Live() {
  const Shell = ({ children }) => <div>{children}</div>;
  return <Shell>…</Shell>;
}
```

Preact sees a different component *type* each render and unmounts/remounts the
entire subtree. Combined with a 3-second poll, this meant `QuizPlayer` was
destroyed and recreated every 3 seconds — its initial fetch never had time to
resolve, so the quiz sat on "Loading the quiz…" forever while `start_attempt`
hammered the server in a loop.

**Rule:** define components at module scope. Always, but especially in anything
that re-renders on a timer.

---

## 5. "Recover state after reload" must distinguish active from finished

A recovery call was added so a page refresh wouldn't lose an in-progress quiz.
It fetched the *most recent* quiz instance regardless of state — so once a
session's first quiz was closed, every load recovered that closed instance and
rendered the closed-summary branch, which has **no start button**. The button
flashed on first paint then vanished. The professor could never run a second
quiz.

**Rule:** a recovery feature must return "what is running" and "what finished"
as separate things, or it will remove the control that creates new work.

---

## 6. A partial unique index cannot be an `ON CONFLICT` target

```sql
create unique index … where generation_key is not null;   -- ✗ unusable
alter table … add constraint … unique (a, b);             -- ✓ works
```

Postgres/PostgREST only match a *full* index for a plain-column `upsert()`.
A partial index yields "there is no unique or exclusion constraint matching the
ON CONFLICT specification". Plain unique constraints still permit unlimited
NULLs, so they were the right choice anyway. Fixed in migrations 0015 and 0016.

---

## 7. Word-count limits and character-count limits are not the same guard

`exit_tickets.one_thing` had a `length between 1 and 500` check from when the
reflection was a short field. The reflection was later redesigned to 50–100
words — and a 95-word answer is ~630 characters. Legitimate submissions were
rejected by Postgres *after* passing the app's own word-count validation.

**Rule:** when a field's shape changes, re-check the constraints sized for the
old shape. Migration 0018 raised it to 1500.

---

## 8. A stale "revealed" pulse round blocks the whole live screen

`loadCurrentPulse` had no time bound on the `revealed` state. If a professor
forgot to click "Close the question", the student's live screen showed that
question forever and could never progress to the quiz or reflection.

Fixed with a 3-minute `revealDisplayMinutes` window. **Rule:** any state a human
is supposed to clear manually needs a timeout, because sometimes they won't.

---

## 9. `String.replace` with a string pattern treats `$` specially in the replacement

`$&`, `` $` ``, `$'`, `$1` in a *replacement string* get substituted. When
splicing large assets (CSS, JS) into a template this can silently corrupt them.

Not currently biting us (the deck assets contain only `$/` inside a regex, which
isn't special), but the deck assembler does exactly this kind of splice — worth
remembering if a generated deck ever comes out subtly broken.

---

## 10. Models return the right data in the wrong shape

The first real generation run produced a step where `questions` came back as an
object rather than an array, and the code died with
`questions.forEach is not a function` — a message meaningless to a professor.

The tool schema asks for an array; that is not a guarantee. `asArray()` in the
worker coerces and unwraps. **Rule:** validate and coerce model output at the
boundary, and make the error message something a non-engineer could act on.

The flip side: the question validator caught a genuine bad generation in the
wild ("Q3 has 5 options") and the retry produced a valid bank. Quality gates on
model output earn their keep.

---

## 11. Browser automation clicks can race a fresh render

When driving the app with browser tooling, a click issued immediately after a
re-render can land before Preact has attached handlers, so it appears to do
nothing. This is a *testing* artifact, not an app bug — but it will send you
chasing a phantom.

Confirm with a direct `element.click()` via injected JS before concluding the
app is broken.

---

## 12. A status the backend can emit but `StatusPill` doesn't know renders raw

`StatusPill` falls back to the raw state string for any state not in its
`CLASSES` map. That fallback is silent: no error, no missing-string warning, and
`verify-i18n` cannot catch it because there is no `t()` call to check.

`student_attempts.status` can be `late` (set in `course-activity-attempt` when
the submission lands after `ends_at`), and `late` was in neither `CLASSES` nor
`strings.ts`. Any screen showing attempt statuses would have rendered a bare,
untranslated "late" to a Spanish-reading professor. Found while building
Gradebook Tab B, fixed in the same commit.

**Rule:** when you surface a new status column in the UI, grep the edge function
for every literal it can write (`grep -n 'status:' index.ts`) and confirm each
one exists in `StatusPill`'s map *and* in `strings.ts`. This is pitfall #3's
shape — a cross-boundary mismatch the compiler cannot see — with a defensive
fallback hiding it.

---

## 13. Supabase CLI and the SQL editor have different permissions here

`npx supabase db push` and `npx supabase functions deploy` work. Retrieving the
service-role key and running arbitrary `INSERT`s through the dashboard SQL
editor may be blocked by tooling policy. Prefer the app's own endpoints, or
`npx supabase storage cp`, over hand-writing rows.
