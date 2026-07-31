/**
 * Presentation revisions begin at zero before the controller has issued its
 * first command. Only a positive, strictly newer server revision may move the
 * projector.
 */
export function shouldApplyRevision(current: number, incoming: number): boolean {
  return Number.isInteger(current)
    && current >= 0
    && Number.isInteger(incoming)
    && incoming >= 1
    && incoming > current;
}

/**
 * Missing or malformed telemetry is disconnected. Server timestamps slightly
 * ahead of the browser are treated as just seen so clock skew cannot produce a
 * false disconnect warning.
 */
export function projectorIsStale(
  seenAt: string | null | undefined,
  now: number,
  thresholdMs = 10_000
): boolean {
  if (typeof seenAt !== "string" || !seenAt.trim()) return true;
  if (!Number.isFinite(now) || !Number.isFinite(thresholdMs) || thresholdMs < 0) return true;

  const seenAtMs = Date.parse(seenAt);
  if (!Number.isFinite(seenAtMs)) return true;
  if (seenAtMs > now) return false;
  return now - seenAtMs >= thresholdMs;
}
