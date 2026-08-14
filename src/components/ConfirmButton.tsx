// Two-press confirmation for destructive actions — pitfall #36: the first
// click turns the button into an explicit bilingual confirmation, never a
// browser-owned window.confirm() that ignores the app's language and theme.
import { useEffect, useRef, useState } from "preact/hooks";

export function ConfirmButton({
  label,
  confirmLabel,
  className = "btn quiet",
  disabled = false,
  onConfirm
}: {
  label: string;
  confirmLabel: string;
  className?: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // An armed confirmation that is never pressed disarms itself, so the
  // dangerous label does not sit there waiting for a stray click later.
  useEffect(() => {
    if (!confirming) return;
    timer.current = window.setTimeout(() => setConfirming(false), 6000);
    return () => window.clearTimeout(timer.current);
  }, [confirming]);

  return (
    <button
      class={confirming ? `${className} danger` : className}
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        setConfirming(false);
        onConfirm();
      }}
    >
      {confirming ? confirmLabel : label}
    </button>
  );
}
