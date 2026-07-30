import { Schedule } from "../../components/Schedule";
import { Sections } from "../../components/Sections";
import { t } from "../../i18n";

export function Classes() {
  return (
    <div class="stack classes-screen">
      <div>
        <p class="eyebrow">{t("classes.eyebrow")}</p>
        <h1>{t("classes.title")}</h1>
        <p class="hint">{t("classes.body")}</p>
      </div>

      <Sections />
      <Schedule />
    </div>
  );
}
