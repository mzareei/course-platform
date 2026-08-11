// A deliberately heavy-friction confirm step for bypassing a
// historical-activity delete refusal. Never rendered for any other kind of
// refusal (currently-live, currently-released, active bank, wrong state,
// not found, not owned) — callers only show this when the failure they just
// saw is specifically the "has real recorded activity" kind for that entity.
import { useState } from "preact/hooks";
import { t } from "../i18n";
import type { StringKey } from "../i18n/strings";

export function ForceDeleteControl({
  busy,
  warningKey,
  onConfirm
}: {
  busy: boolean;
  warningKey: StringKey;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const ready = value.trim().toUpperCase() === "DELETE";

  if (!open) {
    return (
      <button
        class="btn quiet"
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        {t("forceDelete.trigger")}
      </button>
    );
  }

  return (
    <div class="stack" style="gap: 0.4rem;">
      <p class="error-text" role="alert">{t(warningKey)}</p>
      <input
        type="text"
        value={value}
        placeholder={t("forceDelete.placeholder")}
        onInput={(event) => setValue((event.target as HTMLInputElement).value)}
      />
      <div class="row">
        <button
          class="btn danger"
          type="button"
          disabled={busy || !ready}
          onClick={() => {
            setOpen(false);
            setValue("");
            onConfirm();
          }}
        >
          {t("forceDelete.confirm")}
        </button>
        <button
          class="btn quiet"
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setValue("");
          }}
        >
          {t("forceDelete.cancel")}
        </button>
      </div>
    </div>
  );
}
