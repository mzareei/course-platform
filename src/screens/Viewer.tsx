// The gated content viewer. The only way a browser reaches a deck or mission:
// ask course-content-access for a short-lived delivery token (it re-checks the
// release gate every time), then load it through the same-origin /content proxy
// so the deck's inline engine can actually run. No gate pass — no content.
import { useEffect, useRef, useState } from "preact/hooks";
import { callFn, ApiError } from "../api/client";
import { t, apiErrorText } from "../i18n";

interface AccessResponse {
  access: string;
  url: string;
  expires_in: number;
  content: { title: string; content_type: string };
  release: { state: string };
}

export function Viewer({ releaseId }: { releaseId?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  async function mint() {
    if (!releaseId) return;
    try {
      const access = await callFn<AccessResponse>("course-content-access", {
        action: "request_url",
        release_id: releaseId
      });
      // Deliver through our own /content proxy: a same-origin document gets its
      // own CSP (which permits the deck's inline engine), where a blob: iframe
      // would inherit this page's stricter policy and run no scripts at all.
      const token = new URL(access.url).searchParams.get("t") || "";
      setTitle(access.content.title);
      setUrl(`/content?t=${encodeURIComponent(token)}`);
      setError(null);
      // Refresh before the token expires so a long read never dies mid-slide.
      clearTimeout(timer.current);
      timer.current = setTimeout(mint, Math.max(30, access.expires_in - 60) * 1000) as unknown as number;
    } catch (e) {
      setUrl(null);
      setError(
        e instanceof ApiError && e.status === 403
          ? e.message // the gate's own plain-language reason ("not released for your section", …)
          : apiErrorText(e, "viewer.openFailed")
      );
    }
  }

  useEffect(() => {
    void mint();
    return () => clearTimeout(timer.current);
  }, [releaseId]);

  if (error) {
    return (
      <div class="card">
        <h2>{t("viewer.unavailableTitle")}</h2>
        <p class="error-text">{error}</p>
        <div class="row">
          <a class="btn" href="/">{t("viewer.backToToday")}</a>
          <button class="btn primary" type="button" onClick={() => void mint()}>
            {t("app.tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  if (!url) {
    return <div class="empty-state"><p>{t("viewer.opening")}</p></div>;
  }

  return (
    <div class="viewer-shell">
      <div class="row" style="justify-content: space-between; padding: 0 0 0.5rem;">
        <h2>{title}</h2>
        <a class="btn quiet" href="/">← {t("app.back")}</a>
      </div>
      <iframe
        class="viewer-frame"
        src={url}
        title={title}
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
