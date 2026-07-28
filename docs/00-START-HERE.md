# Start here

You are picking up an in-progress project. Read this page, then the numbered
files in order. Together they are meant to replace having been in the room.

**Read in this order:**

| File | What it answers |
|---|---|
| `01-project-overview.md` | What we're building, for whom, and what "done" means |
| `02-architecture.md` | The two repos, the stack, how a request actually flows |
| `03-design-system.md` | Visual style, UI rules, copy voice, bilingual rules |
| `04-decisions.md` | Why things are the way they are — read before changing anything structural |
| `05-status.md` | What is finished, what is left, in priority order |
| `06-runbook.md` | Build, deploy, test, verify — the exact commands |
| `07-pitfalls.md` | Traps that have already cost hours. **Read this before debugging anything.** |
| `HANDOFF-PROMPT.md` | Paste into a fresh session to continue the work |

## The 60-second version

A university professor (Mahdi Zareei, Tecnológico de Monterrey) teaches an
information-security course. This is the platform he runs his classes on: it
shows students the lecture deck, pushes live questions mid-lecture, runs a timed
end-of-class quiz, collects a written reflection, and grades all of it — and it
generates the lecture deck *and* its question bank automatically from a PDF he
uploads.

**Live:** https://course-platform-3ko.pages.dev

Two repos, both required:

- **`~/Documents/GitHub/course-platform`** — the app (Vite + TypeScript +
  Preact SPA). Deploys to Cloudflare Pages on push to `main`.
- **`~/Documents/GitHub/mzareei.github.io`** — Supabase edge functions
  (`supabase/functions/`), database migrations (`supabase/migrations/`), the
  professor's public academic site, and the original hand-authored lecture decks.

## The three rules that matter most

1. **Test through the real entry points.** Sign in as a student and click from
   the Today screen. Navigating straight to an internal route validates code
   paths a real user cannot reach — this exact mistake shipped a build where
   students had no way to join a live class at all.
2. **Never render deck HTML with `srcdoc` or `blob:`.** Both inherit the app's
   CSP and silently kill the deck engine. Always go through `/content?t=…`.
   This has bitten twice. See `07-pitfalls.md`.
3. **The professor never writes quiz questions.** Every question is generated
   from lecture content. This is a product rule, not an implementation detail.

## Working agreement with the professor

- He tests for real and will tell you plainly when something doesn't work.
  Believe him and reproduce it before theorising.
- He prefers you keep working autonomously over stopping to ask, but he wants
  honest reporting: say what is verified, what is assumed, and what is broken.
- Don't claim something works until you have seen it work through the UI.
