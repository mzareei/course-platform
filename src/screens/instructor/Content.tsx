// I3 Content — drop a lecture PDF, watch it become a deck and a question bank,
// read what came out, approve it.
//
// Approving does not publish: it activates the bank and creates a DRAFT
// release, so the lecture still has to be released for a class like any other
// content. Nothing here is ever visible to a student before that.
import { useEffect, useRef, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { t, apiErrorText } from "../../i18n";
import type { StringKey } from "../../i18n/strings";
import {
  listJobs, jobStatus, advanceJob, createJob, cancelJob,
  reviewBundle, approveJob, uploadPdf, previewUrl,
  generationReviewCapabilities, hasGenerationProgress, isGenerationInFlight,
  type GenerationJob, type GeneratedQuestion, type GenerationMode, type TeachingBrief
} from "../../api/generation";
import { importContent, type DeckProblem, type ImportResult } from "../../api/contentImport";
import { ContentLibraryView } from "../../components/ContentLibrary";
import { GenerationBriefForm } from "../../components/GenerationBriefForm";
import { GenerationPlanReview } from "../../components/GenerationPlanReview";
import { QuestionBanks } from "../../components/QuestionBanks";
import { ImportPreview } from "../../components/ImportPreview";
import { ImportPromptCard } from "../../components/ImportPromptCard";
import {
  bankIsImportable, parseQuestionFile, type ParsedBank
} from "../../features/import/questionFile";

const POLL_MS = 5000;
type ContentTab = "library" | "banks" | "generate" | "import";

function slugify(value: string) {
  return value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function Content() {
  const [jobs, setJobs] = useState<GenerationJob[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<GenerationJob | null>(null);
  // The professor's own lectures come first — the AI pipeline is the newer,
  // rarer path, not the default one. The tab lives in the URL so the back
  // button and a reload keep the professor where they were.
  const { query } = useLocation();
  const tab: ContentTab = query.tab === "banks" ? "banks" : query.tab === "import" ? "import" : "library";
  const poll = useRef<number | undefined>(undefined);

  function refresh() {
    return listJobs().then((r) => setJobs(r.jobs)).catch((e: unknown) => setError(apiErrorText(e, "content.jobsLoadFailed")));
  }

  useEffect(() => { void refresh(); }, []);

  // While anything is mid-generation, poll it and nudge it forward. The worker
  // chains itself, but a cold start can drop the baton — this makes a stalled
  // job resume instead of sitting there looking alive.
  useEffect(() => {
    clearInterval(poll.current);
    const active = (jobs ?? []).filter((job) => isGenerationInFlight(job.status));
    if (!active.length) return;
    poll.current = setInterval(() => {
      Promise.all(active.map((job) =>
        jobStatus(job.id)
          .then(({ job: fresh }) => {
            if (isGenerationInFlight(fresh.status)) void advanceJob(job.id).catch(() => {});
            return fresh;
          })
          .catch(() => null)
      )).then(() => void refresh());
    }, POLL_MS) as unknown as number;
    return () => clearInterval(poll.current);
  }, [jobs?.map((j) => `${j.id}:${j.status}`).join(",")]);

  async function onUpload({ file, title, teaching_brief }: {
    file: File;
    title: string;
    teaching_brief: TeachingBrief;
  }) {
    setBusy("upload");
    setError(null);
    try {
      const uploadId = await uploadPdf(file);
      await createJob({
        upload_id: uploadId,
        lecture_title: title,
        lecture_slug: slugify(title),
        teaching_brief
      });
      await refresh();
      return true;
    } catch (e) {
      setError(apiErrorText(e, "content.uploadFailed"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function onCancel(jobId: string) {
    setBusy(jobId);
    try {
      await cancelJob(jobId);
      await refresh();
    } catch (e) {
      setError(apiErrorText(e, "content.jobsLoadFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div class="stack">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <p class="eyebrow">{t("content.eyebrow")}</p>
          <h1>{t("content.title")}</h1>
        </div>
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
      </div>

      {tab === "library" ? <ContentLibraryView /> : tab === "banks" ? (
        <QuestionBanks />
      ) : tab === "import" ? (
        <ImportPanel />
      ) : (
      <>
      <p class="hint">{t("content.lede")}</p>

      {error ? <p class="error-text" role="alert">{error}</p> : null}
      <GenerationBriefForm busy={busy === "upload"} onSubmit={onUpload} />

      <h2>{t("content.jobsTitle")}</h2>
      {jobs === null ? (
        <div class="empty-state"><p>{t("content.loadingJobs")}</p></div>
      ) : jobs.length === 0 ? (
        <div class="empty-state card">
          <h3>{t("content.noJobsTitle")}</h3>
          <p>{t("content.noJobsBody")}</p>
        </div>
      ) : (
        <div class="stack">
          {jobs.map((job) => (
            <JobCard
              job={job}
              busy={busy === job.id}
              onCancel={() => onCancel(job.id)}
              onPlanReview={() => setPlanning(job.id)}
              onReview={() => setReviewing(job)}
            />
          ))}
        </div>
      )}

      {planning ? (
        <GenerationPlanReview
          jobId={planning}
          onClose={() => setPlanning(null)}
          onApproved={() => { setPlanning(null); void refresh(); }}
        />
      ) : null}
      {reviewing ? (
        <ReviewPanel
          jobId={reviewing.id}
          generationMode={reviewing.generation_mode}
          onClose={() => setReviewing(null)}
          onApproved={() => { setReviewing(null); void refresh(); }}
        />
      ) : null}
      </>
      )}
    </div>
  );
}

const STEP_ORDER: GenerationJob["status"][] = [
  "queued", "extracting", "outlining", "ready_for_plan_review", "generating_deck", "generating_questions", "grounding", "assembling", "ready_for_review"
];

function JobCard({ job, busy, onCancel, onPlanReview, onReview }: {
  job: GenerationJob; busy: boolean; onCancel: () => void; onPlanReview: () => void; onReview: (job: GenerationJob) => void;
}) {
  const inFlight = isGenerationInFlight(job.status);
  const displaysProgress = hasGenerationProgress(job.status);
  const step = Math.max(0, STEP_ORDER.indexOf(job.status));
  const percent = job.status === "approved" ? 100 : Math.round((step / (STEP_ORDER.length - 1)) * 100);

  return (
    <div class="card">
      <div class="row" style="justify-content: space-between;">
        <h3>{job.lecture_title}</h3>
        <span class={`pill ${job.status === "failed" ? "warn" : inFlight ? "live" : "hidden"}`}>
          {t(`content.status.${job.status}` as "content.status.queued")}
        </span>
      </div>

      {displaysProgress ? (
        <>
          <div class="progress-track" aria-hidden="true">
            <div class="progress-fill" style={`width: ${percent}%;`} />
          </div>
          <p class="hint">{t("content.stepOf", { step: step + 1, total: STEP_ORDER.length })}</p>
        </>
      ) : null}

      {/* A retry that later succeeded leaves its message behind; showing it on a
          finished job reads as a failure when nothing is wrong. */}
      {job.error && job.status !== "ready_for_plan_review" && job.status !== "ready_for_review" && job.status !== "approved"
        ? <p class="error-text">{job.error}</p>
        : null}

      <div class="row">
        {job.status === "ready_for_plan_review" ? (
          <button class="btn primary" type="button" onClick={onPlanReview}>{t("content.plan.review")}</button>
        ) : null}
        {job.status === "ready_for_review" ? (
          <button class="btn primary" type="button" onClick={() => onReview(job)}>{t("content.review")}</button>
        ) : null}
        {job.status === "approved" ? <span class="hint">{t("content.approvedNote")}</span> : null}
        {inFlight ? (
          <button class="btn quiet" type="button" disabled={busy} onClick={onCancel}>
            {t("content.cancel")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ReviewPanel({ jobId, generationMode, onClose, onApproved }: {
  jobId: string; generationMode: GenerationMode; onClose: () => void; onApproved: () => void;
}) {
  const [bundle, setBundle] = useState<{
    job: GenerationJob & { generation_mode: "deck_and_bank" | "bank_only" };
    questions: GeneratedQuestion[];
  } | null>(null);
  const [deckUrl, setDeckUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reviewCapabilities = generationReviewCapabilities(generationMode);

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    setDeckUrl(null);
    setError(null);
    reviewBundle(jobId)
      .then((result) => {
        if (cancelled) return;
        setBundle({ job: result.job, questions: result.questions });
        if (!reviewCapabilities.requestsDeckPreview) return;
        previewUrl(jobId)
          .then((preview) => {
            if (!cancelled) setDeckUrl(`/content?t=${encodeURIComponent(preview.token)}`);
          })
          .catch(() => {});
      })
      .catch((e: Error) => {
        if (!cancelled) setError(apiErrorText(e, "content.jobsLoadFailed"));
      });
    return () => { cancelled = true; };
  }, [jobId, reviewCapabilities.requestsDeckPreview]);

  async function onApprove() {
    setBusy(true);
    try {
      await approveJob(jobId);
      onApproved();
    } catch (e) {
      setError(apiErrorText(e, "content.approveFailed"));
      setBusy(false);
    }
  }

  const bankOnly = generationMode === "bank_only";
  const byDifficulty = (level: string) => (bundle?.questions ?? []).filter((q) => q.difficulty === level);

  return (
    <div class="card">
      <div class="row" style="justify-content: space-between;">
        <h2>{bankOnly ? t("content.reviewBankOnlyTitle") : t("content.reviewTitle")}</h2>
        <button class="btn quiet" type="button" onClick={onClose}>{t("content.close")}</button>
      </div>
      <p class="hint">{bankOnly ? t("content.reviewBankOnlyBody") : t("content.reviewBody")}</p>
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {reviewCapabilities.showsDeck && deckUrl ? (
        <iframe
          class="viewer-frame"
          style="height: 420px;"
          src={deckUrl}
          title={t("content.deckPreview")}
        />
      ) : null}

      {bundle === null ? (
        <p class="hint">{t("content.loadingQuestions")}</p>
      ) : (
        <div class="stack">
          <p class="hint">
            {t("content.questionCounts", {
              easy: byDifficulty("easy").length,
              medium: byDifficulty("medium").length,
              hard: byDifficulty("hard").length
            })}
          </p>
          {bundle.questions.map((question, index) => (
            <div class="card muted" style="padding: 0.7rem 0.85rem;">
              <div class="row" style="justify-content: space-between;">
                <p class="hint" style="font-weight: 650; color: var(--text);">
                  {index + 1}. {question.prompt}
                </p>
                <span class="pill hidden">
                  {t(`quiz.difficulty.${question.difficulty}` as "quiz.difficulty.easy")}
                </span>
              </div>
              {reviewCapabilities.showsCheckpointMappings ? (
                question.source_slide_start !== null
                  && question.source_slide_end !== null
                  && question.checkpoint_after_slide !== null ? (
                    <p class="hint">
                      {t("content.questionCheckpoint", {
                        start: question.source_slide_start,
                        end: question.source_slide_end,
                        checkpoint: question.checkpoint_after_slide
                      })}
                    </p>
                  ) : (
                    <p class="error-text">{t("content.questionCheckpointMissing")}</p>
                  )
              ) : null}
              <div class="stack" style="gap: 0.25rem;">
                {question.question_options
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((option) => (
                    <p class="hint" style={option.is_correct ? "color: var(--good); font-weight: 650;" : ""}>
                      {option.is_correct ? "✓ " : "· "}{option.option_text}
                    </p>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <button class="btn primary" type="button" disabled={busy || !bundle?.questions.length} onClick={onApprove}>
        {busy ? t("content.approving") : bankOnly ? t("content.approveBankOnly") : t("content.approve")}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ import
// A professor's own AI produces the question file; this panel just parses,
// previews, repairs and sends it. An in-progress edit survives an accidental
// tab close via a single localStorage draft — there is only ever one import
// in flight, so one key is enough.
const IMPORT_DRAFT_KEY = "content-import-draft";

const DECK_PROBLEM_KEYS: Record<DeckProblem["kind"], StringKey> = {
  relative: "import.deck.relative",
  forbidden_host: "import.deck.forbiddenHost",
  undeclared_host: "import.deck.undeclaredHost",
  no_title: "import.deck.noTitle"
};

interface ImportDraft {
  bank: ParsedBank;
  fileText: string;
  slug: string;
  deckHtml: string;
  externalLinksText: string;
}

function loadImportDraft(): ImportDraft | null {
  try {
    const raw = localStorage.getItem(IMPORT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImportDraft> | null;
    // A malformed draft (e.g. left over from a future ParsedBank schema
    // change) must never reach ImportPreview — there is no error boundary
    // anywhere in this app, and groupBySlide() on a shape it doesn't
    // recognize would blank the whole SPA on every reload, with the draft
    // restoring again on the very next mount and no in-app way to clear it.
    if (
      !parsed
      || typeof parsed !== "object"
      || !parsed.bank
      || typeof parsed.bank !== "object"
      || typeof (parsed.bank as ParsedBank).ok !== "boolean"
      || !Array.isArray((parsed.bank as ParsedBank).questions)
    ) {
      return null;
    }
    return {
      bank: parsed.bank,
      fileText: typeof parsed.fileText === "string" ? parsed.fileText : "",
      slug: typeof parsed.slug === "string" ? parsed.slug : "",
      deckHtml: typeof parsed.deckHtml === "string" ? parsed.deckHtml : "",
      externalLinksText: typeof parsed.externalLinksText === "string" ? parsed.externalLinksText : ""
    };
  } catch {
    return null; // Corrupted or unavailable storage — start clean rather than crash.
  }
}

function clearImportDraft() {
  try {
    localStorage.removeItem(IMPORT_DRAFT_KEY);
  } catch {
    // Best effort only.
  }
}

/** Comma- or newline-separated hostnames the professor's deck legitimately links to. */
function parseHostList(text: string): string[] {
  const hosts = text.split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean);
  return [...new Set(hosts)];
}

/** The deck's own <title>, for a deck uploaded with no question bank to borrow
 *  a title from.
 *
 *  Read with a regex rather than DOMParser on purpose: parsing a full lecture
 *  deck into a detached document to reach one element runs its <style> blocks
 *  through the CSS parser and builds a DOM for every slide, and the string is
 *  already in memory. Entities are decoded through a textarea, so a title
 *  containing &amp; or &#8212; arrives as the professor wrote it. */
function deckTitleFromHtml(html: string): string {
  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!raw) return "";
  const decoder = document.createElement("textarea");
  decoder.innerHTML = raw;
  // 180 is the server's own cap in writeDeck(); trimming here means a long
  // title is silently accepted rather than rejected after the upload.
  return decoder.value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function ImportPanel() {
  const [bank, setBank] = useState<ParsedBank | null>(null);
  const [fileText, setFileText] = useState("");
  const [questionFileName, setQuestionFileName] = useState<string | null>(null);
  // Once a bank has loaded cleanly, the raw file/paste inputs collapse behind
  // a summary — see loadFromText()/showRawInputs below. `replacing` is the
  // professor's explicit override to bring them back for a deliberate swap;
  // it is never what silently exposes them.
  const [replacing, setReplacing] = useState(false);
  const [slug, setSlug] = useState("");
  const [deckHtml, setDeckHtml] = useState("");
  const [deckFileName, setDeckFileName] = useState<string | null>(null);
  const [externalLinksText, setExternalLinksText] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Captured at the moment of commit, independent of live `deckHtml` — a
  // full success calls resetForm() in the same tick as setResult(), which
  // would otherwise blank deckHtml before this ever renders and make a
  // successful deck import look like it was never attempted.
  const [resultHadDeck, setResultHadDeck] = useState(false);
  // Same reasoning as resultHadDeck: a deck-only import must not report the
  // bank half it never sent.
  const [resultHadBank, setResultHadBank] = useState(false);

  // Restore a draft on mount. Only ever one in-progress import, so no picker.
  useEffect(() => {
    const draft = loadImportDraft();
    if (!draft) return;
    setBank(draft.bank);
    setFileText(draft.fileText);
    setSlug(draft.slug);
    setDeckHtml(draft.deckHtml);
    setExternalLinksText(draft.externalLinksText);
    setDraftRestored(true);
  }, []);

  // Persist on every meaningful change, so closing the tab mid-edit does not
  // lose the professor's repairs.
  useEffect(() => {
    if (!bank) return;
    try {
      localStorage.setItem(
        IMPORT_DRAFT_KEY,
        JSON.stringify({ bank, fileText, slug, deckHtml, externalLinksText })
      );
    } catch {
      // Private browsing can refuse storage; the draft is best effort.
    }
  }, [bank, fileText, slug, deckHtml, externalLinksText]);

  function loadFromText(text: string) {
    setFileText(text);
    setResult(null);
    const parsed = parseQuestionFile(text);
    setBank(parsed);
    if (parsed.ok && !slug.trim()) {
      setSlug(slugify(parsed.title));
    }
    // A fresh parse always resolves any pending "load a different file"
    // request — harmless when the parse failed too, since showRawInputs
    // below keeps the raw inputs open on its own whenever !bank.ok.
    setReplacing(false);
  }

  // The paste textarea's own onInput handler: distinct from loadFromText
  // itself only in that typing/pasting directly means the source is no
  // longer "a chosen file," so any filename shown in the collapsed summary
  // has to go with it.
  function onPasteInput(text: string) {
    setQuestionFileName(null);
    loadFromText(text);
  }

  function onChooseFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadFromText(String(reader.result || ""));
      setQuestionFileName(file.name);
    };
    reader.readAsText(file);
  }

  function onChooseDeckFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const html = String(reader.result || "");
      setDeckHtml(html);
      setDeckFileName(file.name);
      // The slug is the join key: a deck and a bank uploaded under different
      // slugs resolve to two independent content items, quietly, and the
      // lecture ends up split in half. In the two-step flow the deck arrives
      // first and alone, so without this the field sits empty and whatever
      // gets typed has to be remembered and retyped exactly when the questions
      // are uploaded later. Deriving it from the deck's own title gives both
      // halves the same starting point. Only ever fills a blank field — never
      // overwrites a slug already chosen, by hand or from a bank.
      if (!slug.trim()) {
        const suggested = slugify(deckTitleFromHtml(html));
        if (suggested) setSlug(suggested);
      }
    };
    reader.readAsText(file);
  }

  function resetForm() {
    setBank(null);
    setFileText("");
    setQuestionFileName(null);
    setReplacing(false);
    setSlug("");
    setDeckHtml("");
    setDeckFileName(null);
    setExternalLinksText("");
    setDraftRestored(false);
  }

  async function onCommit() {
    const hasDeck = deckHtml.trim().length > 0;
    const hasBank = Boolean(bank && bankIsImportable(bank));
    // Either half may travel alone. The two-step authoring flow produces the
    // deck first and the questions from it afterwards, so demanding a bank
    // before a deck could be uploaded made the deck unuploadable at the exact
    // moment it existed and the bank did not.
    if (!hasBank && !hasDeck) return;
    if (!slug.trim()) {
      setError(t("import.slugRequired"));
      return;
    }
    // With no bank to borrow a title from, the deck names itself, and if it
    // has no <title> the file name does. A missing title used to refuse the
    // upload here — the professor was sent back to edit the HTML over a name
    // the library could have derived. The slug is the last resort and is
    // already required non-empty above, so there is always something to send:
    // the endpoint rejects an empty title, and it must never see one.
    const deckTitle = (hasBank ? bank!.title : deckTitleFromHtml(deckHtml))
      || deckFileName?.replace(/\.[^.]+$/, "").trim()
      || slug.trim();
    setBusy(true);
    setError(null);
    try {
      const response = await importContent({
        ...(hasBank
          ? {
            bank: {
              content_slug: slug.trim(),
              title: bank!.title,
              title_es: bank!.title_es,
              questions: bank!.questions
            }
          }
          : {}),
        ...(hasDeck
          ? {
            deck: {
              slug: slug.trim(),
              title: deckTitle,
              title_es: hasBank ? bank!.title_es : null,
              html: deckHtml,
              external_links: parseHostList(externalLinksText)
            }
          }
          : {})
      });
      setResult(response);
      setResultHadDeck(hasDeck);
      setResultHadBank(hasBank);
      // A bad deck must never hide a good bank, or the reverse — but only
      // clear the draft once nothing attempted has failed, so a partial
      // failure never costs the professor their edits. A half that was never
      // sent comes back {ok:false} from the server's default result and must
      // not be read as a failure.
      if ((!hasBank || response.bank.ok) && (!hasDeck || response.deck.ok)) {
        clearImportDraft();
        resetForm();
      }
    } catch (e) {
      setError(apiErrorText(e, "import.commitFailed"));
    } finally {
      setBusy(false);
    }
  }

  // A bank that failed to parse (bank.ok === false) has no ImportPreview to
  // protect — there is nothing an accidental keystroke could discard — so the
  // raw inputs stay open in that case regardless of `replacing`, which is the
  // only path back to fixing the raw text. Once bank.ok is true, the inputs
  // are closed unless the professor explicitly asked to replace them.
  const showRawInputs = !bank || !bank.ok || replacing;

  return (
    <div class="stack">
      <div>
        <h2>{t("import.title")}</h2>
        <p class="hint">{t("import.lede")}</p>
      </div>

      {draftRestored ? (
        <div class="card muted row" style="justify-content: space-between; align-items: center;">
          <p class="hint" role="status">{t("import.draftRestored")}</p>
          <button class="btn quiet" type="button" onClick={() => setDraftRestored(false)}>
            {t("content.close")}
          </button>
        </div>
      ) : null}

      {/* Colleagues come to this page for different things: one wants only the
          end-of-class quiz, another presents the whole lecture from here. The
          page used to read as one fixed path, so this says up front which
          steps and uploads each use needs. */}
      <ImportPathGuide />

      {/* The prompt comes before the upload because that is the order the work
          happens in: copy it, run it in your own AI, bring the file back. */}
      <ImportPromptCard />

      {/* Part 2 follows Part 1's order: the lecture ID first, because it joins
          both files into one lecture, then the deck from step 1, then the
          questions from step 2. The question file input used to sit straight
          under step 2 with no name of its own, above the deck. */}
      <section
        class="card muted stack import-part"
        aria-labelledby="import-part-upload-eyebrow import-part-upload"
      >
        <div>
          <p class="eyebrow" id="import-part-upload-eyebrow">{t("import.part2.eyebrow")}</p>
          <h3 id="import-part-upload" class="import-part-title">{t("import.part2.title")}</h3>
          <p class="hint">{t("import.part2.lede")}</p>
        </div>

        <div class="card stack">
          <label class="field">
            {t("import.slug")}
            <input
              type="text"
              value={slug}
              onInput={(event) => setSlug((event.target as HTMLInputElement).value)}
            />
            <span class="hint">{t("import.slugHint")}</span>
          </label>
        </div>

        <div class="card stack">
          <div>
            <h4>{t("import.deck.sectionTitle")}</h4>
            <p class="hint">{t("import.deck.sectionLede")}</p>
            <p class="hint">{t("import.noAutoCue")}</p>
          </div>
          <label class="field">
            {t("import.deck.chooseFile")}
            <input type="file" accept="text/html,.html" onChange={onChooseDeckFile} />
          </label>
          {deckFileName ? <p class="hint">{deckFileName}</p> : null}
          {/* Optional, and never a reason to refuse an upload. Printed open it
              read as one more required step, with its hint shown twice. */}
          {/* A restored draft can carry a host list; the summary shows it so a
              collapsed block never hides a value that changes the upload. */}
          <details>
            <summary class="hint">
              {t("import.deck.externalLinks")}
              {externalLinksText.trim() ? `: ${parseHostList(externalLinksText).join(", ")}` : null}
            </summary>
            <div class="stack" style="padding-top: 0.5rem;">
              <p class="hint" id="import-external-links-hint">{t("import.deck.externalLinksHint")}</p>
              <textarea
                rows={2}
                value={externalLinksText}
                aria-label={t("import.deck.externalLinks")}
                aria-describedby="import-external-links-hint"
                placeholder="example.com"
                onInput={(event) => setExternalLinksText((event.target as HTMLTextAreaElement).value)}
              />
            </div>
          </details>

          {/* The only commit control used to live inside ImportPreview, which
              renders only for a loaded bank — so a deck chosen on its own could
              be read, named on screen, and never sent anywhere.

              Exactly one commit button exists at a time. When a bank is loaded,
              ImportPreview's button owns the submit and sends the deck with it;
              this half then explains that in words, because a button that
              disappears the moment the second file loads reads as the deck being
              dropped, not as the two being merged.

              When no bank is loaded, the button is always rendered and merely
              disabled until a file is chosen. Rendering it only once a file
              exists hid the one control the screen was missing behind the very
              action the professor was looking for it to perform. */}
          {bank && bank.ok && !replacing ? (
            deckHtml.trim()
              ? <p class="hint" role="status">{t("import.deck.savedWithQuestions")}</p>
              : null
          ) : (
            <div class="row" style="justify-content: space-between; align-items: center;">
              <p class="hint">
                {deckHtml.trim() ? t("import.deck.aloneHint") : t("import.deck.chooseFirst")}
              </p>
              <button
                class="btn primary"
                type="button"
                disabled={busy || !deckHtml.trim()}
                style="flex: 0 0 auto;"
                onClick={() => void onCommit()}
              >
                {t("import.deck.commitAlone")}
              </button>
            </div>
          )}
        </div>

        <div class="card stack">
          <div>
            <h4>{t("import.bank.sectionTitle")}</h4>
            <p class="hint">{t("import.bank.sectionLede")}</p>
          </div>
          {showRawInputs ? (
            <>
              {/* Only offered when there's a previously-loaded, clean bank to
                  cancel back to — a mid-file-selection change of mind should
                  not lose anything either. */}
              {replacing && bank && bank.ok ? (
                <div class="row" style="justify-content: flex-end;">
                  <button class="btn quiet" type="button" onClick={() => setReplacing(false)}>
                    {t("content.close")}
                  </button>
                </div>
              ) : null}
              <label class="field">
                {t("import.chooseFile")}
                <input type="file" accept="application/json,.json" onChange={onChooseFile} />
              </label>
              <label class="field">
                {t("import.paste")}
                <textarea
                  rows={6}
                  value={fileText}
                  onInput={(event) => onPasteInput((event.target as HTMLTextAreaElement).value)}
                />
              </label>
              {bank && !bank.ok && bank.fileProblemKey ? (
                <p class="error-text" role="alert">
                  {t(bank.fileProblemKey, { detail: bank.fileProblem ?? "" })}
                </p>
              ) : null}
            </>
          ) : bank ? (
            // bank.ok is guaranteed here — showRawInputs is true whenever it
            // isn't — so this is always the "loaded cleanly" summary, never an
            // error state. Collapsing behind this (instead of leaving a live,
            // stale textarea sitting there) is what stops a stray click or a
            // file re-selection from silently discarding every repair made
            // below in ImportPreview.
            <>
              <p class="hint">{t("import.loadedSummary", { count: bank.questions.length })}</p>
              {questionFileName ? <p class="hint">{questionFileName}</p> : null}
              <button
                class="btn quiet"
                type="button"
                onClick={() => { setFileText(""); setQuestionFileName(null); setReplacing(true); }}
              >
                {t("import.loadDifferentFile")}
              </button>
            </>
          ) : null}
        </div>

        {bank && bank.ok && !replacing ? (
          <ImportPreview bank={bank} onChange={setBank} onCommit={() => void onCommit()} />
        ) : null}

        {/* Next to the save buttons, not at the top of the page: both errors
            come from pressing one of them. */}
        {error ? <p class="error-text" role="alert">{error}</p> : null}
        {busy ? <p class="hint" role="status">{t("import.saving")}</p> : null}

        {result ? (
          <ImportResultSummary result={result} hasDeck={resultHadDeck} hasBank={resultHadBank} />
        ) : null}
      </section>
    </div>
  );
}

const IMPORT_PATHS: [StringKey, StringKey][] = [
  ["import.path.full.title", "import.path.full.do"],
  ["import.path.quiz.title", "import.path.quiz.do"],
  ["import.path.slides.title", "import.path.slides.do"]
];

/** The ways colleagues use this page, each with the steps and uploads it needs.
 *  Declared at module scope, not inside ImportPanel — pitfall #4. */
function ImportPathGuide() {
  return (
    <div class="card stack">
      <h3>{t("import.path.title")}</h3>
      <div class="grid-2">
        {IMPORT_PATHS.map(([titleKey, doKey]) => (
          <div class="card muted" style="gap: 0.25rem;" key={titleKey}>
            <strong>{t(titleKey)}</strong>
            <p class="hint">{t(doKey)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportResultSummary(
  { result, hasDeck, hasBank }: { result: ImportResult; hasDeck: boolean; hasBank: boolean }
) {
  const notices = result.deck.notices ?? [];
  const deckHostNotices = notices.filter((notice) => Boolean(notice.host));
  const deckOtherNotices = notices.filter((notice) => !notice.host);
  return (
    <div class="card stack">
      {/* The server seeds both halves {ok:false} and only overwrites the one it
          was actually given, so a deck-only import reports a bank failure that
          never happened. Show a half only when it was sent. */}
      {hasBank ? (
        <p class={result.bank.ok ? "hint" : "error-text"} role={result.bank.ok ? "status" : "alert"}>
          {result.bank.ok ? t("import.bank.success") : result.bank.error || t("import.bank.failed")}
        </p>
      ) : null}
      {hasDeck ? (
        <>
          <p class={result.deck.ok ? "hint" : "error-text"} role={result.deck.ok ? "status" : "alert"}>
            {result.deck.ok ? t("import.deck.success") : result.deck.error || t("import.deck.failed")}
          </p>
          {!result.deck.ok && result.deck.problems?.length ? (
            <ul>
              {result.deck.problems.map((problem, index) => (
                <li class="error-text" key={index}>
                  {t(DECK_PROBLEM_KEYS[problem.kind], { detail: problem.reference ?? problem.host ?? "" })}
                </li>
              ))}
            </ul>
          ) : null}
          {/* Everything the validator found that is not a reason to refuse the
              upload. Split by shape, not by kind: a host is a place the deck
              points, and reads as a bare hostname under its own heading. The
              rest — a blank image, a missing title — has nothing to list, so
              it needs its own sentence to mean anything. Both are reported
              after a successful import, never as a reason to refuse one. */}
          {result.deck.ok && deckHostNotices.length ? (
            <>
              <p class="hint">{t("import.deck.linksOutTo")}</p>
              <ul>
                {deckHostNotices.map((notice, index) => (
                  <li class="hint" key={index}>{notice.host}</li>
                ))}
              </ul>
              <p class="hint">{t("import.deck.linksOutExplain")}</p>
            </>
          ) : null}
          {result.deck.ok && deckOtherNotices.length ? (
            <>
              <p class="hint">{t("import.deck.noticeHeading")}</p>
              <ul>
                {deckOtherNotices.map((notice, index) => (
                  <li class="hint" key={index}>
                    {t(DECK_PROBLEM_KEYS[notice.kind], { detail: notice.reference ?? "" })}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
