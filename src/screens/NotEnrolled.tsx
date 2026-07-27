import { t } from "../i18n";

export function NotEnrolled({ status, email }: { status: string; email: string }) {
  return (
    <div class="card">
      <p class="eyebrow">{t("notEnrolled.signedInAs", { email })}</p>
      <h2>{t("notEnrolled.title")}</h2>
      {status === "missing_profile" ? (
        <p class="hint">
          {t("notEnrolled.missingProfile")} <strong>{email}</strong>
        </p>
      ) : (
        <p class="hint">{t("notEnrolled.notEnrolled")}</p>
      )}
      <p class="hint">{t("notEnrolled.reassure")}</p>
    </div>
  );
}
