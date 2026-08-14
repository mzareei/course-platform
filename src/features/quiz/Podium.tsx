// The top three of the end-of-class quiz.
//
// Student IDs, not names. A name appears only for a student who tapped "show
// my name" on their own phone, and the server is what withholds the others —
// this component never receives a name it is expected to hide.
//
// Ordered 2 · 1 · 3 so the winner stands in the middle, the way a podium
// actually looks. A tie for third can make this four entries, so the layout
// must not assume exactly three.
import type { PodiumEntry } from "../../api/quiz";
import { t } from "../../i18n";

/** Exported so RankBanner shows a student the same medal the professor's
 *  podium is showing the room. Two copies would drift the moment one is
 *  edited. */
export const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/** 2 · 1 · 3. A tie simply widens one of the three groups — podiumCut never
 *  returns a rank above 3, so there is no fourth bucket to append. */
function podiumOrder(entries: PodiumEntry[]) {
  const byRank = (rank: number) => entries.filter((entry) => entry.rank === rank);
  return [...byRank(2), ...byRank(1), ...byRank(3)];
}

export function Podium({ entries, large = false }: { entries: PodiumEntry[]; large?: boolean }) {
  if (!entries.length) return <p class="hint">{t("podium.empty")}</p>;

  return (
    <ol class={`quiz-podium${large ? " quiz-podium-large" : ""}`}>
      {podiumOrder(entries).map((entry) => (
        <li key={entry.profile_id} class={`quiz-podium-place rank-${entry.rank}`}>
          <span class="quiz-podium-medal" aria-hidden="true">{MEDALS[entry.rank] || "🎉"}</span>
          <span class="quiz-podium-rank">{t("podium.place", { rank: entry.rank })}</span>
          <span class="quiz-podium-id">
            {entry.student_identifier || t("podium.noId")}
          </span>
          {entry.name ? <span class="quiz-podium-name">{entry.name}</span> : null}
          {typeof entry.score_final === "number" ? (
            <span class="quiz-podium-score">{entry.score_final}%</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
