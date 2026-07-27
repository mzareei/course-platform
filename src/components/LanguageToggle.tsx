import { lang, setLang, t } from "../i18n";

export function LanguageToggle() {
  const next = lang.value === "es" ? "en" : "es";
  return (
    <button
      class="btn quiet lang-toggle"
      type="button"
      onClick={() => setLang(next)}
      aria-label={t(next === "es" ? "app.switchToSpanish" : "app.switchToEnglish")}
      title={t(next === "es" ? "app.switchToSpanish" : "app.switchToEnglish")}
    >
      {next === "es" ? "ES" : "EN"}
    </button>
  );
}
