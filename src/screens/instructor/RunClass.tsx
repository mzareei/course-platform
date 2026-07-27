// Run class — the instructor's live screen.
//
// Deliberately one thing at a time: either you are composing a question, or one
// is on screen and your only choices are "show the answer" and "close". No
// dashboard, no state-machine vocabulary, no way to have two questions live.
import { useEffect, useRef, useState } from "preact/hooks";
import { context } from "../../state/session";
import { t } from "../../i18n";
import {
  pushPulse, revealPulse, closePulse, pulseResults,
  type PulseRound, type PulseResults
} from "../../api/pulse";

const POLL_MS = 3000;

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
  const [tick, setTick] = useState(0);

  // Composer state
  const [text, setText] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [limit, setLimit] = useState(60);
  const [points, setPoints] = useState(1);

  const poll = useRef<number | undefined>(undefined);

  // While a question is on screen, keep the counts and the countdown moving.
  useEffect(() => {
    clearInterval(poll.current);
    if (!round || round.state === "closed") return;
    poll.current = setInterval(async () => {
      setTick((n) => n + 1);
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

  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
  const canPush = text.trim().length >= 4 && cleanOptions.length >= 2 && correctIndex < cleanOptions.length;

  async function onPush() {
    setError(null);
    setBusy(true);
    try {
      const payloadOptions = options
        .map((value, index) => ({ key: `o${index + 1}`, text: value.trim(), index }))
        .filter((option) => option.text);
      const correct = payloadOptions.find((option) => option.index === correctIndex) ?? payloadOptions[0];
      const { round: pushed } = await pushPulse({
        class_session_id: sessionId!,
        question: {
          text: text.trim(),
          options: payloadOptions.map(({ key, text: optionText }) => ({ key, text: optionText })),
          correct_key: correct.key
        },
        time_limit_seconds: limit,
        points
      });
      setRound(pushed);
      setResults(null);
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
      setText("");
      setOptions(["", "", "", ""]);
      setCorrectIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("run.pushFailed"));
    } finally {
      setBusy(false);
    }
  }

  const remaining = secondsLeft(round?.ends_at);
  const live = round && round.state !== "closed";

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

      {!live ? (
        <div class="card">
          <h2>{t("run.step.pulse")}</h2>
          <p class="hint">{t("run.step.pulseBody")}</p>

          <label class="field">
            {t("run.question")}
            <textarea
              value={text}
              placeholder={t("run.questionPlaceholder")}
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
              style="min-height: 4.5rem;"
            />
          </label>

          <div class="stack" style="gap: 0.4rem;">
            {options.map((value, index) => (
              <div class="row" style="gap: 0.5rem; flex-wrap: nowrap;">
                <input
                  type="radio"
                  name="correct"
                  checked={correctIndex === index}
                  disabled={!value.trim()}
                  onChange={() => setCorrectIndex(index)}
                  aria-label={t("run.markCorrect")}
                  style="width: 22px; height: 22px; flex: 0 0 auto;"
                />
                <input
                  type="text"
                  value={value}
                  placeholder={t("run.option", { n: index + 1 })}
                  onInput={(e) => {
                    const next = [...options];
                    next[index] = (e.target as HTMLInputElement).value;
                    setOptions(next);
                  }}
                  style="flex: 1;"
                />
              </div>
            ))}
            <p class="hint">{t("run.markCorrect")}</p>
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

          <button class="btn primary" type="button" disabled={busy || !canPush} onClick={onPush}>
            {busy ? t("run.pushing") : t("run.push")}
          </button>
          {!canPush ? <p class="hint">{t("run.needQuestion")}</p> : null}
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
                      {isCorrect ? ` ✓ ${t("run.correctLabel")}` : ""}
                    </span>
                    <span class="pulse-bar-count">{option.count ?? 0}</span>
                  </div>
                );
              })}
            </div>

            <p class="hint" data-tick={tick}>
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
    </div>
  );
}
