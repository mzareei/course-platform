// You are about to change real students' grades, and the only thing telling
// you whose is a value in a dropdown. This says it out loud.
//
// Module scope, per docs/07-pitfalls.md #4.
import { activeGroupName, isForeignGroup } from "../state/scope";
import { t } from "../i18n";

export function ScopeBanner() {
  if (!isForeignGroup.value) return null;
  return (
    <p class="hint" role="status">
      {t("scope.viewingForeign", { group: activeGroupName.value })}
    </p>
  );
}
