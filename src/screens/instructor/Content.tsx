// I3 Content — drop a lecture PDF, watch it become a deck and a question bank,
// read what came out, approve it.
//
// Approving does not publish: it activates the bank and creates a DRAFT
// release, so the lecture still has to be released for a class like any other
// content. Nothing here is ever visible to a student before that.
import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../i18n";
import {
  listJobs, jobStatus, advanceJob, createJob, cancelJob,
  reviewBundle, approveJob, uploadPdf, previewUrl,
  generationReviewCapabilities, hasGenerationProgress, isGenerationInFlight,
  type GenerationJob, type GeneratedQuestion, type GenerationMode, type TeachingBrief
} from "../../api/generation";
import { ContentLibraryView } from "../../components/ContentLibrary";
import { GenerationBriefForm } from "../../components/GenerationBriefForm";
import { GenerationPlanReview } from "../../components/GenerationPlanReview";
import { QuestionBanks } from "../../components/QuestionBanks";

const POLL_MS = 5000;
type ContentTab = "library" | "banks" | "generate";

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
  // rarer path, not the default one.
  const [tab, setTab] = useState<ContentTab>("library");
  const poll = useRef<number | undefined>(undefined);

  function refresh() {
    return listJobs().then((r) => setJobs(r.jobs)).catch((e: Error) => setError(e.message));
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
      setError(e instanceof Error ? e.message : t("content.uploadFailed"));
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
      setError(e instanceof Error ? e.message : null);
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
        <div class="nav-tabs" role="tablist" style="flex: 0 0 auto;">
          <a href="#" role="tab" aria-current={tab === "library" ? "page" : undefined}
             onClick={(e) => { e.preventDefault(); setTab("library"); }}>
            {t("content.tab.library")}
          </a>
          <a href="#" role="tab" aria-current={tab === "banks" ? "page" : undefined}
             onClick={(e) => { e.preventDefault(); setTab("banks"); }}>
            {t("content.tab.banks")}
          </a>
          <a href="#" role="tab" aria-current={tab === "generate" ? "page" : undefined}
             onClick={(e) => { e.preventDefault(); setTab("generate"); }}>
            {t("content.tab.generate")}
          </a>
        </div>
      </div>

      {tab === "library" ? <ContentLibraryView /> : tab === "banks" ? (
        <QuestionBanks />
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

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    setDeckUrl(null);
    setError(null);
    reviewBundle(jobId)
      .then((result) => {
        if (cancelled) return;
        setBundle({ job: result.job, questions: result.questions });
        if (!generationReviewCapabilities(generationMode).showsDeck) return;
        previewUrl(jobId)
          .then((preview) => {
            if (!cancelled) setDeckUrl(`/content?t=${encodeURIComponent(preview.token)}`);
          })
          .catch(() => {});
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => { cancelled = true; };
  }, [jobId, generationMode]);

  async function onApprove() {
    setBusy(true);
    try {
      await approveJob(jobId);
      onApproved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("content.approveFailed"));
      setBusy(false);
    }
  }

  const reviewCapabilities = generationReviewCapabilities(generationMode);
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
              {reviewCapabilities.showsDeck ? (
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
