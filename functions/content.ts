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

/**
 * Most of the professor's decks were authored before the deck bridge existed and
 * carry no `postMessage` at all — measured: zero in the whole 5 MB of Week 1. A
 * mute deck cannot say which slide it is on, so a planned poll can never send
 * itself and the cockpit is reduced to guessing.
 *
 * This shim gives any deck the one thing auto-ask needs: its slide position. It
 * only *observes* — it never navigates, never binds a key, never touches the
 * deck's own engine. Decks that already carry the current engine report for
 * themselves and are skipped at runtime, so nothing double-reports.
 *
 * Kept to the reporting half of the protocol on purpose. Checkpoint messages
 * belong to the full engine, which owns the navigation this shim refuses to do.
 */
const SLIDE_REPORTER = `<script>(function () {
  if (parent === window) return;
  if (window.__deckSlideReporter) return;
  // The real engine reports its own position, including teaching-slide numbers
  // and checkpoints. Never compete with it.
  if (document.querySelector('script[data-course-deck-engine]')) return;
  window.__deckSlideReporter = 1;

  var last = -1;
  var readySent = false;

  function report() {
    var list = document.querySelectorAll('.slide');
    if (!list.length) return;
    var i = -1;
    for (var n = 0; n < list.length; n++) {
      if (list[n].classList.contains('active')) { i = n; break; }
    }
    if (i < 0) return;
    if (readySent && i === last) return;
    last = i;
    if (!readySent) {
      readySent = true;
      parent.postMessage({ version: 1, type: 'deck.ready', slide: i + 1 }, location.origin);
    }
    var teaching = Number(list[i].getAttribute('data-teaching-slide'));
    parent.postMessage({
      version: 1,
      type: 'deck.slide_changed',
      slide: i + 1,
      teaching_slide: Number.isInteger(teaching) && teaching > 0 ? teaching : null
    }, location.origin);
  }

  function start() {
    // Watch the document, not the slides: a deck may build its slides after this
    // script runs, and fragment toggles are cheap to ignore.
    new MutationObserver(report).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    addEventListener('hashchange', report);
    report();
  }

  if (document.readyState === 'loading') {
    addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();</` + `script>`;

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

  // The upstream reports the real type in X-Mime; the platform rewrites the
  // Content-Type header itself, so trust X-Mime here.
  const mime = upstream.headers.get("X-Mime") || "application/octet-stream";
  const response = new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff"
    }
  });

  if (!mime.startsWith("text/html")) return response;

  // HTMLRewriter streams, so a 5 MB deck is never buffered to add one script.
  return new HTMLRewriter()
    .on("body", {
      element(element) {
        element.append(SLIDE_REPORTER, { html: true });
      }
    })
    .transform(response);
};
