// Where this student came in the end-of-class quiz.
//
// Shown above the exit ticket AND kept on the done screen afterwards: a
// student who writes their paragraph quickly would otherwise see their place
// for a few seconds and lose the reveal button with it — which is exactly when
// a top-three student is deciding whether to say yes.
//
// The reveal is reversible. Someone who says yes and regrets it in front of
// the room has to be able to take it back.
import { useEffect, useState } from "preact/hooks";
import type { QuizRank } from "../../api/pulse";
import { setQuizNameReveal } from "../../api/quiz";
import { MEDALS } from "./Podium";
import { t, apiErrorText } from "../../i18n";

export function RankBanner({
  rank,
  onRevealed
}: {
  rank: QuizRank;
  onRevealed?: (revealed: boolean) => void;
}) {
  const [revealed, setRevealed] = useState(rank.name_revealed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The 3-second poll keeps handing this component a fresh `rank`. If our own
  // toggle's response never arrives — dropped on the way back after the
  // server already applied it — the local `revealed` state would otherwise
  // sit stale forever, showing this student the opposite of what the room's
  // screen is actually showing. Resync whenever the server's own view of it
  // changes.
  useEffect(() => {
    setRevealed(rank.name_revealed);
  }, [rank.name_revealed]);

  async function toggle() {
    if (busy) return; // a fast double-tap must not fire two conflicting requests
    setBusy(true);
    setError(null);
    const next = !revealed;
    try {
      const res = await setQuizNameReveal({ attempt_id: rank.attempt_id, revealed: next });
      setRevealed(res.name_revealed);
      onRevealed?.(res.name_revealed);
    } catch (e) {
      setError(apiErrorText(e, "podium.revealFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class={`quiz-rank-banner${rank.is_top3 ? " top3" : ""}`}>
      {rank.is_top3 ? (
        <span class="quiz-rank-medal" aria-hidden="true">{MEDALS[rank.rank] || "🎉"}</span>
      ) : null}
      <p class="quiz-rank-line">{t("podium.yourPlace", { rank: rank.rank, of: rank.of })}</p>
      {rank.is_top3 ? (
        <>
          <button class="btn quiet" type="button" disabled={busy} onClick={toggle}>
            {busy
              ? t("app.loading")
              : revealed
                ? t("podium.hideMyName")
                : t("podium.revealMyName")}
          </button>
          {revealed ? <p class="hint">{t("podium.nameShowing")}</p> : null}
        </>
      ) : null}
      {error ? <p class="error-text" role="alert">{error}</p> : null}
    </div>
  );
}
