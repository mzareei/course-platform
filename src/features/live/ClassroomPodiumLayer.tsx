// The winners, on the screen the room is looking at.
//
// A fullscreen layer inside Run Class, not the /projector route: the
// single-screen-classroom decision made Run Class the only teaching display,
// and nothing links to /projector. A celebration built there would land on a
// screen the professor never opens.
//
// It never appears on its own. The professor presses to show it, so the room's
// screen does not change while he is still talking — including when the quiz
// closes early because everyone finished.
//
// Unlike ClassroomQuestionLayer, this has no fullscreen toggle: the podium is
// already the thing the professor pressed to show, so a second press to make
// it fill the screen would be a step with no decision in it. It covers the
// viewport outright via CSS (position: fixed) and leaves on Escape or the
// button. It also paints an opaque background — the room must not read the
// professor's private counts through a translucent celebration.
import { useEffect, useRef } from "preact/hooks";
import type { PodiumEntry } from "../../api/quiz";
import { Podium } from "../quiz/Podium";
import { t } from "../../i18n";

export function ClassroomPodiumLayer({
  entries,
  onClose
}: {
  entries: PodiumEntry[];
  onClose: () => void;
}) {
  const layerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    layerRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <section
      ref={layerRef}
      class="classroom-podium-layer"
      data-testid="classroom-podium-layer"
      aria-live="polite"
      tabindex={-1}
    >
      <div class="classroom-podium-shell">
        <p class="eyebrow">{t("podium.classroomEyebrow")}</p>
        <h2>{t("podium.classroomTitle")}</h2>
        <Podium entries={entries} large />
        <div class="classroom-podium-actions">
          <button class="btn" type="button" onClick={onClose}>
            {t("podium.backToClass")}
          </button>
        </div>
      </div>
    </section>
  );
}
