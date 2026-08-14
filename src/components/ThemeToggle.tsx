import { useState } from "preact/hooks";
import { config } from "../config";
import { t } from "../i18n";

function currentTheme(): "light" | "dark" {
  const forced = document.documentElement.dataset.theme;
  if (forced === "dark" || forced === "light") return forced;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme());

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    // Browser chrome colour mirrors --surface; update together with app.css.
    const metaColor = next === "dark" ? "#0c131f" : "#f4f7fb";
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute("content", metaColor);
      m.removeAttribute("media");
    });
    try {
      localStorage.setItem(config.themeStorageKey, next);
      // The deck engine reads its own key; keep decks matching the app.
      localStorage.setItem("tc-theme", next);
    } catch {
      // Preference still applies for this session.
    }
    setTheme(next);
  }

  const label = t(theme === "dark" ? "app.themeToLight" : "app.themeToDark");
  return (
    <button class="btn quiet" type="button" onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
