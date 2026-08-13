import { useEffect, useState } from "preact/hooks";
import { approvePlan, reviewPlan, type TeachingPlan } from "../api/generation";
import { t, apiErrorText } from "../i18n";

function optionalGoal(value: string) {
  const goal = Number(value);
  return value.trim() && Number.isFinite(goal) && goal > 0 ? goal : null;
}

function pageList(value: string) {
  return [...new Set(value.split(",")
    .map((page) => Number(page.trim()))
    .filter((page) => Number.isInteger(page) && page > 0))]
    .sort((first, second) => first - second);
}

export function GenerationPlanReview({
  jobId,
  onClose,
  onApproved
}: {
  jobId: string;
  onClose: () => void;
  onApproved: () => void;
}) {
  const [plan, setPlan] = useState<TeachingPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    setError(null);
    reviewPlan(jobId)
      .then(({ job }) => {
        if (!cancelled) setPlan(job.proposed_plan);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(apiErrorText(cause, "content.plan.loadFailed"));
      });
    return () => { cancelled = true; };
  }, [jobId]);

  function updateCheckpoint(index: number, patch: Partial<TeachingPlan["checkpoints"][number]>) {
    setPlan((current) => current && {
      ...current,
      checkpoints: current.checkpoints.map((checkpoint, checkpointIndex) =>
        checkpointIndex === index ? { ...checkpoint, ...patch } : checkpoint
      )
    });
  }

  async function approve() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      await approvePlan({ job_id: jobId, approved_plan: plan });
      onApproved();
    } catch (cause) {
      setError(apiErrorText(cause, "content.plan.approveFailed"));
      setBusy(false);
    }
  }

  return (
    <section class="card stack">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <h2>{t("content.plan.title")}</h2>
          <p class="hint">{t("content.plan.body")}</p>
          <p class="hint">{t("content.sourceTruth")}</p>
        </div>
        <button class="btn quiet" type="button" onClick={onClose}>{t("content.close")}</button>
      </div>
      {error ? <p class="error-text" role="alert">{error}</p> : null}
      {plan === null ? <p class="hint">{t("content.plan.loading")}</p> : (
        <>
          <div class="stack" style="gap: 0.5rem;">
            <h3>{t("content.plan.sourcePages")}</h3>
            {plan.source_pages.map((page) => (
              <div class="card muted" style="padding: 0.65rem 0.8rem;">
                <strong>{t("content.plan.sourcePage", { page: page.source_pdf_page })}: {page.topic}</strong>
                <p class="hint" style="margin: 0.25rem 0 0;">{page.evidence}</p>
              </div>
            ))}
          </div>
          <div class="stack" style="gap: 0.7rem;">
            <h3>{t("content.plan.checkpoints")}</h3>
            {plan.checkpoints.map((checkpoint, index) => (
              <div class="card muted stack" style="padding: 0.75rem; gap: 0.55rem;">
                <strong>{t("content.plan.checkpoint", { number: index + 1 })}</strong>
                <label class="field">
                  {t("content.plan.topic")}
                  <input value={checkpoint.topic}
                    onInput={(event) => updateCheckpoint(index, { topic: (event.target as HTMLInputElement).value })} />
                </label>
                <div class="grid-3">
                  <label class="field">
                    {t("content.plan.sourceMapping")}
                    <input value={checkpoint.source_pdf_pages.join(", ")}
                      onInput={(event) => updateCheckpoint(index, { source_pdf_pages: pageList((event.target as HTMLInputElement).value) })} />
                  </label>
                  <label class="field">
                    {t("content.plan.afterPage")}
                    <input type="number" min="1" value={checkpoint.suggested_after_pdf_page ?? ""}
                      placeholder={t("content.aiDecides")}
                      onInput={(event) => updateCheckpoint(index, { suggested_after_pdf_page: optionalGoal((event.target as HTMLInputElement).value) })} />
                  </label>
                  <label class="field">
                    {t("content.plan.candidateGoal")}
                    <input type="number" min="1" value={checkpoint.candidate_goal ?? ""}
                      placeholder={t("content.aiDecides")}
                      onInput={(event) => updateCheckpoint(index, { candidate_goal: optionalGoal((event.target as HTMLInputElement).value) })} />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <label class="field">
            {t("content.plan.endQuizGoal")}
            <input type="number" min="1" value={plan.end_quiz_goal ?? ""}
              placeholder={t("content.aiDecides")}
              onInput={(event) => setPlan({ ...plan, end_quiz_goal: optionalGoal((event.target as HTMLInputElement).value) })} />
          </label>
          <button class="btn primary" type="button" disabled={busy} onClick={approve}>
            {busy ? t("content.plan.approving") : t("content.plan.approve")}
          </button>
        </>
      )}
    </section>
  );
}
