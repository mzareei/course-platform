# UX/UI Improvement Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the professor-approved 2026-08-13 UX batch: instant answer feedback, quiz error recovery, honest quiz-resume state, reflection draft autosave, live-question countdown parity, button loading spinners, the Spanish-error sweep, URL-backed instructor tabs with honest semantics, SPA class entry, focus management on the fullscreen layer, missing list keys, and phone-chrome/sizing polish.

**Architecture:** Frontend-only changes to the Vite + Preact SPA (`course-platform`). No backend function changes, no migrations. One stylesheet (`src/styles/app.css`), one strings file (`src/i18n/strings.ts`), verifier scripts in `tools/` are the executable test layer. Every task ends green on `npm run typecheck && npm run verify && npm run build`.

**Tech Stack:** Preact 10, preact-iso router (`useLocation()` → `{ path, query, route }`), @preact/signals, plain CSS custom properties.

## Global Constraints

Copied from `docs/03-design-system.md`, `CLAUDE.md`, and recorded decisions — every task implicitly includes these:

- **Every user-facing string is an EN+ES pair** in `src/i18n/strings.ts` as `"key": ["English", "Español"]`. `tools/verify-i18n.mjs` fails the build otherwise.
- **Never hardcode a colour** — tokens only; every change must work in both themes.
- **One styling mechanism**: add CSS to `src/styles/app.css` only.
- **No state-machine vocabulary in UI copy** ("Open now", never `review_only`).
- **Tap targets ≥ 44px.**
- **Do not touch** (recorded professor decisions): quiz integrity telemetry, the unlinked projector route, Reset-the-course placement on Classes, pause-button styling (a verifier pins it).
- **`.action-dock` and `final_quiz_question_count` are pinned by verifiers** (`verify-app-shell.mjs:109`, `verify-class-question-plans.mjs:39`) — do not remove them in this batch.
- Per-task gate: `npm run typecheck && npm run verify && npm run build` all pass before the task's commit.
- Branch: all work on `ux/2026-08-13-improvement-batch` cut from `main`. Merge + push (deploy) only in the final task.
- Relevant pitfalls read for this plan: #1 (test real entry points), #4 (no inline component definitions), #5 (reload recovery must distinguish active from finished — Task 3 exists because of this), #8/#33 (pulse rounds time out; Live is poll-driven), #46 (fullscreen promotes the iframe/element document).

## File Structure

| File | Role in this batch |
|---|---|
| `src/styles/app.css` | `.btn.loading` spinner, lang-toggle/bottom-nav sizing, `.pill.hidden` contrast |
| `src/features/auth/PinForm.tsx`, `src/screens/SignIn.tsx` | loading class on submit buttons |
| `src/screens/student/Live.tsx` | optimistic answer, countdown parity, revealed-option key |
| `src/features/quiz/Player.tsx` | resume state, retry, option keys, focus on advance, loading class |
| `src/features/reflection/Reflection.tsx` | draft autosave, loading class |
| `src/screens/student/JoinClass.tsx` | SPA navigation into `/live` |
| `src/screens/student/Grades.tsx` | refetch-not-reload retry, row keys |
| `src/screens/student/Review.tsx` | list keys |
| `src/i18n/strings.ts` | new pairs (each task lists its own) |
| `src/screens/instructor/Content.tsx`, `Gradebook.tsx`, `src/components/ContentLibrary.tsx` | URL tabs, honest semantics, apiErrorText |
| `src/screens/instructor/ClassRecord.tsx`, `src/components/StudentNoteHistory.tsx` | apiErrorText |
| `src/features/live/ClassroomQuestionLayer.tsx` | focus management |
| `src/components/ThemeToggle.tsx`, `index.html` | theme-color meta |
| `tools/verify-i18n.mjs` | scan `src/features` too |

---

### Task 1: Branch + shared button loading treatment

**Files:**
- Modify: `src/styles/app.css` (after the `.btn:disabled` rule, app.css:261)
- Modify: `src/features/auth/PinForm.tsx:108-114`
- Modify: `src/features/quiz/Player.tsx:165-167`
- Modify: `src/features/reflection/Reflection.tsx:62-64`
- Modify: `src/screens/SignIn.tsx` (the email-OTP submit buttons — find with `grep -n "btn primary" src/screens/SignIn.tsx`)

**Interfaces:**
- Produces: CSS classes `.btn.loading` / `.btn .btn-spinner` used by later tasks. Convention: a busy async button gets `class="btn primary loading"`, `disabled`, `aria-busy="true"`, and keeps its existing busy text label.

- [ ] **Step 1: Create the branch**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
git checkout main && git pull && git checkout -b ux/2026-08-13-improvement-batch
```

- [ ] **Step 2: Add the spinner CSS**

In `src/styles/app.css`, directly after `.btn:disabled { opacity: 0.5; cursor: not-allowed; }` (line 261), add:

```css
/* A button mid-request: keep the busy text, add a small ring. The global
   prefers-reduced-motion kill switch freezes the rotation, which is fine —
   a static ring still reads as "working". */
.btn.loading {
  position: relative;
  pointer-events: none;
}
.btn.loading::after {
  content: "";
  display: inline-block;
  width: 0.85em;
  height: 0.85em;
  margin-left: 0.5em;
  vertical-align: -0.1em;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: btn-spin 0.7s linear infinite;
}
@keyframes btn-spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 3: Wire it into the four student-flow buttons**

Pattern (identical at each site) — PinForm example, currently:

```tsx
<button class="btn primary" type="submit" disabled={busy || !ready}>
```

becomes:

```tsx
<button class={`btn primary${busy ? " loading" : ""}`} type="submit" disabled={busy || !ready} aria-busy={busy}>
```

Apply the same `${busy ? " loading" : ""}` + `aria-busy={busy}` change to:
- `PinForm.tsx` submit button (~line 108)
- `Player.tsx` submit button (line 165 — the last-question submit; the Next button stays plain, it isn't async)
- `Reflection.tsx` submit button (line 62)
- `SignIn.tsx` — every button whose label already swaps on a busy flag (the send-code and verify-code buttons)

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass (26+ verifiers green).

- [ ] **Step 5: Commit**

```bash
git add src/styles/app.css src/features/auth/PinForm.tsx src/features/quiz/Player.tsx src/features/reflection/Reflection.tsx src/screens/SignIn.tsx
git commit -m "Async buttons show a spinner while working"
```

---

### Task 2: Live question — optimistic answer + countdown parity

**Files:**
- Modify: `src/screens/student/Live.tsx:128-144` (submit), `:200-253` (render)
- Modify: `src/i18n/strings.ts` (one new pair)

**Interfaces:**
- Consumes: nothing new.
- Produces: no exports change. New local state `pendingKey: string | null`.

**Behaviour being fixed:** tapping an answer changes nothing until `answerPulse` + a full `refresh()` round-trip; the countdown pill vanishes once you answer and only turns `warn` at 0.

- [ ] **Step 1: Add pending state and optimistic submit**

In `Live.tsx`, next to `const [busy, setBusy] = useState(false);` add:

```tsx
const [pendingKey, setPendingKey] = useState<string | null>(null);
```

Rewrite `submit` (lines 128-144) as:

```tsx
async function submit(optionKey: string) {
  if (!round) return;
  setBusy(true);
  setPendingKey(optionKey); // paint the choice immediately; the server confirms behind it
  setError(null);
  try {
    await answerPulse({
      round_id: round.round_id,
      option_key: optionKey,
      latency_ms: Date.now() - shownAt.current
    });
    await refresh();
  } catch (e) {
    setPendingKey(null); // the tap did not land — put the choices back
    setError(apiErrorText(e, "live.answerFailed"));
  } finally {
    setBusy(false);
  }
}
```

Also clear a stale pending mark when a new round arrives — inside `refresh()`'s `setView` callback, the existing branch that resets `shownAt` gains one line:

```tsx
if (next.round && next.round.round_id !== prev?.round?.round_id) {
  shownAt.current = Date.now(); // start the latency clock for this question
  setPendingKey(null);
}
```

- [ ] **Step 2: Render the tapped choice as selected instantly**

In the unanswered branch (lines 238-252), the option button gains the `selected` class while pending:

```tsx
{displayOptions.map((option) => (
  <button
    key={option.key}
    class={`pulse-choice tappable${pendingKey === option.key ? " selected" : ""}`}
    type="button"
    disabled={busy || remaining <= 0}
    onClick={() => submit(option.key)}
  >
    {(useSpanish && option.text_es) || option.text}
  </button>
))}
```

(`.pulse-choice.selected` already exists in app.css — no CSS change.)

- [ ] **Step 3: Countdown parity with the quiz**

Replace the pill block (lines 202-206):

```tsx
{round.state === "open" && !mine ? (
  <span class={`pill ${remaining > 0 ? "live" : "warn"}`}>
    {remaining > 0 ? t("run.timeLeft", { seconds: remaining }) : t("live.timeUp")}
  </span>
) : null}
```

with — visible whether or not the student has answered, warning at ≤5s like the quiz (`Player.tsx:137`):

```tsx
{round.state === "open" ? (
  <span class={`pill ${remaining > 5 ? "live" : "warn"}`}>
    {remaining > 0
      ? mine
        ? t("live.revealIn", { seconds: remaining })
        : t("run.timeLeft", { seconds: remaining })
      : t("live.timeUp")}
  </span>
) : null}
```

- [ ] **Step 4: Add the new string pair**

In `src/i18n/strings.ts`, next to the other `live.*` keys:

```ts
"live.revealIn": ["Answer locks in {seconds}s", "La respuesta se cierra en {seconds}s"],
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass. `verify-i18n` confirms the new pair.

- [ ] **Step 6: Commit**

```bash
git add src/screens/student/Live.tsx src/i18n/strings.ts
git commit -m "Answer taps paint instantly and the countdown survives answering"
```

---

### Task 3: Quiz resume shows the real result, never a false 0%

**Files:**
- Modify: `src/api/quiz.ts:23-30` (QuizAttempt interface)
- Modify: `src/features/quiz/Player.tsx:38-50, 115-123`
- Modify: `src/i18n/strings.ts` (two new pairs)

**Interfaces:**
- Consumes: backend `course-activity-attempt` `start_attempt` — **verified against the deployed function source** (`mzareei.github.io/supabase/functions/course-activity-attempt/index.ts:499,519`): a resumed attempt row includes `score_raw`, `score_percent`, `score_final` (numbers after grading, else null). It does **not** include `total` or reliably `speed_bonus`.
- Produces: `QuizAttempt` gains optional score fields; a new render state `resumed: { percent: number | null }`.

**Pitfall #5 note:** this is exactly the "recovery must distinguish active from finished" trap — the current code recovers a finished attempt into the active-result branch with fabricated zeros.

- [ ] **Step 1: Declare the fields the backend already returns**

In `src/api/quiz.ts`, extend `QuizAttempt`:

```ts
export interface QuizAttempt {
  id: string;
  activity_instance_id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  attempt_number: number;
  // Present on a resumed attempt (course-activity-attempt selects them);
  // null until grading has run.
  score_raw?: number | null;
  score_percent?: number | null;
  score_final?: number | null;
}
```

- [ ] **Step 2: Replace the fabricated zero result**

In `Player.tsx`, add state next to `result`:

```tsx
const [resumed, setResumed] = useState<{ percent: number | null } | null>(null);
```

Change the resume branch (lines 43-45) from `setResult({ raw: 0, ... })` to:

```tsx
if (res.attempt.submitted_at) {
  // Resuming after already submitting: show the real graded score if the
  // server sent one, and never a fabricated 0%.
  setResumed({ percent: typeof res.attempt.score_percent === "number" ? res.attempt.score_percent : null });
}
```

- [ ] **Step 3: Render the resumed state**

Directly above the existing `if (result)` block (line 115), add:

```tsx
if (resumed) {
  return (
    <div class="stack">
      <p class="eyebrow">{t("quiz.done")}</p>
      {resumed.percent !== null ? <span class="big-number">{resumed.percent}%</span> : null}
      <p class="hint">{resumed.percent !== null ? t("quiz.doneBody") : t("quiz.resumedNoScore")}</p>
    </div>
  );
}
```

Also guard the auto-advance effect: in the effect at lines 105-110, extend the bail-out to include `resumed` (mirror it into `stateRef` the same way `result` is, adding `resumed` to the ref object at lines 35-36).

- [ ] **Step 4: Add the string pair**

```ts
"quiz.resumedNoScore": [
  "Your quiz was submitted. Your professor has your score.",
  "Tu examen fue enviado. Tu profesor tiene tu calificación."
],
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/quiz.ts src/features/quiz/Player.tsx src/i18n/strings.ts
git commit -m "A reloaded quiz shows its real score, not a fabricated 0%"
```

---

### Task 4: Quiz load failure gets retry + a way back

**Files:**
- Modify: `src/features/quiz/Player.tsx:38-63, 112`

**Interfaces:**
- Consumes: `t("app.tryAgain")` (exists, strings.ts:14), `t("live.backToToday")` (exists).
- Produces: internal `start()` function; a `loadAttempt` counter re-runs it.

- [ ] **Step 1: Make the start call re-runnable**

The start logic currently lives inline in the mount effect (lines 38-50). Add a retry counter and fold the call into the effect keyed on it:

```tsx
const [loadAttempt, setLoadAttempt] = useState(0);
```

```tsx
useEffect(() => {
  setError(null);
  startQuizAttempt(activityInstanceId)
    .then((res) => {
      setAttemptId(res.attempt.id);
      setQuestions(res.questions);
      if (res.attempt.submitted_at) {
        setResumed({ percent: typeof res.attempt.score_percent === "number" ? res.attempt.score_percent : null });
      } else if (res.questions.length) {
        setQuestionDeadline(Date.now() + secondsFor(res.questions[0]) * 1000);
      }
    })
    .catch((e) => setError(apiErrorText(e, "quiz.startFailed")));
}, [activityInstanceId, loadAttempt]);
```

Keep the integrity listeners in their own mount effect (they must not re-subscribe per retry) — split the current combined effect in two, moving the `onBlur`/`onPaste`/`onCopy` wiring into `useEffect(() => { ... }, [])`.

- [ ] **Step 2: Replace the dead-end error line**

`if (error) return <p class="error-text" role="alert">{error}</p>;` (line 112) — only the **pre-load** failure is a dead end (a submit failure already renders inside the question view, so scope this to `!questions`). Change the guard order:

```tsx
if (error && !questions) {
  return (
    <div class="stack">
      <p class="error-text" role="alert">{error}</p>
      <div class="row">
        <button class="btn primary" type="button" onClick={() => setLoadAttempt((n) => n + 1)}>
          {t("app.tryAgain")}
        </button>
        <a class="btn quiet" href="/">{t("live.backToToday")}</a>
      </div>
    </div>
  );
}
if (error) return <p class="error-text" role="alert">{error}</p>;
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/quiz/Player.tsx
git commit -m "A quiz that fails to load offers Try again instead of a dead end"
```

---

### Task 5: Reflection draft autosave

**Files:**
- Modify: `src/features/reflection/Reflection.tsx:22-43`

**Interfaces:**
- Produces: localStorage key convention `cp.reflection.draft.<classSessionId>`.

- [ ] **Step 1: Restore, save, clear**

```tsx
const draftKey = `cp.reflection.draft.${classSessionId}`;
const [text, setText] = useState(() => {
  try { return localStorage.getItem(draftKey) || ""; } catch { return ""; }
});
```

In the textarea `onInput`, persist alongside state (a reflection is ≤100 words; writing through on every keystroke is fine):

```tsx
onInput={(e) => {
  const value = (e.target as HTMLTextAreaElement).value;
  setText(value);
  try { localStorage.setItem(draftKey, value); } catch { /* draft survives in state only */ }
}}
```

In `onSubmit`, after `await submitReflection(...)` and before `onSubmitted()`:

```tsx
try { localStorage.removeItem(draftKey); } catch { /* nothing to clean */ }
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/features/reflection/Reflection.tsx
git commit -m "The reflection survives a reload — drafts autosave per class"
```

---

### Task 6: Spanish error sweep — every catch renders through apiErrorText

**Files:**
- Modify: `src/screens/student/Live.tsx:94`
- Modify: `src/screens/instructor/Content.tsx:49, 105, 271`
- Modify: `src/screens/instructor/Gradebook.tsx:65-67, 325-328`
- Modify: `src/screens/instructor/ClassRecord.tsx:38-41`
- Modify: `src/components/StudentNoteHistory.tsx` (both `.catch` sites, ~:38 and ~:39-41 region)
- Modify: `src/components/ContentLibrary.tsx:75-92` (`run()`)
- Modify: `src/i18n/strings.ts` (three new pairs)

**Interfaces:**
- Consumes: `apiErrorText(error, fallbackKey)` from `src/i18n` (index.ts:103-115) — already imported in some files; add the import where missing.
- Produces: `ContentLibrary.run()`'s third parameter becomes a `StringKey` (`failureKey`), not a pre-translated string. Check its call sites with `grep -n "run(" src/components/ContentLibrary.tsx` and update any caller passing a third argument to pass the key instead.

- [ ] **Step 1: The mechanical sites**

Each `.catch((e: Error) => setX(e.message ...))` becomes `.catch((e) => setX(apiErrorText(e, KEY)))`:

| Site | Fallback key | New pair? |
|---|---|---|
| `Live.tsx:94` `setError(e instanceof Error ? e.message : null)` | `"live.loadFailed"` | **new** |
| `Content.tsx:49` (listJobs refresh) | `"content.jobsLoadFailed"` | **new** |
| `Content.tsx:105` (cancelJob) | `"content.jobsLoadFailed"` | reuse |
| `Content.tsx:271` (deck preview job) | `"content.jobsLoadFailed"` | reuse |
| `Gradebook.tsx:65-67` (summary) | `"gradebook.loadFailed"` | **new** |
| `Gradebook.tsx:325-328` (per-class) | `"gradebook.perClass.loadFailed"` | exists |
| `ClassRecord.tsx:38-41` | `"classRecord.loadFailed"` | exists |
| `StudentNoteHistory.tsx` roster catch | `"studentNotes.rosterLoadFailed"` | exists |
| `StudentNoteHistory.tsx` notes catch | `"studentNotes.loadFailed"` | exists |

Note on Live.tsx:94: preserve the existing "only show when the screen is empty" guard — `if (!view) setError(apiErrorText(e, "live.loadFailed"));`

- [ ] **Step 2: New string pairs**

```ts
"live.loadFailed": [
  "The class screen could not load. It keeps retrying by itself.",
  "La pantalla de la clase no pudo cargar. Sigue reintentando por sí sola."
],
"content.jobsLoadFailed": [
  "Content could not load. Try again in a moment.",
  "El contenido no pudo cargar. Intenta de nuevo en un momento."
],
"gradebook.loadFailed": [
  "The gradebook could not load. Try again in a moment.",
  "Las calificaciones no pudieron cargar. Intenta de nuevo en un momento."
],
```

- [ ] **Step 3: ContentLibrary.run() takes a key**

```tsx
async function run(itemId: string, work: () => Promise<void>, failureKey: StringKey = "content.library.changeFailed") {
  ...
  : deleteErrorKey !== null
    ? t(deleteErrorKey)
    : apiErrorText(e, failureKey)
```

(The `ContentNotReviewableError` and `deleteErrorKey` branches stay exactly as they are.) Update any caller that passed `t("some.key")` as the third argument to pass `"some.key"`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass. Grep proves the sweep:
`grep -rn "e.message" src/screens src/components src/features | grep -v apiErrorText` — every remaining hit must be a non-UI use (logging), expected: no hits that reach a render.

- [ ] **Step 5: Commit**

```bash
git add src/screens/student/Live.tsx src/screens/instructor/Content.tsx src/screens/instructor/Gradebook.tsx src/screens/instructor/ClassRecord.tsx src/components/StudentNoteHistory.tsx src/components/ContentLibrary.tsx src/i18n/strings.ts
git commit -m "Every caught backend error renders through apiErrorText"
```

---

### Task 7: verify-i18n scans src/features too (TDD)

**Files:**
- Modify: `tools/verify-i18n.mjs:74`
- Modify: whatever it flags (expected: few or none — Player/Reflection/PinForm already use `t()`)
- Test: `tools/verify-i18n.mjs` itself is the test.

- [ ] **Step 1: Extend the scan (the RED step)**

```js
const componentFiles = [...walk("src/screens"), ...walk("src/components"), ...walk("src/features")];
```

- [ ] **Step 2: Run to see what it catches**

Run: `node tools/verify-i18n.mjs`
Expected: either PASS (features were already clean) or a finite list of hardcoded-English findings in `src/features/**`.

- [ ] **Step 3: Fix every finding**

For each flagged literal: move it into `src/i18n/strings.ts` as an EN+ES pair and replace the literal with `t("key")`. No allowlisting — the allowlist in the verifier is for identical-in-both-languages words only.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass — the widened scan is now part of the standing gate.

- [ ] **Step 5: Commit**

```bash
git add tools/verify-i18n.mjs src/i18n/strings.ts src/features
git commit -m "verify-i18n watches src/features, closing the quiz/reflection blind spot"
```

---

### Task 8: Instructor tabs live in the URL, with honest semantics

**Files:**
- Modify: `src/screens/instructor/Content.tsx:45, 118-131`
- Modify: `src/screens/instructor/Gradebook.tsx:62, 367-376`
- Modify: `src/components/ContentLibrary.tsx:174-182`
- Modify: `src/i18n/strings.ts` (one new pair)

**Interfaces:**
- Consumes: `useLocation()` from `preact-iso` (already imported in `app.tsx`; add the import in each screen).
- Produces: URL contract `/teach/content?tab=library|banks|import` and `/teach/grades?tab=matrix|perClass`. Default (no param) = `library` / `matrix`.

**Why links, not ARIA tabs:** these switch what amounts to a sub-page. Real links with `aria-current` are honest and give back/forward + deep links for free; `role="tablist"` on `href="#"` anchors was a fake. The ContentLibrary type filter is a *filter*, not navigation — it becomes buttons with `aria-pressed`.

- [ ] **Step 1: Content.tsx — derive tab from the URL**

Remove `const [tab, setTab] = useState<ContentTab>("library");` (line 45). At the top of the component:

```tsx
const { query, route } = useLocation();
const tab: ContentTab = query.tab === "banks" ? "banks" : query.tab === "import" ? "import" : "library";
```

Replace the tab markup (lines 118-131):

```tsx
<nav class="nav-tabs" aria-label={t("content.tabsLabel")} style="flex: 0 0 auto;">
  <a href="/teach/content" aria-current={tab === "library" ? "page" : undefined}>
    {t("content.tab.library")}
  </a>
  <a href="/teach/content?tab=banks" aria-current={tab === "banks" ? "page" : undefined}>
    {t("content.tab.banks")}
  </a>
  <a href="/teach/content?tab=import" aria-current={tab === "import" ? "page" : undefined}>
    {t("content.tab.import")}
  </a>
</nav>
```

(preact-iso intercepts same-origin anchor clicks — no `onClick` needed.)

- [ ] **Step 2: Gradebook.tsx — same treatment**

Remove `const [tab, setTab] = useState<"matrix" | "perClass">("matrix");` (line 62). Derive:

```tsx
const { query } = useLocation();
const tab: "matrix" | "perClass" = query.tab === "perClass" ? "perClass" : "matrix";
```

Markup (lines 367-376):

```tsx
<nav class="nav-tabs" aria-label={t("gradebook.tabsLabel")} style="flex: 0 0 auto;">
  <a href="/teach/grades" aria-current={tab === "matrix" ? "page" : undefined}>
    {t("gradebook.tab.semester")}
  </a>
  <a href="/teach/grades?tab=perClass" aria-current={tab === "perClass" ? "page" : undefined}>
    {t("gradebook.tab.perClass")}
  </a>
</nav>
```

**Check for `setTab` callers** first: `grep -n "setTab" src/screens/instructor/Content.tsx src/screens/instructor/Gradebook.tsx`. If anything outside the tab bar calls `setTab` (e.g. a "go to per-class" link), replace it with `route("/teach/grades?tab=perClass")`.

- [ ] **Step 3: ContentLibrary filter becomes buttons**

Replace the fake tablist (lines 174-182):

```tsx
<div class="nav-tabs" style="flex: 0 0 auto;">
  {(["all", "available", "hidden"] as Filter[]).map((value) => (
    <button key={value} type="button" class="nav-tab-btn" aria-pressed={filter === value}
       onClick={() => setFilter(value)}>
      {value === "all"
        ? t("content.library.filterAll")
        : value === "available"
          ? t("content.library.filterAvailable")
          : t("content.library.filterHidden")}
    </button>
  ))}
</div>
```

In `app.css`, next to the `.nav-tabs a` rules, make the button share the anchor's look (match the existing `.nav-tabs a` declarations exactly — copy the selector block and extend it):

```css
.nav-tabs a, .nav-tabs .nav-tab-btn { /* existing anchor declarations apply to both */ }
.nav-tab-btn { appearance: none; border: none; background: transparent; font: inherit; cursor: pointer; }
.nav-tabs .nav-tab-btn[aria-pressed="true"] { /* copy the a[aria-current="page"] declarations */ }
```

Concretely: find the `.nav-tabs a` and `.nav-tabs a[aria-current="page"]` rules (near app.css:477) and add the twin selectors `.nav-tabs .nav-tab-btn` / `.nav-tabs .nav-tab-btn[aria-pressed="true"]` to those same rule blocks.

- [ ] **Step 4: New string pairs**

```ts
"content.tabsLabel": ["Content sections", "Secciones de contenido"],
"gradebook.tabsLabel": ["Gradebook views", "Vistas de calificaciones"],
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass. `verify-app-shell.mjs` must stay green — if it pins `role="tablist"` anywhere, read its assertion before changing it (it pins `.action-dock`, per status doc; confirm with `grep -n "tablist" tools/*.mjs`, expected: no hits).

- [ ] **Step 6: Commit**

```bash
git add src/screens/instructor/Content.tsx src/screens/instructor/Gradebook.tsx src/components/ContentLibrary.tsx src/styles/app.css src/i18n/strings.ts
git commit -m "Instructor tabs live in the URL; filter pills stop pretending to be tabs"
```

---

### Task 9: SPA navigation — QR entry and Grades retry stop reloading the app

**Files:**
- Modify: `src/screens/student/JoinClass.tsx:61`
- Modify: `src/screens/student/Grades.tsx` (load effect + retry button, ~:95-104)

**Interfaces:**
- Consumes: `useLocation().route` from `preact-iso`.

- [ ] **Step 1: JoinClass routes instead of reloading**

Add `import { useLocation } from "preact-iso";` and inside the component `const { route } = useLocation();`. Change line 61 from `location.href = "/live";` to:

```tsx
if (!cancelled) route("/live");
```

Safe because `refreshContext()` has already been awaited on the line above — `/live` boots from fresh context, same as after the old reload, minus the full re-download. (Pitfall #1 check happens in the final task's browser pass: this is the real student entry point.)

- [ ] **Step 2: Grades retry refetches instead of reloading**

In `Grades.tsx`, add a retry counter state, key the load effect on it, and change the retry button (currently `onClick={() => location.reload()}` at ~:99) to bump the counter:

```tsx
const [loadAttempt, setLoadAttempt] = useState(0);
// effect: useEffect(() => { ...fetch... }, [loadAttempt]);
<button class="btn" type="button" onClick={() => setLoadAttempt((n) => n + 1)}>{t("app.tryAgain")}</button>
```

Match the existing effect's error/reset handling — set `progress` to null and error to null at the top of the effect so the loading state shows during a retry.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/screens/student/JoinClass.tsx src/screens/student/Grades.tsx
git commit -m "QR entry and Grades retry navigate in-app instead of reloading"
```

---

### Task 10: Focus management — fullscreen layer and quiz advance

**Files:**
- Modify: `src/features/live/ClassroomQuestionLayer.tsx`
- Modify: `src/features/quiz/Player.tsx` (heading focus on advance)

**Interfaces:** none new.

- [ ] **Step 1: The fullscreen layer takes and returns focus**

In `ClassroomQuestionLayer.tsx`: give the section `tabindex={-1}`, keep a ref to the toggle button, and move focus on state change:

```tsx
const toggleRef = useRef<HTMLButtonElement | null>(null);

useEffect(() => {
  if (isFullscreen) layerRef.current?.focus();
  else toggleRef.current?.focus();
}, [isFullscreen]);
```

Guard the initial mount (don't steal focus before the professor has ever toggled): add `const everToggled = useRef(false);` set true in `toggleFullscreen()`, and bail in the effect `if (!everToggled.current) return;`.

On the section: `tabindex={-1}`. On the button: `ref={toggleRef}`.

(Pitfall #46 reminder: this layer is the *parent-page* copy; the deck-engine copy inside the iframe is separate and untouched.)

- [ ] **Step 2: Quiz advance moves focus to the new question**

In `Player.tsx`: ref the question heading and focus it when `index` changes:

```tsx
const questionRef = useRef<HTMLHeadingElement | null>(null);
useEffect(() => {
  if (index > 0) questionRef.current?.focus();
}, [index]);
```

```tsx
<h2 ref={questionRef} tabindex={-1} style="font-size: 1.3rem;">…</h2>
```

`index > 0` keeps first paint from yanking focus; every advance (tap or timeout) announces the new question to a screen reader and scrolls it into view.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/live/ClassroomQuestionLayer.tsx src/features/quiz/Player.tsx
git commit -m "Fullscreen layer and quiz advance manage keyboard focus"
```

---

### Task 11: Missing list keys on polled/student surfaces

**Files:**
- Modify: `src/features/quiz/Player.tsx:147` — `<button key={option.id} …>`
- Modify: `src/screens/student/Live.tsx:224-230` — revealed correct option: `<div key={option.key} class="pulse-choice correct">`
- Modify: `src/screens/student/Review.tsx:50, 53` — key each group by its type label and each release card by `release.id` (read the map calls; use the item's id field, found in the map callback's parameter type)
- Modify: `src/screens/student/Grades.tsx:215` — key the row by its class/item id from the map callback

- [ ] **Step 1: Add the keys** (each is a one-attribute change at the lines above; use the loop variable's stable id, never the array index)

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/features/quiz/Player.tsx src/screens/student/Live.tsx src/screens/student/Review.tsx src/screens/student/Grades.tsx
git commit -m "Stable keys on student list renders, including both polled surfaces"
```

---

### Task 12: Phone chrome + sizing polish

**Files:**
- Modify: `index.html:5-14`
- Modify: `src/components/ThemeToggle.tsx`
- Modify: `src/styles/app.css` (lang-toggle :884, bottom-nav :501-514, pill.hidden :341)

**Interfaces:**
- Produces: `<meta name="theme-color" id="theme-color-light/dark">` contract; helper behaviour in ThemeToggle.

- [ ] **Step 1: theme-color meta**

In `index.html` `<head>`, after the color-scheme meta:

```html
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f4f7fb" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0c131f" />
```

(Values are `--surface` light/dark from app.css:14 and :62.) Extend the no-flash script so a *forced* theme overrides both:

```html
<script>
  // No-flash theme: apply the stored choice before first paint.
  try {
    const t = localStorage.getItem("cp.theme");
    if (t === "dark" || t === "light") {
      document.documentElement.dataset.theme = t;
      const c = t === "dark" ? "#0c131f" : "#f4f7fb";
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
        m.setAttribute("content", c);
        m.removeAttribute("media");
      });
    }
  } catch {}
</script>
```

- [ ] **Step 2: ThemeToggle keeps the meta in sync**

In `toggle()` after `document.documentElement.dataset.theme = next;`:

```tsx
const metaColor = next === "dark" ? "#0c131f" : "#f4f7fb";
document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
  m.setAttribute("content", metaColor);
  m.removeAttribute("media");
});
```

These two hex values are the one sanctioned duplication of `--surface` — CSS custom properties can't reach a meta tag. Add the comment at both sites: `/* mirrors --surface; update together with app.css */`.

- [ ] **Step 3: Sizing + contrast fixes in app.css**

- `.lang-toggle` (line ~884): `min-height: 40px` → `min-height: 44px`.
- `.bottom-nav a` (line ~501): add `min-height: 44px;` and change `font-size: 0.72rem` → `font-size: 0.75rem`.
- `.pill.hidden` (line ~341): `color: var(--text-subtle)` → `color: var(--text-muted)` (4.47:1 → ~6:1 on `--surface-3`; check dark mode reads fine by eye in the browser pass).

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add index.html src/components/ThemeToggle.tsx src/styles/app.css
git commit -m "Browser chrome matches the theme; tap targets and pill contrast to spec"
```

---

### Task 13: Close out — docs, full gate, merge, deploy, browser pass

**Files:**
- Modify: `docs/05-status.md` (new entry at top), `docs/03-design-system.md` (note `.btn.loading` under Components; correct the stale "~318 string pairs" to the current count)

- [ ] **Step 1: Docs in the same change as the work** (repo rule)

`docs/05-status.md` gets a dated entry listing what shipped (mirror this plan's task titles, one line each) and explicitly noting: quiz integrity telemetry, projector linking, and Reset-the-course placement were deliberately untouched.

- [ ] **Step 2: Full gate on the branch**

Run: `npm run typecheck && npm run verify && npm run build`
Expected: all pass.

- [ ] **Step 3: Merge and deploy**

```bash
git checkout main && git merge --no-ff ux/2026-08-13-improvement-batch && git push
```

(Cloudflare Pages deploys on push. **Before pushing**: `git log origin/main..main` to review exactly what deploys; confirm no live class is running right now — check with the professor if in doubt; half-done classes are deliberate in this project and must not be disturbed.)

- [ ] **Step 4: Browser verification through real entry points** (pitfall #1, #48)

- Confirm the deployed bundle hash changed (fetch the live page, compare asset names to local `dist/`).
- Student path (per `docs/project_qa_testing_in_group_402` memory: QA against Group 402, never a real group): sign-in screen shows the spinner on submit; Grades retry refetches without a reload; theme toggle updates the browser chrome colour.
- What cannot be verified without a live 402 class (optimistic answer, countdown pill, quiz retry/resume, reflection draft): record as "passes every check that can run without a live class" in `docs/05-status.md`, and list the exact click-path for the professor's next 402 rehearsal.

- [ ] **Step 5: Commit docs (if edited after merge) and push**

```bash
git add docs/05-status.md docs/03-design-system.md
git commit -m "Record the 2026-08-13 UX batch"
git push
```

---

## Self-Review (performed while writing)

- **Coverage vs the approved list:** spinner → T1; optimistic tap → T2; quiz dead end → T4; false 0% → T3; reflection autosave → T5; countdown warning → T2; Spanish errors → T6; verifier widening → T7; instant class entry → T9; back-button tabs → T8; screen-reader/tab semantics → T8+T10; keys → T11; theme-color/bottom-nav/lang-toggle/pill → T12. Deliberately excluded (professor's standing decisions): projector link, Reset placement, integrity-telemetry disclosure (left for his explicit call).
- **Types:** `resumed` state defined in T3 and referenced in T4's start() — consistent. `QuizAttempt` optional fields match the backend select verified in source. `failureKey: StringKey` change in T6 requires the `StringKey` import that ContentLibrary.tsx already has (it uses `StringKey` at :83).
- **Placeholder scan:** T7 step 3 and T11's Review/Grades key names are discovery-bounded (the verifier output / the map callback's id field) — the discovery command is given in each case.
