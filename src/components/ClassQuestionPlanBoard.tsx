import { useEffect, useMemo, useState } from "preact/hooks";
import {
  addClassQuestionPlanCheckpoint,
  classQuestionPlanErrorMessage,
  createClassQuestionPlan,
  getClassQuestionPlan,
  removeClassQuestionPlanCheckpoint,
  saveCheckpointCandidates,
  type ClassQuestionPlan,
  type PlanCheckpoint,
  updateClassQuestionPlanCheckpoint
} from "../api/classQuestionPlans";
import { listBanks, pushPlanQuestion, type BankSummary } from "../api/pulse";
import { listQuestions, type BankQuestion } from "../api/checkpoints";
import { t } from "../i18n";
import type { StringKey } from "../i18n/strings";

type CheckpointDraft = {
  topic: string;
  slideHint: string;
  notes: string;
  candidateQuestionIds: string[];
};

type EditorState =
  | { mode: "create"; draft: CheckpointDraft }
  | { mode: "edit"; checkpointId: string; draft: CheckpointDraft }
  | null;

const EMPTY_DRAFT: CheckpointDraft = {
  topic: "",
  slideHint: "",
  notes: "",
  candidateQuestionIds: []
};

function toDraft(checkpoint: PlanCheckpoint): CheckpointDraft {
  return {
    topic: checkpoint.topic,
    slideHint: checkpoint.slide_hint === null ? "" : String(checkpoint.slide_hint),
    notes: checkpoint.notes || "",
    candidateQuestionIds: checkpoint.candidate_question_ids
  };
}

function parseSlideHint(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  return Number(text);
}

function applySelectedCandidateDefaults(
  nextPlan: ClassQuestionPlan | null,
  previous: Record<string, string>,
  questionById: Map<string, BankQuestion>
) {
  if (!nextPlan) return {};
  const next: Record<string, string> = {};
  for (const checkpoint of nextPlan.checkpoints) {
    const resolvedCandidateQuestions = checkpoint.candidate_question_ids
      .map((questionId) => questionById.get(questionId))
      .filter((question): question is BankQuestion => Boolean(question));
    if (!resolvedCandidateQuestions.length) continue;
    const current = previous[checkpoint.id];
    next[checkpoint.id] = resolvedCandidateQuestions.some((question) => question.id === current)
      ? current
      : resolvedCandidateQuestions[0].id;
  }
  return next;
}

function localizedPlanError(cause: unknown, fallbackKey: StringKey) {
  const key = classQuestionPlanErrorMessage(cause);
  return t(key || fallbackKey);
}

export function ClassQuestionPlanBoard({
  classSessionId,
  isLive,
  onRefresh
}: {
  classSessionId: string;
  isLive: boolean;
  onRefresh?: () => void | Promise<void>;
}) {
  const [plan, setPlan] = useState<ClassQuestionPlan | null>(null);
  const [banks, setBanks] = useState<BankSummary[] | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<EditorState>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeBankId = plan?.question_bank_id || selectedBankId;
  const bankById = useMemo(
    () => new Map((banks || []).map((bank) => [bank.bank_id, bank])),
    [banks]
  );
  const questionById = useMemo(
    () => new Map((questions || []).map((question) => [question.id, question])),
    [questions]
  );

  function applyPlan(nextPlan: ClassQuestionPlan | null) {
    const nextQuestionById = new Map((questions || []).map((question) => [question.id, question]));
    setPlan(nextPlan);
    setSelectedCandidateIds((current) => applySelectedCandidateDefaults(nextPlan, current, nextQuestionById));
    if (nextPlan?.question_bank_id) {
      setSelectedBankId(nextPlan.question_bank_id);
    }
  }

  async function loadPlanAndBanks() {
    setLoadingPlan(true);
    setError(null);
    try {
      const [loadedPlan, bankResponse] = await Promise.all([
        getClassQuestionPlan(classSessionId),
        listBanks()
      ]);
      setBanks(bankResponse.banks);
      applyPlan(loadedPlan);
      setSelectedBankId((current) =>
        loadedPlan?.question_bank_id || current || bankResponse.banks[0]?.bank_id || ""
      );
    } catch (cause) {
      setError(localizedPlanError(cause, "run.plan.loadFailed"));
      setBanks([]);
      applyPlan(null);
    } finally {
      setLoadingPlan(false);
    }
  }

  useEffect(() => {
    setEditor(null);
    setNotice(null);
    void loadPlanAndBanks();
  }, [classSessionId]);

  useEffect(() => {
    if (!activeBankId) {
      setQuestions([]);
      return;
    }
    let cancelled = false;
    setLoadingQuestions(true);
    listQuestions(activeBankId)
      .then((response: { bank_id: string; bank_title: string; questions: BankQuestion[] }) => {
        if (cancelled) return;
        setQuestions(response.questions);
        setSelectedCandidateIds((current) =>
          applySelectedCandidateDefaults(
            plan,
            current,
            new Map(response.questions.map((question) => [question.id, question]))
          )
        );
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setQuestions([]);
        setError(localizedPlanError(cause, "run.plan.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoadingQuestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBankId]);

  async function refreshPlan() {
    const nextPlan = await getClassQuestionPlan(classSessionId);
    applyPlan(nextPlan);
    return nextPlan;
  }

  function updateDraft(next: Partial<CheckpointDraft>) {
    setEditor((current) => current
      ? { ...current, draft: { ...current.draft, ...next } }
      : current);
  }

  function toggleDraftCandidate(questionId: string) {
    setEditor((current) => {
      if (!current) return current;
      const selected = current.draft.candidateQuestionIds.includes(questionId);
      return {
        ...current,
        draft: {
          ...current.draft,
          candidateQuestionIds: selected
            ? current.draft.candidateQuestionIds.filter((id) => id !== questionId)
            : [...current.draft.candidateQuestionIds, questionId]
        }
      };
    });
  }

  async function handleCreatePlan() {
    if (!selectedBankId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const createdPlan = await createClassQuestionPlan({
        class_session_id: classSessionId,
        question_bank_id: selectedBankId
      });
      applyPlan(createdPlan);
      setNotice(null);
    } catch (cause) {
      setError(localizedPlanError(cause, "run.plan.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveCheckpoint() {
    if (!plan || !editor) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        topic: editor.draft.topic,
        slide_hint: parseSlideHint(editor.draft.slideHint),
        notes: editor.draft.notes.trim() || null
      };
      let nextPlan: ClassQuestionPlan;
      let checkpointId = "";

      if (editor.mode === "create") {
        const beforeIds = new Set(plan.checkpoints.map((checkpoint) => checkpoint.id));
        nextPlan = await addClassQuestionPlanCheckpoint({
          plan_id: plan.id,
          ...payload
        });
        checkpointId = nextPlan.checkpoints.find((checkpoint) => !beforeIds.has(checkpoint.id))?.id || "";
      } else {
        checkpointId = editor.checkpointId;
        nextPlan = await updateClassQuestionPlanCheckpoint({
          checkpoint_id: editor.checkpointId,
          ...payload
        });
      }

      if (checkpointId) {
        nextPlan = await saveCheckpointCandidates({
          checkpoint_id: checkpointId,
          question_ids: editor.draft.candidateQuestionIds
        });
      }

      applyPlan(nextPlan);
      setEditor(null);
    } catch (cause) {
      setError(localizedPlanError(cause, "run.plan.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveCheckpoint(checkpoint: PlanCheckpoint) {
    if (!confirm(t("run.plan.removeConfirm"))) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const nextPlan = await removeClassQuestionPlanCheckpoint(checkpoint.id);
      applyPlan(nextPlan);
      if (editor && editor.mode === "edit" && editor.checkpointId === checkpoint.id) {
        setEditor(null);
      }
    } catch (cause) {
      setError(localizedPlanError(cause, "run.plan.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAskNow(checkpoint: PlanCheckpoint, questionId: string) {
    if (!questionId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await pushPlanQuestion({
        class_session_id: classSessionId,
        question_id: questionId,
        plan_checkpoint_id: checkpoint.id
      });
      await refreshPlan();
      await onRefresh?.();
    } catch (cause) {
      setError(localizedPlanError(cause, "run.plan.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function candidateQuestions(checkpoint: PlanCheckpoint) {
    return checkpoint.candidate_question_ids
      .map((questionId) => questionById.get(questionId))
      .filter((question): question is BankQuestion => Boolean(question));
  }

  return (
    <section class="card muted stack">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <p class="eyebrow">{t("run.checkpoint.eyebrow")}</p>
          <h2>{t("run.plan.title")}</h2>
        </div>
        {plan?.question_bank_id ? (
          <span class="pill hidden">{bankById.get(plan.question_bank_id)?.title || t("run.plan.bankLabel")}</span>
        ) : null}
      </div>

      {error ? <p class="error-text" role="alert">{error}</p> : null}
      {notice ? <p class="hint" role="status">{notice}</p> : null}

      {loadingPlan || banks === null ? (
        <p class="hint" role="status">{t("run.loadingBanks")}</p>
      ) : !plan ? (
        <div class="stack">
          <p class="hint">{t("run.plan.noPlan")}</p>
          <p class="hint">{t("run.plan.createHint")}</p>
          {!banks.length ? (
            <p class="hint">{t("content.banks.emptyTitle")}</p>
          ) : (
            <>
              <label class="field">
                {t("run.plan.bankLabel")}
                <select
                  value={selectedBankId}
                  onChange={(event) => setSelectedBankId((event.target as HTMLSelectElement).value)}
                >
                  {banks.map((bank) => (
                    <option key={bank.bank_id} value={bank.bank_id}>
                      {bank.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                class="btn"
                type="button"
                disabled={busy || !selectedBankId}
                onClick={() => void handleCreatePlan()}
              >
                {t("run.plan.create")}
              </button>
            </>
          )}
        </div>
      ) : (
        <div class="stack">
          <div class="row" style="justify-content: space-between; align-items: center;">
            <div>
              <p class="hint">
                {loadingQuestions
                  ? t("content.banks.loading")
                  : bankById.get(plan.question_bank_id || "")?.title || ""}
              </p>
              {!isLive ? <p class="hint">{t("run.plan.liveRequired")}</p> : null}
            </div>
            {editor === null ? (
              <button
                class="btn quiet"
                type="button"
                disabled={busy}
                onClick={() => setEditor({ mode: "create", draft: EMPTY_DRAFT })}
              >
                {t("run.plan.addCheckpoint")}
              </button>
            ) : null}
          </div>

          {editor?.mode === "create" ? (
            <CheckpointEditor
              draft={editor.draft}
              questions={questions || []}
              busy={busy}
              onDraft={updateDraft}
              onToggleCandidate={toggleDraftCandidate}
              onCancel={() => setEditor(null)}
              onSave={() => void handleSaveCheckpoint()}
            />
          ) : null}

          {plan.checkpoints.length ? (
            <div class="stack">
              {plan.checkpoints.map((checkpoint) => {
                const editing = editor?.mode === "edit" && editor.checkpointId === checkpoint.id;
                const resolvedCandidateQuestions = candidateQuestions(checkpoint);
                const selectedCandidateId = selectedCandidateIds[checkpoint.id] || resolvedCandidateQuestions[0]?.id || "";
                const selectedQuestion = resolvedCandidateQuestions.find(
                  (question) => question.id === selectedCandidateId
                ) || resolvedCandidateQuestions[0] || null;
                const isHistorical = checkpoint.state === "sent" || checkpoint.state === "skipped";
                const hasStaleCandidates =
                  checkpoint.candidate_question_ids.length > resolvedCandidateQuestions.length;

                return (
                  <article class="card stack" key={checkpoint.id}>
                    <div class="row" style="justify-content: space-between; align-items: flex-start;">
                      <div>
                        <p class="eyebrow">{t("run.plan.checkpointNumber", { number: checkpoint.position })}</p>
                        <h3 style="margin: 0.2rem 0 0;">{checkpoint.topic}</h3>
                        {checkpoint.slide_hint !== null ? (
                          <p class="hint">{t("run.plan.afterSlide", { slide: checkpoint.slide_hint })}</p>
                        ) : null}
                        {checkpoint.notes ? <p class="hint">{checkpoint.notes}</p> : null}
                      </div>
                      {checkpoint.state === "sent" ? (
                        <span class="pill live">{t("run.plan.alreadyAsked")}</span>
                      ) : checkpoint.state === "skipped" ? (
                        <span class="pill hidden">{t("run.plan.skipped")}</span>
                      ) : !editing ? (
                        <div class="row">
                          <button
                            class="btn quiet"
                            type="button"
                            disabled={busy}
                            onClick={() => setEditor({ mode: "edit", checkpointId: checkpoint.id, draft: toDraft(checkpoint) })}
                          >
                            {t("run.plan.edit")}
                          </button>
                          <button
                            class="btn quiet"
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRemoveCheckpoint(checkpoint)}
                          >
                            {t("run.plan.remove")}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {editing ? (
                      <CheckpointEditor
                        draft={editor.draft}
                        questions={questions || []}
                        busy={busy}
                        onDraft={updateDraft}
                        onToggleCandidate={toggleDraftCandidate}
                        onCancel={() => setEditor(null)}
                        onSave={() => void handleSaveCheckpoint()}
                      />
                    ) : isHistorical ? null : (
                      <div class="stack">
                        {resolvedCandidateQuestions.length ? (
                          <>
                            <label class="field">
                              {t("run.plan.candidatesLabel")}
                              <select
                                value={selectedCandidateId}
                                onChange={(event) =>
                                  setSelectedCandidateIds((current) => ({
                                    ...current,
                                    [checkpoint.id]: (event.target as HTMLSelectElement).value
                                  }))}
                              >
                                {resolvedCandidateQuestions.map((question) => (
                                  <option key={question.id} value={question.id}>
                                    {question.prompt}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {hasStaleCandidates ? (
                              <p class="hint">{t("run.plan.staleCandidates")}</p>
                            ) : null}
                            {selectedQuestion?.prompt_es ? (
                              <p class="hint">{selectedQuestion.prompt_es}</p>
                            ) : null}
                          </>
                        ) : (
                          <p class="hint">
                            {hasStaleCandidates ? t("run.plan.staleCandidates") : t("run.plan.noCandidates")}
                          </p>
                        )}

                        {!isHistorical ? (
                          <div class="row" style="justify-content: flex-end;">
                            <button
                              class="btn"
                              type="button"
                              disabled={busy || !isLive || !selectedQuestion}
                              onClick={() => selectedQuestion ? void handleAskNow(checkpoint, selectedQuestion.id) : undefined}
                            >
                              {t("run.plan.askNow")}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p class="hint">{t("run.plan.empty")}</p>
          )}
        </div>
      )}
    </section>
  );
}

function CheckpointEditor({
  draft,
  questions,
  busy,
  onDraft,
  onToggleCandidate,
  onCancel,
  onSave
}: {
  draft: CheckpointDraft;
  questions: BankQuestion[];
  busy: boolean;
  onDraft: (next: Partial<CheckpointDraft>) => void;
  onToggleCandidate: (questionId: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div class="stack" style="border-top: 1px solid var(--border); padding-top: 0.8rem;">
      <div class="grid-2">
        <label class="field">
          {t("run.plan.topicLabel")}
          <input
            type="text"
            value={draft.topic}
            onInput={(event) => onDraft({ topic: (event.target as HTMLInputElement).value })}
          />
        </label>
        <label class="field">
          {t("run.plan.slideHintLabel")}
          <input
            type="number"
            min="1"
            value={draft.slideHint}
            onInput={(event) => onDraft({ slideHint: (event.target as HTMLInputElement).value })}
          />
        </label>
      </div>

      <label class="field">
        {t("run.plan.notesLabel")}
        <textarea
          rows={3}
          value={draft.notes}
          onInput={(event) => onDraft({ notes: (event.target as HTMLTextAreaElement).value })}
        />
      </label>

      <div class="stack">
        <strong>{t("run.plan.candidatesLabel")}</strong>
        {questions.length ? (
          <div class="stack" style="max-height: 14rem; overflow: auto;">
            {questions.map((question) => {
              const checked = draft.candidateQuestionIds.includes(question.id);
              return (
                <label
                  class="checkbox-label"
                  key={question.id}
                  style="display: grid; grid-template-columns: auto 1fr; align-items: start; gap: 0.6rem;"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCandidate(question.id)}
                  />
                  <span>
                    <strong>{question.prompt}</strong>
                    {question.prompt_es ? <small>{question.prompt_es}</small> : null}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p class="hint">{t("run.plan.noCandidates")}</p>
        )}
      </div>

      <div class="row" style="justify-content: flex-end;">
        <button class="btn quiet" type="button" disabled={busy} onClick={onCancel}>
          {t("run.plan.cancel")}
        </button>
        <button class="btn" type="button" disabled={busy} onClick={onSave}>
          {t("run.plan.save")}
        </button>
      </div>
    </div>
  );
}
