import { useEffect, useMemo, useRef, useState } from "preact/hooks";
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
import {
  deckCannotReportSlides,
  planCheckpointForSlide,
  shouldAutoAskPlanCheckpoint
} from "../features/live/planAutoAsk";
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

function sortedPlannedCheckpoints(checkpoints: PlanCheckpoint[]): PlanCheckpoint[] {
  return checkpoints
    .filter((checkpoint) => checkpoint.state === "planned")
    .slice()
    .sort((a, b) => {
      if (a.slide_hint === null && b.slide_hint === null) return a.position - b.position;
      if (a.slide_hint === null) return 1;
      if (b.slide_hint === null) return -1;
      return a.slide_hint - b.slide_hint;
    });
}

function checkpointLabel(checkpoint: PlanCheckpoint): string {
  if (checkpoint.slide_hint === null) return checkpoint.topic;
  if (checkpoint.topic === `Slide ${checkpoint.slide_hint}`) {
    return t("run.plan.slideOnlyOption", { slide: checkpoint.slide_hint });
  }
  return t("run.plan.slideOption", { slide: checkpoint.slide_hint, topic: checkpoint.topic });
}

export function ClassQuestionPlanBoard({
  classSessionId,
  isLive,
  autoAsk,
  deckReady,
  deckSlide,
  deckTeachingSlide,
  onRefresh
}: {
  classSessionId: string;
  isLive: boolean;
  /** The professor's "send each question when I reach its slide" switch. */
  autoAsk: boolean;
  deckReady: boolean;
  deckSlide: number | null;
  deckTeachingSlide: number | null;
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
  const [selectedCheckpointId, setSelectedCheckpointId] = useState("");
  // Latched the instant a poll is chosen for an automatic push, before any
  // await. A plan refresh, a re-render, or paging back must not push it twice.
  const autoAskedCheckpoints = useRef<Set<string>>(new Set());

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
    autoAskedCheckpoints.current = new Set();
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

  useEffect(() => {
    const planned = sortedPlannedCheckpoints(plan?.checkpoints || []);
    setSelectedCheckpointId((current) =>
      planned.some((checkpoint) => checkpoint.id === current) ? current : (planned[0]?.id || "")
    );
  }, [plan]);

  // The professor teaches from the deck in fullscreen. When the slide a poll was
  // planned for comes up, ask it — through exactly the path the Ask now button
  // uses, so nothing here can do what a click could not.
  useEffect(() => {
    if (!autoAsk || !isLive) return;
    const checkpoint = planCheckpointForSlide(plan?.checkpoints || [], {
      slide: deckSlide,
      teachingSlide: deckTeachingSlide
    });
    if (!checkpoint) return;
    const candidates = candidateQuestions(checkpoint);
    const questionId =
      selectedCandidateIds[checkpoint.id] || candidates[0]?.id || "";
    if (
      !shouldAutoAskPlanCheckpoint({
        enabled: autoAsk,
        isLive,
        questionId,
        alreadyAsked: autoAskedCheckpoints.current.has(checkpoint.id)
      })
    ) {
      return;
    }
    autoAskedCheckpoints.current.add(checkpoint.id);
    void handleAskNow(checkpoint, questionId);
  }, [autoAsk, isLive, deckSlide, deckTeachingSlide, plan, questions]);

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

  const plannedCheckpoints = sortedPlannedCheckpoints(plan?.checkpoints || []);
  const historyCheckpoints = (plan?.checkpoints || []).filter(
    (checkpoint) => checkpoint.state === "sent" || checkpoint.state === "skipped"
  );
  const selectedCheckpoint = plannedCheckpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) || null;
  const resolvedCandidateQuestions = selectedCheckpoint ? candidateQuestions(selectedCheckpoint) : [];
  const selectedCandidateId = selectedCheckpoint
    ? selectedCandidateIds[selectedCheckpoint.id] || resolvedCandidateQuestions[0]?.id || ""
    : "";
  const selectedQuestion = resolvedCandidateQuestions.find((question) => question.id === selectedCandidateId)
    || resolvedCandidateQuestions[0]
    || null;
  const selectedHasStaleCandidates = selectedCheckpoint
    ? selectedCheckpoint.candidate_question_ids.length > resolvedCandidateQuestions.length
    : false;
  const nextAutoAsk = plannedCheckpoints.find(
    (checkpoint) => typeof checkpoint.slide_hint === "number"
  );
  const deckIsSilent = deckCannotReportSlides({
    enabled: autoAsk,
    deckReady,
    position: { slide: deckSlide, teachingSlide: deckTeachingSlide },
    checkpoints: plan?.checkpoints || []
  });

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

      {/* The professor cannot see this panel while presenting, so it has to be
          verifiable *before* class: is the deck talking, and which poll is armed
          next. A silent deck is the one failure that looks exactly like nothing
          happening, so it gets said out loud rather than left to guess. */}
      {isLive && plan ? (
        deckIsSilent ? (
          <p class="error-text" role="alert">{t("run.plan.deckSilent")}</p>
        ) : autoAsk ? (
          <p class="hint" role="status">
            {deckSlide === null
              ? t("run.plan.deckWaiting")
              : t("run.plan.deckOnSlide", { slide: deckSlide })}
            {nextAutoAsk?.slide_hint != null
              ? ` · ${t("run.plan.autoAskNext", {
                slide: nextAutoAsk.slide_hint,
                topic: nextAutoAsk.topic
              })}`
              : ` · ${t("run.plan.autoAskNoneLeft")}`}
          </p>
        ) : null
      ) : null}

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

          {plannedCheckpoints.length ? (
            <div class="stack">
              <label class="field">
                {t("run.plan.pickSlideLabel")}
                <select
                  value={selectedCheckpointId}
                  onChange={(event) => {
                    const nextId = (event.target as HTMLSelectElement).value;
                    setSelectedCheckpointId(nextId);
                    setEditor((current) =>
                      current && current.mode === "edit" && current.checkpointId !== nextId ? null : current
                    );
                  }}
                >
                  {plannedCheckpoints.map((checkpoint) => (
                    <option key={checkpoint.id} value={checkpoint.id}>
                      {checkpointLabel(checkpoint)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedCheckpoint ? (
                editor?.mode === "edit" && editor.checkpointId === selectedCheckpoint.id ? (
                  <CheckpointEditor
                    draft={editor.draft}
                    questions={questions || []}
                    busy={busy}
                    onDraft={updateDraft}
                    onToggleCandidate={toggleDraftCandidate}
                    onCancel={() => setEditor(null)}
                    onSave={() => void handleSaveCheckpoint()}
                  />
                ) : (
                  <article class="card stack" key={selectedCheckpoint.id}>
                    <div class="row" style="justify-content: space-between; align-items: flex-start;">
                      <div>
                        {selectedCheckpoint.slide_hint !== null ? (
                          <p class="hint">{t("run.plan.afterSlide", { slide: selectedCheckpoint.slide_hint })}</p>
                        ) : null}
                        {selectedCheckpoint.notes ? <p class="hint">{selectedCheckpoint.notes}</p> : null}
                      </div>
                      <div class="row">
                        <button
                          class="btn quiet"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setEditor({ mode: "edit", checkpointId: selectedCheckpoint.id, draft: toDraft(selectedCheckpoint) })
                          }
                        >
                          {t("run.plan.edit")}
                        </button>
                        <button
                          class="btn quiet"
                          type="button"
                          disabled={busy}
                          onClick={() => void handleRemoveCheckpoint(selectedCheckpoint)}
                        >
                          {t("run.plan.remove")}
                        </button>
                      </div>
                    </div>

                    {resolvedCandidateQuestions.length ? (
                      <>
                        <label class="field">
                          {t("run.plan.candidatesLabel")}
                          <select
                            value={selectedCandidateId}
                            onChange={(event) =>
                              setSelectedCandidateIds((current) => ({
                                ...current,
                                [selectedCheckpoint.id]: (event.target as HTMLSelectElement).value
                              }))}
                          >
                            {resolvedCandidateQuestions.map((question) => (
                              <option key={question.id} value={question.id}>
                                {question.prompt}
                              </option>
                            ))}
                          </select>
                        </label>
                        {selectedHasStaleCandidates ? (
                          <p class="hint">{t("run.plan.staleCandidates")}</p>
                        ) : null}
                        {selectedQuestion?.prompt_es ? (
                          <p class="hint">{selectedQuestion.prompt_es}</p>
                        ) : null}
                      </>
                    ) : (
                      <p class="hint">
                        {selectedHasStaleCandidates ? t("run.plan.staleCandidates") : t("run.plan.noCandidates")}
                      </p>
                    )}

                    <div class="row" style="justify-content: flex-end;">
                      <button
                        class="btn"
                        type="button"
                        disabled={busy || !isLive || !selectedQuestion}
                        onClick={() => selectedQuestion ? void handleAskNow(selectedCheckpoint, selectedQuestion.id) : undefined}
                      >
                        {t("run.plan.askNow")}
                      </button>
                    </div>
                  </article>
                )
              ) : null}
            </div>
          ) : (
            <p class="hint">{t("run.plan.noUpcoming")}</p>
          )}

          {historyCheckpoints.length ? (
            <details class="card muted">
              <summary>{t("run.plan.history")}</summary>
              <div class="stack">
                {historyCheckpoints.map((checkpoint) => (
                  <div class="row" style="justify-content: space-between; align-items: center;" key={checkpoint.id}>
                    <span>{checkpointLabel(checkpoint)}</span>
                    <span class={`pill ${checkpoint.state === "sent" ? "live" : "hidden"}`}>
                      {checkpoint.state === "sent" ? t("run.plan.alreadyAsked") : t("run.plan.skipped")}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
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
