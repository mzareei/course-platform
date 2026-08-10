# Prompt for a new AI agent

Copy everything below into a new agent session.

---

You are continuing Mahdi Zareei's TC2007B bilingual teaching platform at
Tecnológico de Monterrey. Do not make changes until you understand the current
state; the project spans three related repositories and some historical handoffs
are stale.

Start in `~/Documents/GitHub/course-platform`. Read these files in this exact
order before acting:

1. `docs/00-START-HERE.md`
2. `docs/PROJECT-HANDOFF.md` — this is the current source of truth.
3. `docs/04-decisions.md`
4. `docs/05-status.md`
5. `docs/06-runbook.md`
6. `docs/07-pitfalls.md`
7. `docs/superpowers/specs/2026-08-09-pdf-teaching-plan-and-grounding-design.md`
8. `docs/superpowers/plans/2026-08-09-pdf-teaching-plan-and-grounding.md`

Repository map:

- `~/Documents/GitHub/course-platform`: Vite + TypeScript + Preact SPA. A push
  to `main` deploys Cloudflare Pages.
- `~/Documents/GitHub/mzareei.github.io`: Supabase Edge Functions and database
  migrations, plus a separate public academic website. Edge Functions do not
  deploy on Git push; deploy them explicitly with Supabase CLI.
- `~/Documents/GitHub/course-content`: private Git source for authored course
  content. Publishing to private platform storage and releasing to students are
  separate actions.

Live platform: https://course-platform-3ko.pages.dev

Supabase project ref: `ojmbupftdikwmlqvibwt`

What you are maintaining:

- A bilingual live-class platform: groups, class days, QR check-in, lecture
  presentation, selected pulse questions, timed final quiz, reflection,
  attendance/engagement, and per-class grades.
- Reusable question banks and a separate question plan per class. A professor
  can select existing source-mapped questions or write a quick class-specific
  one; they may use the platform for questions while presenting an external PDF.
- A PDF generation workflow: upload a PDF and teaching brief; review/edit an
  ordered plan; generate deck+bank or bank-only; independently ground output
  against the PDF; then explicitly release content when ready. The uploaded PDF
  is the curriculum source of truth; the title is only a display label.
- Content authoring through the private content repository and explicit server
  synchronization, never automatic student release.

Non-negotiable rules:

1. Browser clients never query Supabase tables; Edge Functions authorize every
   operation.
2. Never use `srcdoc` or `blob:` for decks. Use gated `/content?t=…` only.
3. Test through actual user paths. For students begin at Today; do not treat an
   internal URL as a test. Use Mahdi's signed-in Chrome session for instructor
   UI when available.
4. Every user-facing string is English and Spanish.
5. Preserve the user's untracked `.superdesign/`, `AGENTS.md`, and `.DS_Store`
   files. Check `git status` in all repositories before editing.
6. Do not commit secrets or private student information.
7. Keep `docs/PROJECT-HANDOFF.md`, `docs/05-status.md`, and
   `docs/07-pitfalls.md` updated when you change verified behavior or deployment
   state.

Current important state:

- The Teaching Brief UI and the PDF teaching-plan migration/functions are live.
- The PDF worker defaults to `claude-sonnet-5` unless `ANTHROPIC_MODEL` overrides
  it. A typical deck+bank costs roughly US$0.40–$1.00 in model API usage;
  bank-only roughly US$0.25–$0.60. Read the handoff for assumptions.
- Backend GitHub `main`, the primary backend folder, and the active PDF worktree
  are synchronized at `0cb36b6`. The legacy-slide compatibility and Deno
  type-check fixes are deployed in the three generation-related functions.
- The next high-value task is a real browser PDF upload → plan review →
  generation → deck/bank inspection. If automation must select a local PDF,
  Chrome needs **Allow access to file URLs** enabled for the Codex/ChatGPT
  browser extension in `chrome://extensions`.
- A real-phone classroom rehearsal and legacy public-content retirement remain
  pending. Do not delete content or perform destructive cleanup without explicit
  approval and the documented sequence.

Work autonomously within the requested scope, but be precise: separate what you
read in code from what you actually observed in the browser. Before claiming a
fix or deployment works, run the relevant verifiers and see the user flow work.

After reading, summarize the current state in a few bullets and state the next
safest, highest-value action. Then proceed with the requested work.
