// The one control that separates "I am teaching Group 401" from "I am the
// owner looking at all of it". A native <select> with two <optgroup>s: it is
// keyboard- and screen-reader-correct for free, and it needs no new machinery.
//
// Module scope, per docs/07-pitfalls.md #4.
import { parseScope, serializeScope } from "../features/scope/model";
import { scope, scopeOptions, setScope } from "../state/scope";
import { t } from "../i18n";

export function ScopeSwitcher() {
  // One entry means there is nothing to switch between: an instructor who
  // teaches a single group sees no control and no change to their app.
  if (scopeOptions.value.length < 2) return null;

  const mine = scopeOptions.value.filter((option) => option.section === "instructor");
  const admin = scopeOptions.value.filter((option) => option.section === "admin");
  const current = scope.value ? serializeScope(scope.value) : "";

  return (
    <div class="scope-switcher">
      <select
        value={current}
        aria-label={t("scope.label")}
        onChange={(event) => {
          const next = parseScope((event.target as HTMLSelectElement).value);
          if (next) setScope(next);
        }}
      >
        {mine.length ? (
          <optgroup label={t("scope.instructor")}>
            {mine.map((option) => (
              <option value={option.value}>
                {t("scope.youTeach", { group: option.groupLabel ?? "" })}
              </option>
            ))}
          </optgroup>
        ) : null}
        {admin.length ? (
          <optgroup label={t("scope.admin")}>
            {admin.map((option) => (
              <option value={option.value}>{option.groupLabel ?? t("scope.allGroups")}</option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </div>
  );
}
