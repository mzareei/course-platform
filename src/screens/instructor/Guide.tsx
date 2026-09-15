// Instructor guide — the whole platform in five steps, for a colleague's first
// day. Every button or screen it names is passed in from that screen's own
// string, so renaming a button renames the guide with it.
import type { JSX } from "preact";
import { t } from "../../i18n";

type GuideStep = {
  title: string;
  when: string;
  body: string;
  href: string;
  place: string;
  Picture: () => JSX.Element;
};

/** Built at render rather than at module load, because t() reads the language
 *  the professor has chosen right now. */
function guideSteps(): GuideStep[] {
  return [
    {
      title: t("guide.step1.title"),
      when: t("guide.step1.when"),
      body: t("guide.step1.body", { people: t("teach.nav.people"), rosterImport: t("roster.import.title") }),
      href: "/teach/people",
      place: t("teach.nav.people"),
      Picture: StudentsPicture
    },
    {
      title: t("guide.step2.title"),
      when: t("guide.step2.when"),
      body: t("guide.step2.body", { content: t("teach.nav.content"), import: t("content.tab.import") }),
      href: "/teach/content?tab=import",
      place: t("teach.nav.content"),
      Picture: LecturePicture
    },
    {
      title: t("guide.step3.title"),
      when: t("guide.step3.when"),
      body: t("guide.step3.body", { classes: t("teach.nav.classes"), addClassDay: t("schedule.add") }),
      href: "/teach/classes",
      place: t("teach.nav.classes"),
      Picture: CalendarPicture
    },
    {
      title: t("guide.step4.title"),
      when: t("guide.step4.when"),
      body: t("guide.step4.body", {
        home: t("teach.nav.home"),
        runClass: t("run.title"),
        startClass: t("run.start"),
        plan: t("run.plan.title"),
        // An imported lecture never opens the quiz box by itself, so the
        // button that opens it has to be named before the one inside it.
        openQuiz: t("endOfClass.title"),
        startQuiz: t("endOfClass.start")
      }),
      href: "/teach",
      place: t("teach.nav.home"),
      Picture: TeachPicture
    },
    {
      title: t("guide.step5.title"),
      when: t("guide.step5.when"),
      body: t("guide.step5.body", {
        endClass: t("run.endClass"),
        review: t("nav.review"),
        gradebook: t("teach.nav.grades")
      }),
      href: "/teach/grades",
      place: t("teach.nav.grades"),
      Picture: GradesPicture
    }
  ];
}

export function InstructorGuide() {
  const steps = guideSteps();
  return (
    <div class="stack">
      <div>
        <p class="eyebrow">{t("guide.eyebrow")}</p>
        <h1>{t("guide.title")}</h1>
        <p class="hint">{t("guide.lede")}</p>
      </div>

      <ol class="guide-steps">
        {steps.map((step, index) => (
          <li class="card guide-step" key={step.href}>
            <step.Picture />
            <div class="stack" style="gap: 0.4rem;">
              <div class="guide-step-head">
                <span class="guide-step-number" aria-hidden="true">{index + 1}</span>
                <h2 style="font-size: 1.05rem;">{step.title}</h2>
                <span class="pill hidden">{step.when}</span>
              </div>
              <p>{step.body}</p>
              <a class="btn quiet guide-step-link" href={step.href}>
                {t("guide.open", { place: step.place })}
              </a>
            </div>
          </li>
        ))}
      </ol>

      <div class="card muted stack">
        <h2 style="font-size: 1.05rem;">{t("guide.goodToKnow")}</h2>
        <ul class="guide-tips">
          <li>{t("guide.tip.pause", { pause: t("run.pause") })}</li>
          <li>{t("guide.tip.reflection")}</li>
          <li>{t("guide.tip.reset", { reset: t("run.reset.action") })}</li>
        </ul>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ drawings
// Line drawings with no words in them, so one picture serves both languages.
// Colours come from classes in app.css that read the theme tokens, so a
// drawing follows dark mode on its own. Hidden from screen readers: the step
// text beside each one already says everything the picture shows.

/** A class list and a student. */
function StudentsPicture() {
  return (
    <svg class="guide-picture" viewBox="0 0 136 96" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect class="paper" x="10" y="12" width="72" height="72" rx="6" />
      <path d="M10 30h72M10 48h72M10 66h72M32 12v72" />
      <path class="accent" d="M42 21h28M42 39h22M42 57h26M42 75h18" />
      <circle class="accent-fill" cx="21" cy="21" r="3" stroke="none" />
      <circle class="accent-fill" cx="21" cy="39" r="3" stroke="none" />
      <circle class="accent-fill" cx="21" cy="57" r="3" stroke="none" />
      <circle class="accent-fill" cx="21" cy="75" r="3" stroke="none" />
      <circle class="soft" cx="108" cy="36" r="11" />
      <path class="soft" d="M90 80c0-11 8-20 18-20s18 9 18 20z" />
    </svg>
  );
}

/** An AI chat turning into two files: the slides and the questions. */
function LecturePicture() {
  return (
    <svg class="guide-picture" viewBox="0 0 136 96" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path class="soft" d="M6 22a8 8 0 0 1 8-8h36a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H30l-10 9v-9h-6a8 8 0 0 1-8-8z" />
      <path class="accent" d="M32 24v16M24 32h16" />
      <path d="M64 48h12m-5-5 5 5-5 5" />
      <path class="paper" d="M84 6h26l10 10v30H84z" />
      <path d="M110 6v10h10" />
      <rect class="soft" x="90" y="22" width="24" height="16" rx="2" />
      <path class="paper" d="M84 52h26l10 10v28H84z" />
      <path d="M110 52v10h10" />
      <path class="accent" d="M90 70l3 3 5-6M90 82l3 3 5-6" />
      <path d="M103 71h10M103 83h10" />
    </svg>
  );
}

/** A calendar with one day holding a lecture. */
function CalendarPicture() {
  return (
    <svg class="guide-picture" viewBox="0 0 136 96" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect class="paper" x="18" y="16" width="100" height="72" rx="8" />
      <path class="soft" d="M18 24a8 8 0 0 1 8-8h84a8 8 0 0 1 8 8v12H18z" />
      <path d="M44 10v12M92 10v12" />
      <path d="M43 36v52M68 36v52M93 36v52M18 62h100" />
      <rect class="soft accent" x="71" y="65" width="20" height="20" rx="4" />
      <rect class="accent" x="75" y="70" width="12" height="9" rx="1.5" />
    </svg>
  );
}

/** A slide on the projector and a phone scanning its QR code. */
function TeachPicture() {
  return (
    <svg class="guide-picture" viewBox="0 0 136 96" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect class="paper" x="6" y="8" width="84" height="58" rx="4" />
      <rect class="soft" x="14" y="16" width="68" height="42" rx="2" stroke="none" />
      <path d="M22 28h34M22 38h24" />
      <rect class="accent" x="62" y="38" width="14" height="14" rx="1.5" />
      <path d="M48 66v14M34 86h28" />
      <path class="accent" stroke-dasharray="3 5" d="M98 52 80 46" />
      <rect class="paper" x="100" y="28" width="30" height="58" rx="6" />
      <path class="accent" d="M107 40h6v6h-6zM117 40h6v6h-6zM107 50h6v6h-6z" />
      <rect class="accent-fill" x="118" y="51" width="4" height="4" stroke="none" />
      <path d="M110 78h10" />
    </svg>
  );
}

/** A gradebook with every row checked. */
function GradesPicture() {
  return (
    <svg class="guide-picture" viewBox="0 0 136 96" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect class="paper" x="12" y="10" width="76" height="76" rx="6" />
      <path d="M24 29h32M24 48h32M24 67h32" />
      <path class="accent" d="M64 28l4 4 8-9M64 47l4 4 8-9M64 66l4 4 8-9" />
      <circle class="soft" cx="110" cy="60" r="18" />
      <path class="accent" d="M101 60l6 6 12-13" />
    </svg>
  );
}
