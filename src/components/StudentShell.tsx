import type { ComponentChildren } from "preact";
import { useLocation } from "preact-iso";
import { t } from "../i18n";

export function StudentShell({
  preview,
  children
}: {
  preview: boolean;
  children: ComponentChildren;
}) {
  const { path } = useLocation();
  const prefix = preview ? "/student" : "";
  const items = [
    { href: prefix || "/", glyph: "📅", label: t("nav.today") },
    { href: `${prefix}/review`, glyph: "📚", label: t("nav.review") },
    { href: `${prefix}/grades`, glyph: "✅", label: t("nav.grades") }
  ];

  return (
    <>
      {preview ? (
        <aside class="student-preview-banner" role="status">
          <span>
            <strong>{t("student.preview.title")}</strong>{" "}
            {t("student.preview.body")}
          </span>
          <a class="btn quiet" href="/teach">{t("student.preview.exit")}</a>
        </aside>
      ) : null}
      {children}
      <nav class="bottom-nav" aria-label={t("nav.main")}>
        {items.map((item) => (
          <a
            href={item.href}
            aria-current={path === item.href ? "page" : undefined}
          >
            <span class="glyph" aria-hidden="true">{item.glyph}</span>
            {item.label}
          </a>
        ))}
      </nav>
    </>
  );
}
