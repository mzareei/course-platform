// The finished student's window into the race: the piñata's crack, their
// candy, their secret racer, and one button to cheer someone still swinging.
// Everything here is decoration around a quiz that is already submitted —
// no state in this file can affect a grade.
import { useEffect, useRef, useState } from "preact/hooks";
import type { MyRace } from "../../api/pulse";
import { cheerRacer } from "../../api/quiz";
import { t } from "../../i18n";

const COOLDOWN_SECONDS = 20;

export function PinataCard({ race, attemptId }: { race: MyRace; attemptId: string }) {
  const [cooldown, setCooldown] = useState(0);
  const [lastCheer, setLastCheer] = useState<{ name: string; emoji: string } | null>(null);
  const [nobodyLeft, setNobodyLeft] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  async function onCheer() {
    try {
      const res = await cheerRacer({ attempt_id: attemptId });
      if (!res.ok) {
        setNobodyLeft(true);
        return;
      }
      if (res.to) setLastCheer({ name: res.to.racer_name, emoji: res.to.racer_emoji });
      setCooldown(COOLDOWN_SECONDS);
      clearInterval(timer.current);
      timer.current = setInterval(() => {
        setCooldown((s) => {
          if (s <= 1) clearInterval(timer.current);
          return Math.max(0, s - 1);
        });
      }, 1000) as unknown as number;
    } catch {
      // The server said "wait" (or the quiz just closed). Either way the
      // student loses nothing — show the cooldown and move on.
      setCooldown(COOLDOWN_SECONDS);
    }
  }

  const everyoneDone = nobodyLeft || race.swinging === 0;

  return (
    <div class="card muted pinata-card" data-testid="pinata-card">
      <p class="pinata-card-bar-label">
        {race.pinata.burst ? t("pinata.burst") : t("pinata.cardTitle", { percent: race.pinata.percent })}
      </p>
      <div class="pinata-bar"><i style={`width:${race.pinata.percent}%`} /></div>
      {race.finished ? <p>{t("pinata.gotCandy")}</p> : null}
      {race.racer_name ? (
        <p>
          {race.finish_place !== null
            ? t("pinata.yourRacer", { emoji: race.racer_emoji, name: race.racer_name, place: race.finish_place })
            : t("pinata.yourRacerNoPlace", { emoji: race.racer_emoji, name: race.racer_name })}
        </p>
      ) : null}
      {everyoneDone ? (
        <p class="hint">{t("pinata.nobodyLeft")}</p>
      ) : (
        <>
          <button class="btn" type="button" disabled={cooldown > 0} onClick={onCheer}>
            {cooldown > 0 ? t("pinata.cheerCooldown", { seconds: cooldown }) : t("pinata.cheerButton")}
          </button>
          {lastCheer ? <p class="hint">{t("pinata.youCheered", { emoji: lastCheer.emoji, name: lastCheer.name })}</p> : null}
        </>
      )}
    </div>
  );
}
