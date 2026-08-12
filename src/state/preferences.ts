// Per-device instructor preferences. Nothing here is course data — it changes
// how the cockpit behaves on this machine, so it lives in localStorage rather
// than on the server, the same way theme and language do.
import { signal } from "@preact/signals";

const AUTO_SEND_KEY = "cp.auto-send-checkpoints";

/**
 * On by default: a professor lecturing from the platform's own deck should not
 * have to leave fullscreen to put an authored poll on student phones. It stays
 * a visible switch because auto-send is a promise to the room — a professor who
 * wants to read the question aloud first turns it off.
 */
function readAutoSend(): boolean {
  try {
    const stored = localStorage.getItem(AUTO_SEND_KEY);
    if (stored === "off") return false;
    if (stored === "on") return true;
  } catch {
    // Private browsing: fall through to the default.
  }
  return true;
}

export const autoSendCheckpoints = signal<boolean>(readAutoSend());

export function setAutoSendCheckpoints(next: boolean) {
  autoSendCheckpoints.value = next;
  try {
    localStorage.setItem(AUTO_SEND_KEY, next ? "on" : "off");
  } catch {
    // The choice still applies for this session.
  }
}
