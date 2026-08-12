export function instructorDeckUrl(
  token: string,
  slide: number | null | undefined
) {
  const hash =
    Number.isInteger(slide) && Number(slide) > 0 ? `#${Number(slide)}` : "";
  return `/content?t=${encodeURIComponent(token)}${hash}`;
}

export function shouldKeepDeckVisibleAfterRefreshFailure(
  currentSource: string | null
) {
  return Boolean(currentSource);
}

/**
 * Whether a freshly minted deck URL may be handed to the iframe right now.
 *
 * The token is refreshed every nine minutes so a genuine reload still works,
 * but assigning the result to `src` reloads the document — and the browser
 * exits fullscreen the moment the fullscreen element is destroyed. The deck is
 * one self-contained document; once it has loaded, the token has done its whole
 * job. So a fresh token is worth holding and never worth interrupting a lecture
 * for.
 *
 * An empty frame is the exception in both directions: there is no presentation
 * to protect, and refusing to load would leave the professor with nothing.
 */
export function shouldApplyDeckSource(input: {
  hasSource: boolean;
  inFullscreen: boolean;
}): boolean {
  if (!input.hasSource) return true;
  return !input.inFullscreen;
}
