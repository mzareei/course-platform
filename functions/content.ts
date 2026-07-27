// Same-origin delivery for gated course content.
//
// Why this proxy exists: gated decks are inline-script documents, and an iframe
// loaded from a blob: URL inherits the embedding page's CSP — so the app's
// `script-src 'self'` silently disabled every deck's presenter engine. Serving
// the deck as a real same-origin response instead gives that document its own
// CSP (see public/_headers, /content), where inline scripts are allowed for our
// own generated content and nothing else.
//
// This adds no authority: the token in the URL was minted by
// course-content-access only after the release gate passed, and
// course-content-serve verifies it. This function just forwards.
const SUPABASE_URL = "https://ojmbupftdikwmlqvibwt.supabase.co";

export const onRequestGet: PagesFunction = async ({ request }) => {
  const token = new URL(request.url).searchParams.get("t");
  if (!token) {
    return new Response("Missing content token.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  const upstream = await fetch(
    `${SUPABASE_URL}/functions/v1/course-content-serve?t=${encodeURIComponent(token)}`
  );
  if (!upstream.ok) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      // The upstream reports the real type in X-Mime; the platform rewrites the
      // Content-Type header itself, so trust X-Mime here.
      "Content-Type": upstream.headers.get("X-Mime") || "application/octet-stream",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff"
    }
  });
};
