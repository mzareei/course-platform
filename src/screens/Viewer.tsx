// The gated content viewer. The only way a browser reaches a deck or mission:
// ask course-content-access for a short-lived signed URL (it re-checks the
// release gate every time), render it in an iframe, and mint a fresh URL
// before the old one expires. No gate pass — no content.
import { useEffect, useRef, useState } from "preact/hooks";
import { callFn, ApiError } from "../api/client";

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
  const blobUrl = useRef<string | null>(null);

  async function mint() {
    if (!releaseId) return;
    try {
      const access = await callFn<AccessResponse>("course-content-access", {
        action: "request_url",
        release_id: releaseId
      });
      // The Supabase gateway refuses to serve renderable HTML (anti-phishing),
      // so fetch the gated content and render it from a local blob URL. The
      // token-authorized fetch is still the only path into the private bucket.
      const response = await fetch(access.url);
      if (!response.ok) throw new Error((await response.text()) || "Could not load the content.");
      const html = await response.text();
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      setTitle(access.content.title);
      setUrl(blobUrl.current);
      setError(null);
    } catch (e) {
      setUrl(null);
      setError(
        e instanceof ApiError && e.status === 403
          ? e.message // the gate's own plain-language reason ("not released for your section", …)
          : e instanceof Error
            ? e.message
            : "Could not open this content."
      );
    }
  }

  useEffect(() => {
    void mint();
    return () => {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, [releaseId]);

  if (error) {
    return (
      <div class="card">
        <h2>This content isn't available</h2>
        <p class="error-text">{error}</p>
        <div class="row">
          <a class="btn" href="/">Back to Today</a>
          <button class="btn primary" type="button" onClick={() => void mint()}>Try again</button>
        </div>
      </div>
    );
  }

  if (!url) return <div class="empty-state"><p>Opening…</p></div>;

  return (
    <div class="viewer-shell">
      <div class="row" style="justify-content: space-between; padding: 0 0 0.5rem;">
        <h2>{title}</h2>
        <a class="btn quiet" href="/">← Back</a>
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
