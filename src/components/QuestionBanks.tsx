import { useEffect, useState } from "preact/hooks";
import {
  listBanks,
  prepareLegacyCheckpoints,
  type BackfillResult,
  type CheckpointBankSummary,
  type CheckpointCoverage
} from "../api/checkpoints";
import {
  canPrepareCheckpoints,
  canResumeCheckpointPreparation,
  questionBankReadiness
} from "../features/deck/bankReadiness";
import { t } from "../i18n";
import { activeRoles } from "../state/session";
import { QuestionBankReview } from "./QuestionBankReview";

export function QuestionBanks() {
  const [banks, setBanks] = useState<CheckpointBankSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshBanks() {
    const { banks: rows } = await listBanks();
    setBanks(rows);
    setError(null);
    return rows;
  }

  useEffect(() => {
    refreshBanks()
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : t("content.banks.loadFailed"));
      });
  }, []);

  if (error) {
    return <p class="error-text" role="alert">{error}</p>;
  }
  if (banks === null) {
    return <p class="hint" role="status">{t("content.banks.loading")}</p>;
  }
  if (!banks.length) {
    return (
      <div class="empty-state card">
        <h2>{t("content.banks.emptyTitle")}</h2>
        <p>{t("content.banks.emptyBody")}</p>
      </div>
    );
  }

  return (
    <div class="stack">
      <div>
        <h2>{t("content.banks.title")}</h2>
        <p class="hint">{t("content.banks.lede")}</p>
      </div>
      {banks.map((bank) => (
        <QuestionBankCard
          key={bank.bank_id}
          bank={bank}
          onRefresh={refreshBanks}
        />
      ))}
    </div>
  );
}

function QuestionBankCard({
  bank,
  onRefresh
}: {
  bank: CheckpointBankSummary;
  onRefresh: () => Promise<CheckpointBankSummary[]>;
}) {
  const readiness = questionBankReadiness(bank);
  const instructorCanPrepare = activeRoles.value.some((role) =>
    role === "platform_owner" || role === "instructor"
  );
  const flexible = bank.generation_validation_profile === "flexible";
  const legacy = !flexible;
  const hasDeck = Boolean(bank.content_item_id);
  const preparable = instructorCanPrepare
    && legacy
    && hasDeck
    && bank.checkpoint_coverage.length === 0
    && canPrepareCheckpoints(bank);
  const resumable = instructorCanPrepare && legacy && hasDeck
    && canResumeCheckpointPreparation(bank);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<BackfillResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const ready = readiness === "ready" || prepared !== null;
  const pending = readiness === "pending";
  const canRefreshDeck = instructorCanPrepare && legacy && hasDeck && ready && prepared === null;
  const checkpointCount = prepared?.checkpoint_count
    ?? bank.checkpoint_coverage.length;

  async function prepare() {
    if (!bank.content_item_id) return;
    setPreparing(true);
    setPrepareError(null);
    try {
      setPrepared(await prepareLegacyCheckpoints(bank.content_item_id));
      try {
        await onRefresh();
      } catch {
        // The successful response already proves readiness; refresh is best effort.
      }
    } catch (cause) {
      console.error("Checkpoint preparation failed", cause);
      setPrepareError(t("content.banks.prepareFailed"));
      try {
        const refreshed = await onRefresh();
        const durableBank = refreshed.find((row) => row.bank_id === bank.bank_id);
        if (durableBank && questionBankReadiness(durableBank) === "ready") {
          setPrepareError(null);
        }
      } catch {
        // Keep the card-level action error when durable-state refresh also fails.
      }
    } finally {
      setPreparing(false);
    }
  }

  return (
    <article class="card">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <h3>{bank.content_title || bank.title}</h3>
          <p class="hint">
            {t("content.banks.total", { count: bank.total })}
            {" · "}
            {t("content.questionCounts", bank.by_difficulty)}
          </p>
        </div>
        <span class={`pill ${ready ? "live" : "warn"}`}>
          {ready
            ? t("content.banks.ready")
            : pending
              ? t("content.banks.uploadPending")
              : t("content.banks.needsAttention")}
        </span>
      </div>

      {flexible ? (
        <p class="hint">
          {ready ? t("content.banks.flexibleReady") : t("content.banks.flexibleInvalid")}
          {" · "}
          {t("content.banks.sourcePages", { pages: bank.source_pdf_pages.join(", ") || "—" })}
        </p>
      ) : (
        <p class="hint">
          {t("content.banks.checkpointCount", { count: checkpointCount })}
        </p>
      )}

      {instructorCanPrepare ? (
        <button
          class="btn"
          type="button"
          onClick={() => setReviewOpen((open) => !open)}
        >
          {reviewOpen
            ? t("content.banks.closeReview")
            : t("content.banks.reviewQuestions")}
        </button>
      ) : null}

      {bank.checkpoint_coverage.length ? (
        <div class="stack" style="gap: 0.4rem;">
          {bank.checkpoint_coverage.map((checkpoint, index) => (
            <CheckpointRow
              key={`${checkpoint.segment_key}:${checkpoint.checkpoint_after_slide}`}
              checkpoint={checkpoint}
              index={index}
            />
          ))}
        </div>
      ) : null}

      {prepared ? (
        <div class="card muted" role="status">
          <p style="margin: 0;">
            {t("content.banks.prepared", {
              checkpointCount: prepared.checkpoint_count,
              questionCount: prepared.mapped_question_count
            })}
          </p>
        </div>
      ) : pending ? (
        <>
          <p class="error-text" role="alert">{t("content.banks.pendingUpload")}</p>
          {resumable ? (
            <button
              class="btn"
              type="button"
              disabled={preparing}
              onClick={prepare}
            >
              {preparing
                ? t("content.banks.resuming")
                : prepareError
                  ? t("content.banks.retry")
                  : t("content.banks.resume")}
            </button>
          ) : null}
        </>
      ) : preparable ? (
        <>
          <p class="error-text" role="alert">{t("content.banks.missingMetadata")}</p>
          <button
            class="btn"
            type="button"
            disabled={preparing}
            onClick={prepare}
          >
            {preparing
              ? t("content.banks.preparing")
              : t("content.banks.prepare")}
          </button>
        </>
      ) : canRefreshDeck ? (
        <>
          <p class="hint">{t("content.banks.readyBody")}</p>
          <button
            class="btn quiet"
            type="button"
            disabled={preparing}
            onClick={prepare}
          >
            {preparing
              ? t("content.banks.refreshing")
              : t("content.banks.refreshDeck")}
          </button>
        </>
      ) : !ready ? (
        <p class="error-text" role="alert">
          {flexible ? t("content.banks.flexibleInvalid") : t("content.banks.invalidMetadata")}
        </p>
      ) : (
        <p class="hint">{t("content.banks.readyBody")}</p>
      )}

      {prepareError ? (
        <p class="error-text" role="alert">{prepareError}</p>
      ) : null}

      {reviewOpen ? (
        <QuestionBankReview bankId={bank.bank_id} onChanged={onRefresh} />
      ) : null}
    </article>
  );
}

function CheckpointRow({
  checkpoint,
  index
}: {
  checkpoint: CheckpointCoverage;
  index: number;
}) {
  const difficulties = checkpoint.difficulties
    .map((difficulty) =>
      t(`quiz.difficulty.${difficulty}` as "quiz.difficulty.easy")
    )
    .join(" · ");

  return (
    <div class="card muted" style="padding: 0.65rem 0.8rem;">
      <p style="margin: 0;">
        <strong>
          {t("content.banks.checkpoint", {
            number: index + 1,
            slide: checkpoint.checkpoint_after_slide
          })}
        </strong>
      </p>
      <p class="hint" style="margin: 0;">
        {t("content.banks.candidates", { count: checkpoint.candidate_count })}
        {difficulties ? ` · ${difficulties}` : ""}
      </p>
    </div>
  );
}
