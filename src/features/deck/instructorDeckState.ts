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
