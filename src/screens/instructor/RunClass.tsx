// Run class — the instructor's live screen.
//
// Deliberately one thing at a time: either you are picking a question, or one
// is on screen and your only choices are "show the answer" and "close". No
// dashboard, no state-machine vocabulary, no way to have two questions live.
//
// Questions always come from the generated bank — the instructor never types a
// stem or invents distractors. Picking "Which class" + a difficulty (or
// "Surprise me") draws one question server-side; the same click sends it.
import { useEffect, useRef, useState } from "preact/hooks";
import QRCode from "qrcode";
import { context, refreshContext } from "../../state/session";
import { t, lang } from "../../i18n";
import {
  pushPulse, revealPulse, closePulse, pulseResults, listBanks, drawQuestion,
  type PulseRound, type PulseResults, type BankSummary, type DrawnQuestion
} from "../../api/pulse";
import { EndOfClass } from "./EndOfClass";
import { endClassSession } from "../../api/session";
import { currentClassQuiz, closeClassQuiz } from "../../api/quiz";
import { canJoinClassSession } from "../../features/join/sessionState";

const POLL_MS = 3000;
type Difficulty = "easy" | "medium" | "hard";

function secondsLeft(endsAt?: string): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 1000));
}

export function RunClass({ sessionId }: { sessionId?: string }) {
  const ctx = context.value;
  const session = (ctx?.teacher_sessions ?? []).find((s) => s.session_id === sessionId);

  const [round, setRound] = useState<PulseRound | null>(null);
  const [results, setResults] = useState<PulseResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  // Bank selection
  const [banks, setBanks] = useState<BankSummary[] | null>(null);
  const [bankSlug, setBankSlug] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [drawn, setDrawn] = useState<DrawnQuestion | null>(null);
  const [askedKeys, setAskedKeys] = useState<string[]>([]);
  const [limit, setLimit] = useState(60);
  const [points, setPoints] = useState(1);

  const poll = useRef<number | undefined>(undefined);
  const joinUrl = session ? `${location.origin}/join/${session.join_code}` : "";

  useEffect(() => {
    if (!joinUrl) return;
    setQrError(false);
    QRCode.toDataURL(joinUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240
    })
      .then(setQrDataUrl)
      .catch(() => {
        setQrDataUrl(null);
        setQrError(true);
      });
  }, [joinUrl]);

  useEffect(() => {
    listBanks()
      .then(({ banks: list }) => {
        setBanks(list);
        // Default to the lecture this class session was created for, if it's in the bank list.
        const released = (ctx?.releases ?? []).find((r) => r.class_session_id === sessionId);
        const match = list.find((b) => b.content_slug === released?.slug) ?? list[0];
        if (match) setBankSlug(match.content_slug);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("run.pushFailed")));
  }, []);

  // While a question is on screen, keep the counts and the countdown moving.
  useEffect(() => {
    clearInterval(poll.current);
    if (!round || round.state === "closed") return;
    poll.current = setInterval(async () => {
      try {
        setResults(await pulseResults(round.round_id));
      } catch {
        // A blip in the room's WiFi must not break the class.
      }
    }, POLL_MS) as unknown as number;
    return () => clearInterval(poll.current);
  }, [round?.round_id, round?.state]);

  if (!sessionId || !session) {
    return (
      <div class="empty-state card">
        <h3>{t("run.noSession")}</h3>
        <p>{t("run.noSessionBody")}</p>
        <a class="btn" href="/teach">{t("run.backToHome")}</a>
      </div>
    );
  }

  const activeBank = banks?.find((b) => b.content_slug === bankSlug) ?? null;
  const bankHasQuestions = (activeBank?.total ?? 0) > 0;

  async function onDraw() {
    setError(null);
    setBusy(true);
    try {
      const { question } = await drawQuestion({
        content_slug: bankSlug,
        difficulty: difficulty || undefined,
        exclude_keys: askedKeys
      });
      setDrawn(question);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("run.drawFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onPush() {
    if (!drawn) return;
    setError(null);
    setBusy(true);
    try {
      const useSpanish = lang.value === "es";
      const { round: pushed } = await pushPulse({
        class_session_id: sessionId!,
        question: {
          text: (useSpanish && drawn.prompt_es) || drawn.prompt,
          options: drawn.options.map((option) => ({
            key: option.key,
            text: (useSpanish && option.text_es) || option.text
          })),
          correct_key: drawn.options.find((option) => option.is_correct)!.key
        },
        time_limit_seconds: limit,
        points
      });
      setRound(pushed);
      setResults(null);
      setAskedKeys((prev) => [...prev, drawn.generation_key]);
      setDrawn(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("run.pushFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onReveal() {
    if (!round) return;
    setBusy(true);
    try {
      const response = await revealPulse(round.round_id);
      setRound(response.round);
      setResults(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("run.pushFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onClose() {
    if (!round) return;
    setBusy(true);
    try {
      await closePulse(round.round_id);
      setRound(null);
      setResults(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("run.pushFailed"));
    } finally {
      setBusy(false);
    }
  }

  const remaining = secondsLeft(round?.ends_at);
  const live = round && round.state !== "closed";
  const ended = session.state === "closed";
  const joinable = canJoinClassSession(session.state);

  // Ending the class is the one irreversible control on this screen, so it
  // names its consequences first and then actually tidies up: an open question
  // and a running quiz are closed too, otherwise they would sit there live
  // against a class that is over.
  async function onEndClass() {
    if (!confirm(t("run.endConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      if (round && round.state !== "closed") {
        await closePulse(round.round_id).catch(() => {});
      }
      if (bankSlug) {
        const quiz = await currentClassQuiz({ class_session_id: sessionId!, content_slug: bankSlug }).catch(() => null);
        if (quiz?.instance_id) await closeClassQuiz(quiz.instance_id).catch(() => {});
      }
      await endClassSession(sessionId!);
      await refreshContext();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("run.endFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack">
      <div class="row" style="justify-content: space-between;">
        <div>
          <p class="eyebrow">{t("run.eyebrow")}</p>
          <h1>{session.title || t("teach.sessionN", { n: session.sequence_number })}</h1>
        </div>
        <a class="btn quiet" href="/teach">← {t("run.backToHome")}</a>
      </div>

      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {joinable ? (
        <div class="card">
          <div class="grid-2">
            <div>
              <p class="eyebrow">{t("run.join.eyebrow")}</p>
              <h2>{t("run.join.title")}</h2>
              <p class="hint">{t("run.join.body")}</p>
              <p>
                <strong>{t("run.join.code", { code: session.join_code })}</strong>
              </p>
              <a href={joinUrl}>{joinUrl}</a>
            </div>
            <div>
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  width="240"
                  height="240"
                  alt={t("run.join.qrAlt")}
                />
              ) : qrError ? (
                <p class="error-text" role="alert">{t("run.join.qrFailed")}</p>
              ) : (
                <p class="hint" role="status">{t("run.join.qrLoading")}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!live ? (
        <div class="card">
          <h2>{t("run.step.pulse")}</h2>
          <p class="hint">{t("run.step.pulseBody")}</p>

          {banks === null ? (
            <p class="hint">{t("run.loadingBanks")}</p>
          ) : banks.length === 0 ? (
            <p class="hint">{t("run.noBank")}</p>
          ) : (
            <>
              <div class="grid-2">
                <label class="field">
                  {t("run.pickLecture")}
                  <select
                    value={bankSlug}
                    onChange={(e) => {
                      setBankSlug((e.target as HTMLSelectElement).value);
                      setDrawn(null);
                      setAskedKeys([]);
                    }}
                  >
                    {banks.map((bank) => (
                      <option value={bank.content_slug}>{bank.content_title}</option>
                    ))}
                  </select>
                </label>
                <label class="field">
                  {t("run.pickDifficulty")}
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty((e.target as HTMLSelectElement).value as Difficulty | "")}
                  >
                    <option value="">{t("run.anyDifficulty")}</option>
                    <option value="easy">{t("difficulty.easy")}</option>
                    <option value="medium">{t("difficulty.medium")}</option>
                    <option value="hard">{t("difficulty.hard")}</option>
                  </select>
                </label>
              </div>

              {activeBank ? (
                <p class="hint">
                  {t("run.bankCount", {
                    total: activeBank.total,
                    easy: activeBank.by_difficulty.easy,
                    medium: activeBank.by_difficulty.medium,
                    hard: activeBank.by_difficulty.hard
                  })}
                  {askedKeys.length ? ` · ${t("run.askedAlready", { count: askedKeys.length })}` : ""}
                </p>
              ) : null}

              {!drawn ? (
                <button class="btn primary" type="button" disabled={busy || !bankHasQuestions} onClick={onDraw}>
                  {busy ? t("run.drawing") : t("run.draw")}
                </button>
              ) : (
                <div class="card muted">
                  <p class="eyebrow">
                    {t("run.preview")} · {t(`difficulty.${drawn.difficulty}`)}
                  </p>
                  <h3>{(lang.value === "es" && drawn.prompt_es) || drawn.prompt}</h3>
                  <div class="stack" style="gap: 0.3rem;">
                    {drawn.options.map((option) => (
                      <div class={`pulse-choice${option.is_correct ? " correct" : ""}`}>
                        {(lang.value === "es" && option.text_es) || option.text}
                        {option.is_correct ? ` ✓ ${t("run.correctAnswer")}` : ""}
                      </div>
                    ))}
                  </div>

                  <div class="grid-2">
                    <label class="field">
                      {t("run.seconds")}
                      <input
                        type="number" min="10" max="900" value={limit}
                        onInput={(e) => setLimit(Number((e.target as HTMLInputElement).value) || 60)}
                      />
                    </label>
                    <label class="field">
                      {t("run.points")}
                      <input
                        type="number" min="0" max="100" step="0.5" value={points}
                        onInput={(e) => setPoints(Number((e.target as HTMLInputElement).value) || 0)}
                      />
                    </label>
                  </div>

                  <div class="row">
                    <button class="btn primary" type="button" disabled={busy} onClick={onPush}>
                      {busy ? t("run.pushing") : t("run.push")}
                    </button>
                    <button class="btn" type="button" disabled={busy} onClick={onDraw}>
                      {t("run.drawAgain")}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div class="card" style="border-color: var(--primary); border-width: 2px;">
            <div class="row" style="justify-content: space-between;">
              <p class="eyebrow">
                {round!.state === "revealed" ? t("run.revealed") : t("run.liveQuestion")}
              </p>
              <span class={`pill ${remaining > 0 && round!.state === "open" ? "live" : "hidden"}`}>
                {round!.state === "open"
                  ? remaining > 0 ? t("run.timeLeft", { seconds: remaining }) : t("run.timeUp")
                  : t("run.revealed")}
              </span>
            </div>
            <h2>{round!.text}</h2>

            <div class="stack" style="gap: 0.35rem;">
              {(results?.distribution ?? round!.options.map((o) => ({ ...o, count: 0 }))).map((option) => {
                const total = Math.max(1, results?.answered ?? 0);
                const share = Math.round(((option.count ?? 0) / total) * 100);
                const isCorrect = round!.state === "revealed" && option.key === round!.correct_key;
                return (
                  <div class={`pulse-bar ${isCorrect ? "correct" : ""}`}>
                    <div class="pulse-bar-fill" style={`width: ${results?.answered ? share : 0}%`} />
                    <span class="pulse-bar-label">
                      {option.text}
                      {isCorrect ? ` ✓ ${t("run.correctAnswer")}` : ""}
                    </span>
                    <span class="pulse-bar-count">{option.count ?? 0}</span>
                  </div>
                );
              })}
            </div>

            <p class="hint">
              {t("run.answeredOf", {
                answered: results?.answered ?? 0,
                enrolled: results?.enrolled ?? 0
              })}
              {round!.state === "revealed" && results
                ? ` · ${t("run.correctCount", { correct: results.correct })}`
                : ""}
            </p>

            <div class="row">
              {round!.state === "open" ? (
                <button class="btn primary" type="button" disabled={busy} onClick={onReveal}>
                  {t("run.reveal")}
                </button>
              ) : (
                <button class="btn primary" type="button" disabled={busy} onClick={onClose}>
                  {t("run.askAnother")}
                </button>
              )}
              <button class="btn" type="button" disabled={busy} onClick={onClose}>
                {t("run.close")}
              </button>
            </div>
          </div>

          {round!.state === "revealed" && results?.respondents?.length ? (
            <>
              <h2>{t("run.whoAnswered")}</h2>
              <div class="table-scroll">
                <table class="data">
                  <thead>
                    <tr>
                      <th>{t("people.col.name")}</th>
                      <th>{t("run.theirAnswer")}</th>
                      <th>{t("run.points")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.respondents.map((person) => (
                      <tr>
                        <td>{person.name}</td>
                        <td>
                          {results.distribution.find((d) => d.key === person.option_key)?.text ?? "—"}
                          {person.is_correct ? " ✓" : ""}
                        </td>
                        <td class="num">{person.points_awarded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : round!.state === "revealed" ? (
            <p class="hint">{t("run.nobodyYet")}</p>
          ) : null}
        </>
      )}

      {!live && bankSlug ? <EndOfClass sessionId={sessionId!} contentSlug={bankSlug} /> : null}

      {!live ? (
        <div class="card">
          <h2>{t("run.step.end")}</h2>
          <p class="hint">{ended ? t("run.endedBody") : t("run.step.endBody")}</p>
          {ended ? (
            <span class="pill hidden">{t("run.ended")}</span>
          ) : (
            <button class="btn danger" type="button" disabled={busy} onClick={onEndClass}>
              {t("run.endClass")}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
