import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { requestInstructorContent } from "../../api/content";
import { t } from "../../i18n";
import {
  instructorDeckUrl,
  shouldKeepDeckVisibleAfterRefreshFailure
} from "./instructorDeckState";

export function InstructorDeck({
  contentItemId,
  title,
  frameRef,
  slide,
  onNavigation
}: {
  contentItemId: string;
  title: string;
  frameRef: RefObject<HTMLIFrameElement>;
  slide: number | null;
  onNavigation: () => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [deckTitle, setDeckTitle] = useState(title);
  const [fatalError, setFatalError] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const sourceRef = useRef<string | null>(null);
  const slideRef = useRef<number | null>(slide);
  const generation = useRef(0);

  slideRef.current = slide;

  function schedule(nextGeneration: number, seconds: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => void mint(nextGeneration),
      Math.max(30, seconds) * 1000
    ) as unknown as number;
  }

  async function mint(expectedGeneration = generation.current) {
    try {
      const access = await requestInstructorContent(contentItemId);
      if (expectedGeneration !== generation.current) return;
      const nextSource = instructorDeckUrl(access.token, slideRef.current);
      onNavigation();
      sourceRef.current = nextSource;
      setSource(nextSource);
      setDeckTitle(access.content.title || title);
      setFatalError(false);
      setRefreshWarning(false);
      schedule(expectedGeneration, access.expires_in - 60);
    } catch {
      if (expectedGeneration !== generation.current) return;
      if (shouldKeepDeckVisibleAfterRefreshFailure(sourceRef.current)) {
        setRefreshWarning(true);
        schedule(expectedGeneration, 30);
      } else {
        setFatalError(true);
      }
    }
  }

  useEffect(() => {
    generation.current += 1;
    const nextGeneration = generation.current;
    clearTimeout(timer.current);
    sourceRef.current = null;
    setSource(null);
    setDeckTitle(title);
    setFatalError(false);
    setRefreshWarning(false);
    onNavigation();
    void mint(nextGeneration);
    return () => {
      generation.current += 1;
      clearTimeout(timer.current);
    };
  }, [contentItemId]);

  if (fatalError) {
    return (
      <div class="run-deck-frame run-deck-fallback card">
        <h2>{t("run.deck.unavailable")}</h2>
        <p class="error-text" role="alert">{t("run.deck.openFailed")}</p>
        <button
          class="btn primary"
          type="button"
          onClick={() => void mint(generation.current)}
        >
          {t("app.tryAgain")}
        </button>
      </div>
    );
  }

  if (!source) {
    return (
      <div class="run-deck-frame run-deck-fallback" role="status">
        <p class="hint">{t("run.deck.opening")}</p>
      </div>
    );
  }

  return (
    <div class="run-deck-host">
      {refreshWarning ? (
        <div class="run-deck-warning" role="status">
          <span>{t("run.deck.refreshWarning")}</span>
          <button
            class="btn quiet"
            type="button"
            onClick={() => void mint(generation.current)}
          >
            {t("app.tryAgain")}
          </button>
        </div>
      ) : null}
      <iframe
        ref={frameRef}
        class="run-deck-frame"
        src={source}
        title={deckTitle}
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
