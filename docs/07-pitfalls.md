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

The same applies to *filling* a field. A tool that assigns `input.value`
directly does not necessarily make Preact see the change, so the component's
state stays empty and the submit button acts on nothing. Hit again on
2026-07-28 signing in as the QA student. The combination that works every time:

```js
const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
set.call(input, "value");
input.dispatchEvent(new Event("input", { bubbles: true }));
button.click();
```

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

**Rule:** when you surface a status column in the UI, list every value the
*schema* allows and confirm each exists in `StatusPill`'s map and in
`strings.ts`. From `mzareei.github.io/supabase/migrations`:

```bash
grep -rho "status in ([^)]*)" *.sql | sed "s/status in (//" | tr -d "()'" | tr ',' '\n' | tr -d ' ' | sort -u
grep -rho "state in ([^)]*)"  *.sql | sed "s/state in (//"  | tr -d "()'" | tr ',' '\n' | tr -d ' ' | sort -u
```

Running that sweep while building the Admin screen turned up three more silent
gaps beyond `late`: `completed` (`courses.status`, `course_sections.status`),
`merged` (`profiles.status` — already reachable from the People screen) and
`dropped` (`section_enrollments.status`). All four are fixed.

This is pitfall #3's shape — a cross-boundary mismatch the compiler cannot see —
with a defensive fallback hiding it. Note the two different column names:
grepping only for `status` misses every `state` column, and vice versa.

---

## 13. Roster import used to sign every existing student out

**Found 2026-07-28 while building the CSV import UI. Fixed in
`course-roster-management`, deployed.**

`upsertAcceptedRows` wrote profiles with a plain upsert:

```ts
.upsert({ ...row, status: "invited" }, { onConflict: "institutional_email" })
```

`status: "invited"` is correct for somebody new. On conflict it was also written
over **everybody already on the roster**, flipping active students back to
`invited`.

That matters because the endpoints serving a live class require an active
profile — `loadProfileForToken` in `course-pulse` filters `status = 'active'`
and otherwise throws "No active course profile is linked to this account."

So re-importing a roster mid-semester — a completely normal thing to do in the
first weeks, as students add and drop — cut off every student who was already
signed in. It self-heals, but only on the student's *next app boot*, because
`course-auth-context`'s `loadOrClaimProfile` promotes `invited` → `active`. The
live screen polls `course-pulse` and never re-calls the auth context, so during
a class each student would have had to reload before they could answer anything.

Nothing errored on the professor's side. The import would report full success.

**The fix:** status is set on INSERT only. Existing profiles get their name and
student id refreshed and nothing else — never their status, never their auth
link.

**Rule:** an upsert's payload is written on the update path too. Any column that
means "this is a new record" (`status`, `created_by`, `invited_at`) must not be
in a blind upsert payload. Split it: insert the new ones, update the existing
ones with only the fields you actually intend to refresh.

---

## 14. Seeded test data hides whole missing features

**Found 2026-07-28, and it had been true since the v2 app began.**

The SPA could not release content. The Content screen listed **generation jobs**
only, so the professor's own 23 decks — sitting in `content_items` since Phase 2
— were never displayed. And nothing in the SPA called
`course-release-management` at all, so no release could move from `draft` to
`released`.

That meant "run a complete class without touching the old apps" was false, and
the AI pipeline dead-ended: approving a generated lecture creates a *draft*
release, and the app had no way to publish it.

Every test missed it for one reason: **Week 1 Lecture 1 was already released**,
seeded outside the app. Every student test walked a path where the content was
visible, so the missing capability was never exercised. It surfaced only when
the professor asked a question about something else — where his other lectures
were.

**Rule:** ask what your fixture data is *pre-satisfying*. If every test starts
from a state some feature was supposed to produce, that feature is untested and
may not exist. Walk the lifecycle from empty at least once: no release, no
roster, no session — not just the happy state someone seeded months ago.

Related: pitfall #1 is the same disease at the routing layer (a feature nobody
can reach) and #5 at the state layer (a control that disappears).

---

## 15. Exposing a state machine is not the same as designing a screen

**Reported by the professor on 2026-07-28, the day after the screen shipped.**

The first *Your lectures* screen put the release state machine on the page
almost unchanged: "Release to students", "Open it during class", "Switch to
review only", "Close it", plus a mandatory class-session picker on every item.
Each button was a legal transition. The screen was still unusable:

- *"I don't get exactly how this works … I click on week 11, it says give it to
  the class, then it just has one class, Class 1."* The picker was mandatory but
  the course has exactly one class session, so 22 of 23 lectures could only be
  tied to a day they have nothing to do with.
- *"Some things I sometimes see switch to review only, close it. One is closed.
  I don't know how to open it."* Different items sat in different states, so
  every card offered a different set of verbs.

Two root causes, and only one of them was the state machine:

1. **The graph was one-way** (pitfall #16 below) so `closed` was a dead end.
2. **The screen asked the database's question, not the professor's.** He has one
   question — *can my students open this?* — and `course-auth-context` already
   answers it: `released | live | paused | review_only | scheduled` are visible,
   `draft | closed | archived` are not. Five states collapse to one boolean.

The rewrite shows a badge (**Students can open it** / **Not available**) and one
primary button (**Make it available** / **Take it back**). Tying to a class day
became secondary, optional, and self-explaining.

**Rule:** count the states your user has to distinguish, not the states the
schema has. If a screen's buttons change per row because the rows are in
different internal states, the abstraction has leaked. Design rule #2 in
`03-design-system.md` says no state-machine vocabulary in the default UI —
"Switch to review only" broke it, and shipped.

---

## 16. Every state machine needs a way back

Falls straight out of #15, but is worth stating alone because it is easy to
check and easy to get wrong.

`course-release-management`'s `allowedTransitions` allowed
`released → live`, `review_only → archived`, `closed → review_only | archived`
— and nothing back to `released`. Closing a lecture was effectively permanent.
It looked complete because every state had *an* outgoing edge.

**Rule:** for every state a user can reach by accident, check there is a path
back to normal. "Has outgoing transitions" is not the same as "is recoverable".
Terminal states should be rare, deliberate and named as such — here only
`archived` is.

---

## 17. An optional-looking parameter the backend conditionally requires

**Shipped broken and reported the same day, 2026-07-28.**

`course-release-management`'s `update_state` takes a `reason`. It is optional
for almost every transition — and mandatory for exactly one:

```ts
if (currentState === "closed" && !input.reason) {
  throw new Error("A reason is required when reopening a closed release.");
}
```

The client typed it `reason?: string` and never sent one. The result was a
screen that worked in one direction only:

- **Take it back** (`released → closed`) — no reason needed. Worked.
- **Make it available** (`closed → released`) — threw every single time.

So the professor could hide content and never get it back, which is the same
symptom as pitfall #16 and had already been "fixed" once at the transition-graph
level. The graph was fine. A second, invisible guard sat behind it.

**Rule:** grep the whole handler for `throw` before wiring a call, not just the
part that looks like validation. A conditional requirement reads as optional in
every signature, every interface and every type check. This is pitfall #3's
family — the contract that TypeScript cannot see — but about *requiredness*
rather than field names.

### And why it looked like nothing happened at all

The error was caught and rendered — at the top of a list of 23 lectures, far
from the button that caused it. From the professor's side: *"I click on make it
available, nothing actually happens."* A hard failure was indistinguishable from
a no-op.

**Rule:** an error belongs next to the control that produced it. Errors are now
keyed by item id and render inside the card. A single page-level error line is
only honest on a page with a single action.

---

## 18. A migration widened a constraint; the edge function's copy of it did not

**Broken since Phase 2, surfaced 2026-07-28.**

Migration 0012 moved the decks into the private bucket and widened the
constraint:

```sql
check (source_kind in ('static_path', 'supabase_record', 'external_url', 'storage_object'))
```

`course-content-library` keeps its own copy of that list for validation, and it
was never updated:

```ts
const sourceKinds = ["static_path", "supabase_record", "external_url"];
```

Every real lecture in the course is a `storage_object`, so `save_content_item`
rejected **all 23** with "A valid source kind is required." It sat broken for
months because the v2 app had no caller for that function until this month.

**Rule:** an enum written in both SQL and TypeScript is two copies of one fact.
When a migration touches a `check (... in (...))`, grep the functions for the
same literals in the same request. `grep -rn "source_kind\|content_type" supabase/functions/`
costs nothing.

### The bigger fix was to stop calling it

Creating a release went through `save_content_item`, which **rewrites the whole
content item** as a side effect. So "make this lecture available" revalidated
every field of the item, and would blank any field the caller forgot to echo
back. `course-release-management` now has `create_release`, which makes a draft
release and touches nothing else.

**Rule:** if adding a child row requires a full rewrite of the parent, that is
the wrong endpoint. Look for — or add — one that owns the thing you are
actually changing.

---

## 19. A date-only column parses as UTC midnight

`planned_date` and friends come back as `YYYY-MM-DD`. `new Date("2026-08-04")`
is parsed as **UTC midnight**, so anywhere west of Greenwich — Monterrey
included — it renders as the 3rd.

A class day created for Aug 4 showed as `8/3/2026` on Home. Both Home and
Gradebook did this; the bug was old and invisible because nobody had created a
session in a while.

**Rule:** never `new Date(value)` on a date-only string. Use `formatDay()` in
`src/i18n/index.ts`, which pins to local noon — safely inside the intended day
for every timezone on earth.

---

## 20. "Removed" that the UI reads off the wrong status

`remove_person` deactivates the **membership** and deliberately leaves
`profiles.status` alone, so the person keeps their account and their work.

The People roster rendered `profile_status ?? membership_status`. Since
`profile_status` is still `invited` or `active`, it always won — so a removed
person's row was **identical** to before: same group, same badge, same live
Remove button. The call succeeded, the toast appeared, nothing looked different.

**Rule:** when two status columns describe different things, name which question
the screen is asking. This column asks "are they on this course", which is
membership, not profile. A `??` chain between two unrelated fields is a bug
waiting for one of them to be non-null.

Same family as #12 and #17: the failure is silent and looks like a no-op.

---

## 21. Verify against the bundle that is actually loaded

While confirming a fix, the page kept showing old behaviour after a deploy that
had definitely landed. The cause was mundane: an in-page `location.href = …`
navigation was served from cache, so the tab was still running the previous
bundle.

Ten minutes went into re-reading correct code.

**Rule:** when a fix "doesn't work" after deploying, check what is loaded before
you check what you wrote:

```js
[...document.querySelectorAll('script[src]')].map(s => s.src.split('/').pop())
```

Compare it to the hash `vite build` printed. A cache-busting query string forces
a real fetch. The runbook already says to confirm the deploy hash *before*
testing; this is the same rule one layer in.

---

## 22. Supabase CLI and the SQL editor have different permissions here

`npx supabase db push` and `npx supabase functions deploy` work. Retrieving the
service-role key and running arbitrary `INSERT`s through the dashboard SQL
editor may be blocked by tooling policy. Prefer the app's own endpoints, or
`npx supabase storage cp`, over hand-writing rows.

---

## 23. A successful write can be a product no-op

**Reported by the professor on 2026-07-29.**

Content showed **Week 1 Quiz: Security Foundations** with the same availability
control as a lecture. Making it available succeeded: a release row moved to a
student-visible state.

Both student screens then deliberately filtered the item:

```ts
r.content_type === "activity" && r.source_kind === "supabase_record"
```

That filter was individually reasonable—the activity has no standalone viewer
and otherwise becomes a dead `#` link. Together, the two screens formed a
contradiction: the instructor was promised "Students can open it" while every
student consumer was designed never to show it.

The same leaked abstraction made reflection confusing. Reflection belongs to a
class session after its live quiz closes; it does not belong to a released quiz
card.

**Rule:** before exposing a create, publish, release, or availability action,
trace the result through every intended consumer. A successful database
transition is not evidence of a usable feature. If the consumer has to filter
the result out, the producer must not offer the action.

This is pitfall #14 from the opposite direction: #14 had a consumer whose
producer did not exist; this had a producer whose consumer intentionally did
not exist.

---

## 24. Sessions and content releases answer different questions

The student Today and Live screens locate a class session by searching content
release rows for `class_session_id` and `session_state`. This couples "is class
happening?" to "was some content released for it?"

It already caused the original missing Join class failure when the wrong
release state was checked. It remains fragile even after that fix: a valid
scheduled class with no associated release has no independent student
representation.

**Rule:** return student sessions and content releases as separate collections.
Sessions drive Today, QR joining and `/live`; releases drive Review and the
gated viewer. Never require a content row to discover a live class.

---

## 25. Availability is a delivery promise, not a database state

**Found 2026-07-29 while beginning the coherent class-lifecycle redesign.**

A release can be student-visible in the database even though its content type
has no route a student can open. Activities and question banks are live-only:
they are inputs to the live class, not self-study cards. A release control that
does not account for that distinction creates a successful write followed by a
product no-op.

**Rule:** classify content by its actual student delivery before exposing it in
an instructor availability control or a student material list. Only viewer and
external delivery may enter Review; live-only content belongs to the live class,
and internal content is never shown to students.

---

## 26. A lecture picker is not authorization

A class-day form may offer only lectures from the current course, but the
browser payload is still caller-controlled. Accepting its `content_item_id`
without checking it would let a crafted request associate another course's item,
or a quiz bank/activity that cannot be presented as the class lecture.

**Rule:** validate associations again at the edge-function boundary. For class
sessions, the selected item must exist, belong to the requested course, and have
`content_type = 'lecture'`. The browser's filtered select is usability; the
edge function is the data-integrity boundary.

---

## 27. Authentication return paths are an open redirect unless allow-listed and consumed

A QR join can begin while the student is signed out, so the app must remember
where to return after authentication. Storing an arbitrary pathname or URL
turns that convenience into an open redirect, and leaving even a safe value in
storage lets an old class hijack a later sign-in.

**Rule:** authentication return storage accepts only
`/join/<4–12 uppercase alphanumeric characters>`. Reject absolute URLs,
protocol-relative URLs, and every non-join app route. Remove the storage key
before interpreting its value, so it is consumed exactly once even when the
stored value is malformed.

Magic-link sign-in is a second completion path: it boots already authenticated
and does not call the code/test sign-in completion helper. The signed-in Join
screen must consume the stored value too. Test both consumption paths whenever
authentication recovery changes.

The QR itself identifies only the class session. Encoding a question or pulse
round would force students to rescan during class and couple joining to content
that expires within seconds.

---

## 28. An outline is not a slide coordinate system

Questions used to be generated from the extracted lecture outline while the
deck was generated in a separate step. That works for a topic-level bank, but
it cannot answer the live-class question that matters: *has this exact material
already appeared on a finalized teaching slide?*

Guessing slide ranges from the outline would create metadata that looks precise
and is impossible to verify. Generating questions before slide numbering also
lets a later deck rewrite move the cited idea beyond its supposed checkpoint.

**Rule:** finalize and sequentially number the teaching slides first, then give
that exact JSON to question generation. Require every question to cite only
slides at or before its checkpoint, validate the range against the cited
numbers, and reject the whole bank before any insert when coverage is wrong.

The database range check is a last line of defence, not the quality gate. It
cannot prove that a cited slide contains the answer or that a bank has 18
questions, a 6/6/6 balance, 3–5 checkpoints and two candidates per checkpoint.
Those invariants live in one shared backend validator used by every generated
insert path.

---

## 29. Inserting a checkpoint creates two slide coordinate systems

A generated lecture now has **teaching slides** and **physical presentation
slides**. If a checkpoint is inserted after teaching slide 15, it becomes the
next physical slide in the deck, but it must not turn the former teaching slide
16 into teaching slide 17. Question citations and checkpoint coverage were
validated against the finalized teaching slides before assembly; renumbering
them afterwards would silently invalidate that contract.

The browser still needs the physical position for its counter and navigation,
while Run Class needs the stable teaching position to decide what material has
been covered.

**Rule:** never derive teaching position from a generated deck section's DOM
index. Give every teaching section its original `data-teaching-slide`, leave
checkpoint sections without one, and send both physical `slide` and nullable
`teaching_slide` over the bridge. Insert checkpoints by matching
`after_slide`, not by splicing array offsets.

`segment_key` identifies a concept, but it is not guaranteed to identify one
physical checkpoint: the same concept label may legally appear at more than one
`after_slide`. A deck key must therefore be derived from the segment and its
position when the segment repeats. Rejecting that shape only during assembly is
too late—the validated questions have already been cached, so every retry would
reuse the same unassemblable data.

The same bridge also has two identity boundaries: origin and window. Checking
only `event.origin` lets any same-origin frame impersonate the deck. The parent
must additionally require `event.source === iframe.contentWindow`; the deck
must require `event.source === parent`. Validate the version and exact plain-data
shape before reading message fields so accessors or extra executable values are
never invoked.

`Object.keys` is not an exact-shape check: it omits non-enumerable own
properties, including a hidden executable or unknown value. Enumerate every own
key with `Reflect.ownKeys`, reject symbols, and inspect every property descriptor
before reading values. Require enumerable data descriptors and then compare all
own string names with the protocol's exact key set.

The editable deck engine lives in the backend repository, so its frontend
contract verifier has a second failure mode: a missing sibling checkout can
look like "nothing to inspect." Missing source is a verifier failure, never a
skip. CI must explicitly check out the backend and pass
`COURSE_PLATFORM_BACKEND_ROOT`; keep backend-owned workflow enforcement too so
neither repository can silently drift.

Keyboard intent belongs in the same protocol. A key event focused inside the
iframe does not bubble to the parent window. Checkpoint Space therefore emits a
generic `deck.checkpoint_action`; it must not claim `send` or `reveal`, because
only the parent owns the current live-round state and may decide which action is
valid.

---

## 30. A legacy deck rewrite can destroy the only working copy

Checkpoint preparation has to modify two systems: question metadata in Postgres
and the lecture HTML at its existing private Storage path. Replacing the HTML
before Claude output and the whole 18-question mapping are validated would turn
one bad model response, malformed source range, or database failure into a
broken class deck.

**Rule:** finish every read and every fallible pure step first: authorize the
instructor; require a private `storage_object` lecture and one active bank;
download and extract the ordered teaching slides; load all unchanged questions
and options; make the single metadata-only model call; validate exact question
ids, 6/6/6 balance, 3–5 checkpoints, source ranges and two candidates per
checkpoint; then build and re-read the transformed HTML. Only after all of that
may one transaction update all five metadata columns for all 18 questions and
mark the bank `pending_upload`. Never loop through 18 independent updates: row
10 can fail after rows 1–9 have committed, leaving metadata that is neither
legacy nor usable. The transaction must not touch prompts, options, or question
lifecycle status. Upload to the same private path only after that durable
pending boundary.

Legacy decks carry lecture-specific inline CSS and JavaScript in addition to the
old shared engine. Do not rebuild the slide bodies and do not replace every
`<style>` or `<script>` tag. Identify only the old shared assets, reuse
`DECK_STYLE` and `DECK_SCRIPT`, and preserve the custom blocks. Use callback
replacements for HTML transformations: replacement strings interpret `$&`,
`$1`, ``$` `` and `$'`, so an innocent asset literal can silently corrupt a
deck. Re-extract the result and require the same teaching-slide count, text and
order before any write.

`<section\b...>.*?</section>` is not a structural slide parser. A nested
`<section>` inside teaching content makes that expression stop at the inner
closing tag, after which injection can splice the rest of the teaching slide in
the wrong place. Scan balanced section tags and fail closed when a teaching
slide participates in nesting. The fidelity check must use those structural
boundaries too, not the same blind regex as the transformer.

A balanced section stack is still unsafe if tag discovery uses `[^>]*`: `>` is
valid inside a quoted attribute value, and stopping there splices
`data-teaching-slide` into the attribute. Find a tag's closing `>` only while
outside single/double quotes; fail closed on unterminated quotes; and ignore
section-looking text inside comments and raw script/style content. Text equality
alone can agree with the same broken tokenizer, so also compare each teaching
section's exact original markup after normalizing only the deliberately added
`data-teaching-slide` attribute.

Legacy navigation is not consistently absolute. Historical decks contain bare
relative, `../` parent-relative, root-relative, and absolute Home, Mission,
Quiz, and Exit links, with query strings and fragments. Match normalized path
suffixes only on `ui-btn` anchors and keep a fixture matrix for every form;
otherwise a cleanup can report success while leaving the exact link students
click.

Postgres and Storage do not share a transaction. The required Storage-last
ordering protects the existing deck from authentication, model, validation and
database failures, but upload or final-readiness failures must leave a durable
`pending_upload`, not an ambiguous partial bank. Content exposes Resume/Retry
only for that state. The retry reads the persisted full-bank metadata,
idempotently removes/recreates checkpoint sections in the current deck, uploads
again, and marks `ready`—it never calls the model again. Treat `ready`, not the
earlier metadata update, as the completion boundary; pilot one lecture, preview
it through `/content?t=…`, and never batch the remaining decks blindly.

---

## 31. Private instructor viewing and live question identity are separate gates

An instructor needs to preview and present the session's selected lecture even
when students have no release. Reusing the student `request_url` path makes a
release an accidental prerequisite; creating a release as a workaround changes
student access merely because the professor opened Run Class.

**Rule:** instructor deck access starts from `content_item_id`, loads that item
first, derives its course from the stored row, requires an active teaching role
in that course, requires a private `storage_object`, and mints the existing
short-lived content token. It never reads or writes `content_releases`.
Presentation still goes through same-origin `/content?t=…`; instructor status
does not make `srcdoc`, `blob:`, public Storage, or popup permissions safe.

A `question_id` is not enough authorization for a live pulse. Without a
server-side join through the question bank, a stale or modified browser can send
a valid question from a later checkpoint or a different lecture while still
receiving a perfectly valid snapshotted round.

**Rule:** when a checkpoint pulse is pushed, the server reloads the active
question, its active bank, and the class session. Require the session state to
be exactly `live`, require `session.content_item_id` to equal
`bank.content_item_id`, and require the stored `checkpoint_after_slide` to equal
the requested checkpoint before closing another round or inserting anything.
Snapshot prompt and options only after those checks; never accept a
client-authored snapshot for the checkpoint path.

Deck keyboard events are presentation intent, not server authority. Space may
mean Send only while the parent is `ready`, and Reveal only while it is `open`.
Right Arrow can emit both checkpoint-skipped and slide-changed while resuming;
the parent must transition its panel state before the follow-up event so it does
not close or resume twice. Keep exact state-transition and protocol-mismatch
tests for both paths.

---

## 32. A short-lived deck token must refresh without resetting the lecture

Replacing an iframe token with a fresh `/content?t=…` URL reloads the deck.
Without carrying forward the last `deck.slide_changed` value as a hash, a
refresh silently returns a professor to slide 1 in the middle of class. Clearing
the iframe when token minting briefly fails is worse: a transient network error
blanks the projector even though the existing document still works.

**Rule:** mint the replacement token, append the last known slide hash, then
swap the iframe source. Reset the parent bridge for that deliberate navigation.
If refresh fails, keep the existing source visible, show a bilingual warning,
and retry. Only the initial load may render the unavailable fallback.

---

## 33. Pulse transitions must be conditional and reload-recoverable

A reveal response can arrive after Right Arrow has already closed the round.
An unconditional update then changes `closed → revealed`, resurrecting a
question students should have left. Likewise, keeping the active round only in
component state makes a browser reload forget a question still open on every
student phone.

**Rule:** reveal updates only `open`; close updates only `open | revealed`;
same-target retries are idempotent; stale transitions fail without changing
state. Run Class recovers the current round from the server, including its
segment and checkpoint slide. Ending a session also closes all visible pulses
server-side, so a client failure cannot strand the class lifecycle.

Keyboard repeat is a separate edge: ignore `keydown.repeat` in the generated
deck. Otherwise one held Space can send and immediately reveal after the parent
state changes between repeated events.

---

## 34. A model's concept label is not checkpoint identity

The first real legacy-bank preparation put multiple questions at the same slide
boundary but supplied a different `segment_key` for each. The mapping was
semantically useful, yet the validator counted 18 one-question checkpoints and
rejected it. A retry produced six valid shared boundaries—still one above the
product's 3–5 range.

**Rule:** checkpoint identity is the authored slide boundary. Before validating,
give every question at one boundary the same canonical key. If a model returns
more than five boundaries, merge the closest adjacent boundary into the later
one; that preserves the rule that every cited source slide has already been
taught. Keep the 3–5 and minimum-candidate validators after normalization.

---

## 35. Supabase extension functions are not in a `public`-only search path

The atomic class starter used `gen_random_bytes` while declaring
`set search_path = public`. Supabase installs pgcrypto in `extensions`, so the
function failed at runtime with “function gen_random_bytes(integer) does not
exist” even though the migration applied cleanly.

**Rule:** a `security definer` function should keep a restricted trusted search
path, but it must include every trusted schema it intentionally uses. For
pgcrypto here that is `public, extensions` (migration 0023). Exercise each new
RPC through its real edge-function caller after applying it.

---

## 36. Destructive confirmations should be in-app state, not `window.confirm`

Native dialogs block browser automation and offer poor styling, translation,
and consequence layout. The full production rehearsal reached the end of class
but could not reliably accept the native dialog through browser control.

**Rule:** first click changes the action to an explicit bilingual confirmation
button and renders the consequences beside it; the second click performs the
write. This is easier to test, clearer on projector and phone screens, and does
not depend on browser-owned modal behavior.

---

## 37. Private student notes need both the class and the profile scope

A profile-wide history is useful in People, but it is not a per-class record.
Showing it unfiltered in Gradebook silently mixes notes from other class days;
using a session-only list makes it easy to write against the wrong student.

**Rule:** a Gradebook note composer always receives the selected
`class_session_id` and `profile_id`; its history loads the session then filters
to that profile. People may load the profile-wide history, but students must
never import or call the private-notes API.

---

## 38. Auth-context sections are the signed-in person's enrollments, not all groups

The first Manage members link passed a correct group UUID, but People resolved
its label and Add person choices from `course-auth-context.sections`. That
collection intentionally contains only the signed-in person's section
enrollments. An instructor who was not enrolled in the target group therefore
saw a raw UUID and an empty group picker.

**Rule:** course administration screens load authoritative groups from
`course-section-management`. Treat auth-context sections only as identity and
access context. Moving a student between groups must also be one transactional
server operation: course-scope the target, preserve old enrollments as dropped,
reactivate the target and course membership, and audit the before/target IDs.
Because roster responses retain dropped history and can include enrollments
from other courses, a current member must match the exact group with
`role = student` and `status = active`; current-group detection must also
require the enrollment's section ID to be in the authoritative group set.
