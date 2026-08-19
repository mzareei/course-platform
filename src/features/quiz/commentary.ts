// The room's announcer. Pure — the verifier runs it ten thousand times.
//
// Templates live HERE, not in strings.ts: the module must import cleanly in
// Node without the app's i18n, and the chants are deliberately Spanish in
// both languages anyway. `lang` picks the wording for the few lines that do
// translate (finishers, cheers, the near-miss).
//
// One rule outranks all others: cheer, never shame. No line may say slow,
// last, or behind, in either language — the verifier enforces the list.

export type Lang = "en" | "es";

export interface RacerView {
  racer_name: string;
  racer_emoji: string;
  position: number;
  answered: number;
  finished: boolean;
  finish_place: number | null;
}

export interface CheerView {
  from_name: string;
  from_emoji: string;
  to_name: string;
  to_emoji: string;
  at: string;
}

export interface RaceSnap {
  percent: number;
  burst: boolean;
  closed_reason: "time" | "everyone" | null;
  state: string;
  racers: RacerView[];
  cheers: CheerView[];
}

export const SONG_25 = "🎶 Dale, dale, dale…";
export const SONG_50 = "🎶 …no pierdas el tino…";
export const SONG_75 = "🎶 …porque si lo pierdes…";
export const BURST_LINE = "🎶 …¡pierdes el camino! — ¡SE ROMPIÓ! 🪅💥";

export const BANNED_WORDS = [
  "slow", "slowest", "last", "behind", "late",
  "lento", "lenta", "última", "último", "atrás", "rezagado", "tarde"
];

const CHANTS: Array<(name: string, animal: string) => string> = [
  (_name, animal) => `📣 ¡${animal}, ${animal}, ra ra raaa!`,
  (name) => `📣 ¡Vamos ${name}, tú puedes!`,
  (name) => `📣 ¡${name}, la porra está contigo!`,
  (name) => `📣 ¡Échale ganas, ${name}!`,
  (name) => `📣 ¡Sí se puede, ${name}!`
];

const cheerKey = (cheer: CheerView) => `${cheer.from_name}→${cheer.to_name}@${cheer.at}`;

/** Everything that HAPPENED between two polls, oldest first: song milestones,
 *  new finishers, new cheers, the burst, the close. */
export function raceEvents(prev: RaceSnap | null, curr: RaceSnap, lang: Lang): string[] {
  const es = lang === "es";
  const lines: string[] = [];
  const prevPercent = prev?.percent ?? 0;

  for (const [mark, line] of [[25, SONG_25], [50, SONG_50], [75, SONG_75]] as Array<[number, string]>) {
    if (prevPercent < mark && curr.percent >= mark && !curr.burst) lines.push(line);
  }
  if (!prev?.burst && curr.burst) lines.push(BURST_LINE);

  const wasFinished = new Set((prev?.racers || []).filter((r) => r.finished).map((r) => r.racer_name));
  for (const racer of curr.racers) {
    if (racer.finished && !wasFinished.has(racer.racer_name)) {
      lines.push(es
        ? `🍬 ¡${racer.racer_emoji} ${racer.racer_name} agarró un dulce!`
        : `🍬 ${racer.racer_emoji} ${racer.racer_name} grabbed a candy!`);
    }
  }

  const seenCheers = new Set((prev?.cheers || []).map(cheerKey));
  for (const cheer of curr.cheers) {
    if (!seenCheers.has(cheerKey(cheer))) {
      lines.push(es
        ? `📣 ¡${cheer.from_emoji} ${cheer.from_name} le echa porra a ${cheer.to_emoji} ${cheer.to_name}!`
        : `📣 ${cheer.from_emoji} ${cheer.from_name} cheers for ${cheer.to_emoji} ${cheer.to_name}!`);
    }
  }

  if (prev?.state !== "closed" && curr.state === "closed" && curr.closed_reason === "time" && !curr.burst) {
    lines.push(es
      ? `¡Casi! ${curr.percent}% — la próxima clase cae`
      : `¡Casi! ${curr.percent}% — next class it falls`);
  }

  return lines;
}

/** A cheer for the back of the pack: a racer from the bottom third by
 *  position (started, not finished), never the same one twice in a row.
 *  Spanish in both languages — that is the joke. */
export function chantLine(
  curr: RaceSnap,
  lastTarget: string | null,
  rng: () => number = Math.random
): { line: string; target: string } | null {
  const running = curr.racers
    .filter((racer) => !racer.finished)
    .sort((a, b) => a.position - b.position);
  if (!running.length) return null;

  const backOfPack = running.slice(0, Math.max(1, Math.ceil(running.length / 3)));
  const pool = backOfPack.filter((racer) => racer.racer_name !== lastTarget);
  const candidates = pool.length ? pool : running.filter((racer) => racer.racer_name !== lastTarget);
  if (!candidates.length) return null;

  const racer = candidates[Math.floor(rng() * candidates.length) % candidates.length];
  const template = CHANTS[Math.floor(rng() * CHANTS.length) % CHANTS.length];
  const animal = racer.racer_name.split(" ")[0];
  return { line: template(racer.racer_name, animal), target: racer.racer_name };
}
