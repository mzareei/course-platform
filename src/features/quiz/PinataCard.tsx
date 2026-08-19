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
  // Guards the async gap between tap and cheerRacer() resolving — without it
  // a fast double-tap fires two concurrent cheers before `cooldown` (which
  // only starts ticking once a response lands) has a chance to disable the
  // button.
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  // The single place a cooldown begins, whether the cheer landed or the
  // server said "wait" — both leave the student on the same 20-second timer,
  // and both need the interval actually running so the button re-enables on
  // its own instead of getting stuck at "Next cheer in 20s" forever.
  function startCooldown() {
    setCooldown(COOLDOWN_SECONDS);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) clearInterval(timer.current);
        return Math.max(0, s - 1);
      });
    }, 1000) as unknown as number;
  }

  async function onCheer() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await cheerRacer({ attempt_id: attemptId });
      if (!res.ok) {
        setNobodyLeft(true);
        return;
      }
      if (res.to) setLastCheer({ name: res.to.racer_name, emoji: res.to.racer_emoji });
      startCooldown();
    } catch {
      // The server said "wait" (or the quiz just closed). Either way the
      // student loses nothing — show the cooldown and move on.
      startCooldown();
    } finally {
      setBusy(false);
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
          <button class="btn" type="button" disabled={cooldown > 0 || busy} onClick={onCheer}>
            {cooldown > 0 ? t("pinata.cheerCooldown", { seconds: cooldown }) : t("pinata.cheerButton")}
          </button>
          {lastCheer ? <p class="hint">{t("pinata.youCheered", { emoji: lastCheer.emoji, name: lastCheer.name })}</p> : null}
        </>
      )}
    </div>
  );
}
