import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { requestInstructorContent } from "../../api/content";
import { t } from "../../i18n";

export function InstructorDeck({
  contentItemId,
  title,
  frameRef
}: {
  contentItemId: string;
  title: string;
  frameRef: RefObject<HTMLIFrameElement>;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [deckTitle, setDeckTitle] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  async function mint() {
    try {
      const access = await requestInstructorContent(contentItemId);
      setToken(access.token);
      setDeckTitle(access.content.title || title);
      setError(null);
      clearTimeout(timer.current);
      timer.current = setTimeout(
        mint,
        Math.max(30, access.expires_in - 60) * 1000
      ) as unknown as number;
    } catch (cause) {
      setToken(null);
      setError(
        cause instanceof Error ? cause.message : t("run.deck.openFailed")
      );
    }
  }

  useEffect(() => {
    setToken(null);
    setDeckTitle(title);
    setError(null);
    void mint();
    return () => clearTimeout(timer.current);
  }, [contentItemId]);

  if (error) {
    return (
      <div class="run-deck-frame run-deck-fallback card">
        <h2>{t("run.deck.unavailable")}</h2>
        <p class="error-text" role="alert">{error}</p>
        <button class="btn primary" type="button" onClick={() => void mint()}>
          {t("app.tryAgain")}
        </button>
      </div>
    );
  }

  if (!token) {
    return (
      <div class="run-deck-frame run-deck-fallback" role="status">
        <p class="hint">{t("run.deck.opening")}</p>
      </div>
    );
  }

  return (
    <iframe
      ref={frameRef}
      class="run-deck-frame"
      src={`/content?t=${encodeURIComponent(token)}`}
      title={deckTitle}
      allow="fullscreen"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
