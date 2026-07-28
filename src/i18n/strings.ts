// Every user-facing string, English and Spanish side by side.
//
// Kept as pairs on purpose: a translator sees both languages together and a
// missing translation is visible at a glance (tools/verify-i18n.mjs fails the
// build if a pair is incomplete). Values may contain {placeholders}.
//
// Spanish is written for a Mexican university audience: "usted" is avoided in
// favour of the neutral imperative that reads naturally on a button.
export const strings = {
  // ---------------------------------------------------------------- shell
  "app.name": ["Course Platform", "Plataforma del Curso"],
  "app.loading": ["Loading…", "Cargando…"],
  "app.signOut": ["Sign out", "Cerrar sesión"],
  "app.tryAgain": ["Try again", "Intentar de nuevo"],
  "app.back": ["Back", "Regresar"],
  "app.themeToLight": ["Switch to light theme", "Cambiar a tema claro"],
  "app.themeToDark": ["Switch to dark theme", "Cambiar a tema oscuro"],
  "app.language": ["Language", "Idioma"],
  "app.switchToSpanish": ["Ver en español", "Ver en español"],
  "app.switchToEnglish": ["View in English", "View in English"],
  "app.contextError.title": ["We couldn't load your course", "No pudimos cargar tu curso"],

  // ---------------------------------------------------------------- sign in
  "signIn.eyebrow": ["Course Platform", "Plataforma del Curso"],
  "signIn.title": ["Sign in", "Iniciar sesión"],
  "signIn.lede": [
    "No password. Enter your institutional email and we'll send you a one-time sign-in link.",
    "Sin contraseña. Escribe tu correo institucional y te enviaremos un enlace de acceso de un solo uso."
  ],
  "signIn.emailLabel": ["Institutional email", "Correo institucional"],
  "signIn.send": ["Email me a sign-in link", "Enviarme un enlace de acceso"],
  "signIn.resend": ["Resend sign-in email", "Reenviar el correo de acceso"],
  "signIn.codeLabel": [
    "Or type the 6-digit code from the email",
    "O escribe el código de 6 dígitos del correo"
  ],
  "signIn.verify": ["Verify code", "Verificar código"],
  "signIn.sent": [
    "Check your inbox. Open the link on this device, or type the 6-digit code below.",
    "Revisa tu correo. Abre el enlace en este dispositivo o escribe abajo el código de 6 dígitos."
  ],
  "signIn.wrongDomain": [
    "Use your institutional email ({domains}).",
    "Usa tu correo institucional ({domains})."
  ],
  "signIn.cooldown": [
    "A sign-in email was just sent. You can request another in {seconds}s.",
    "Acabamos de enviar un correo de acceso. Puedes pedir otro en {seconds}s."
  ],
  "signIn.sendFailed": ["Could not send the email.", "No se pudo enviar el correo."],
  "signIn.codeFailed": [
    "That code didn't work. Check it and try again.",
    "Ese código no funcionó. Revísalo e inténtalo de nuevo."
  ],
  "signIn.testTitle": ["Testing mode", "Modo de prueba"],
  "signIn.testBody": [
    "Email verification is off during the testing period. Rostered students can sign in without proving mailbox ownership. This disappears before the semester starts.",
    "La verificación por correo está desactivada durante el periodo de pruebas. Los estudiantes en la lista pueden entrar sin comprobar que son dueños del buzón. Esto desaparece antes de que inicie el semestre."
  ],
  "signIn.testButton": ["Sign in without email (testing)", "Entrar sin correo (pruebas)"],
  "signIn.testFailed": ["Test sign-in failed.", "El acceso de prueba falló."],

  // ---------------------------------------------------------------- enrollment
  "notEnrolled.signedInAs": ["Signed in as {email}", "Sesión iniciada como {email}"],
  "notEnrolled.title": [
    "You're signed in, but not on the course roster yet",
    "Tu sesión está iniciada, pero aún no estás en la lista del curso"
  ],
  "notEnrolled.missingProfile": [
    "Your email isn't on the roster for this course. If you just enrolled, ask your professor to add you — they need this exact address:",
    "Tu correo no está en la lista de este curso. Si acabas de inscribirte, pide a tu profesor que te agregue con esta dirección exacta:"
  ],
  "notEnrolled.notEnrolled": [
    "Your profile exists but you're not enrolled in an active section. Ask your professor to check your enrollment.",
    "Tu perfil existe, pero no estás inscrito en un grupo activo. Pide a tu profesor que revise tu inscripción."
  ],
  "notEnrolled.reassure": [
    "Nothing is wrong with your sign-in — access opens the moment you're added.",
    "Tu acceso está bien: se abrirá en el momento en que te agreguen."
  ],

  // ---------------------------------------------------------------- student nav
  "nav.today": ["Today", "Hoy"],
  "nav.review": ["Review", "Repasar"],
  "nav.grades": ["My Grades", "Mis Calificaciones"],
  "nav.main": ["Main", "Principal"],

  // ---------------------------------------------------------------- today
  "today.title": ["Today", "Hoy"],
  "today.classLive": ["Class is live", "La clase está en curso"],
  "today.joinClass": ["Join class", "Entrar a la clase"],
  "today.open": ["Open: {title}", "Abrir: {title}"],
  "today.emptyTitle": ["Nothing released yet", "Aún no hay material publicado"],
  "today.emptyBody": [
    "When your professor releases materials or starts a class, they appear here. You don't need to do anything else.",
    "Cuando tu profesor publique material o inicie una clase, aparecerá aquí. No necesitas hacer nada más."
  ],

  // ---------------------------------------------------------------- content types
  "type.lecture": ["Lecture deck", "Presentación de clase"],
  "type.mission": ["Practice mission", "Misión de práctica"],
  "type.activity": ["Graded activity", "Actividad calificada"],
  "type.exitTicket": ["Reflection", "Reflexión"],
  "type.resource": ["Resource", "Recurso"],
  "type.caseFile": ["Case file", "Caso de estudio"],
  "type.material": ["Material", "Material"],
  "group.lectures": ["Lectures", "Clases"],
  "group.missions": ["Practice missions", "Misiones de práctica"],
  "group.activities": ["Activities", "Actividades"],
  "group.caseFiles": ["Case files", "Casos de estudio"],
  "group.resources": ["Resources", "Recursos"],
  "group.other": ["Other materials", "Otros materiales"],

  // ---------------------------------------------------------------- review
  "review.eyebrow": ["Self-study", "Estudio independiente"],
  "review.title": ["Review", "Repasar"],
  "review.lede": [
    "Everything your professor has released stays here for you to revisit.",
    "Todo lo que tu profesor ha publicado queda aquí para que lo repases."
  ],
  "review.emptyTitle": ["Nothing to review yet", "Aún no hay nada que repasar"],
  "review.emptyBody": [
    "Released lectures and practice missions collect here after each class.",
    "Las clases y misiones publicadas se juntan aquí después de cada sesión."
  ],

  // ---------------------------------------------------------------- grades
  "grades.eyebrow": ["Your standing", "Tu situación"],
  "grades.title": ["My Grades", "Mis Calificaciones"],
  "grades.loading": ["Loading your grades…", "Cargando tus calificaciones…"],
  "grades.weightedTotal": ["Weighted course total so far", "Total ponderado del curso hasta ahora"],
  "grades.category": ["Category", "Categoría"],
  "grades.weight": ["Weight", "Peso"],
  "grades.yourAverage": ["Your average", "Tu promedio"],
  "grades.recentWork": ["Recent work", "Trabajo reciente"],
  "grades.item": ["Item", "Elemento"],
  "grades.score": ["Score", "Puntaje"],
  "grades.status": ["Status", "Estado"],
  "grades.gradedItem": ["Graded item", "Elemento calificado"],
  "grades.emptyTitle": ["No grades yet", "Aún no hay calificaciones"],
  "grades.emptyBody": [
    "Quiz scores and class participation appear here after your first graded class.",
    "Los puntajes de los quizzes y la participación aparecerán aquí después de tu primera clase calificada."
  ],
  "grades.revisit": ["Worth revisiting", "Vale la pena repasar"],

  // ---------------------------------------------------------------- viewer
  "viewer.unavailableTitle": ["This content isn't available", "Este contenido no está disponible"],
  "viewer.opening": ["Opening…", "Abriendo…"],
  "viewer.loadFailed": ["Could not load the content.", "No se pudo cargar el contenido."],
  "viewer.openFailed": ["Could not open this content.", "No se pudo abrir este contenido."],
  "viewer.backToToday": ["Back to Today", "Regresar a Hoy"],

  // ---------------------------------------------------------------- instructor nav
  "teach.nav.home": ["Home", "Inicio"],
  "teach.nav.content": ["Content", "Contenido"],
  "teach.nav.grades": ["Gradebook", "Calificaciones"],
  "teach.nav.people": ["People", "Personas"],

  // ---------------------------------------------------------------- teach home
  "teach.eyebrow": ["Instructor", "Profesor"],
  "teach.welcome": ["Welcome back", "Bienvenido de nuevo"],
  "teach.welcomeNamed": ["Welcome back, {name}", "Bienvenido de nuevo, {name}"],
  "teach.todayClass": ["Today's class — {title}", "Clase de hoy — {title}"],
  "teach.sessionN": ["session {n}", "sesión {n}"],
  "teach.sectionSuffix": [" · Section {code}", " · Grupo {code}"],
  "teach.runClassSoon": [
    "The guided Run Class flow (start → release → pulses → quiz → reflections → end) arrives in Phase 3. Until then, manage the session from the current course app.",
    "El flujo guiado Dar Clase (iniciar → publicar → preguntas rápidas → quiz → reflexiones → cerrar) llega en la Fase 3. Por ahora, administra la sesión desde la aplicación actual del curso."
  ],
  "teach.noClassToday": ["No class scheduled today", "No hay clase programada hoy"],
  "teach.noClassTodayBody": [
    "Your next sessions are below. Running a class is a one-button flow once it's scheduled.",
    "Tus próximas sesiones están abajo. Dar clase es un flujo de un solo botón una vez programada."
  ],
  "teach.upcoming": ["Upcoming sessions", "Próximas sesiones"],
  "teach.noSessionsTitle": ["No sessions planned", "No hay sesiones planeadas"],
  "teach.noSessionsBody": [
    "Sessions are created per class meeting; each one gets a QR join code for students.",
    "Se crea una sesión por cada clase; cada una recibe un código QR para que entren los estudiantes."
  ],
  "teach.col.class": ["Class", "Clase"],
  "teach.col.date": ["Date", "Fecha"],
  "teach.col.section": ["Section", "Grupo"],
  "teach.col.status": ["Status", "Estado"],
  "teach.card.content": ["Content", "Contenido"],
  "teach.card.contentBody": [
    "Weekly materials, release control, and (soon) PDF upload.",
    "Materiales semanales, control de publicación y (pronto) carga de PDF."
  ],
  "teach.card.grades": ["Gradebook", "Calificaciones"],
  "teach.card.gradesBody": [
    "Semester matrix, per-class review, weights.",
    "Matriz del semestre, revisión por clase, pesos."
  ],
  "teach.card.people": ["People", "Personas"],
  "teach.card.peopleBody": [
    "Roster, sections, guests and QA accounts.",
    "Lista, grupos, invitados y cuentas de prueba."
  ],
  "teach.card.asStudent": ["View as student", "Ver como estudiante"],
  "teach.card.asStudentBody": [
    "See exactly what your students see.",
    "Mira exactamente lo que ven tus estudiantes."
  ],
  "teach.placeholder.contentBody": [
    "Your weekly materials move here in Phase 2 — hidden until you release them, with the PDF upload zone arriving in Phase 5.",
    "Tus materiales semanales se mueven aquí en la Fase 2 — ocultos hasta que los publiques, y la carga de PDF llega en la Fase 5."
  ],
  "teach.placeholder.adminTitle": ["Platform admin", "Administración de la plataforma"],
  "teach.placeholder.adminBody": [
    "Professor and course management arrives in Phase 5.",
    "La gestión de profesores y cursos llega en la Fase 5."
  ],

  // ---------------------------------------------------------------- gradebook
  "gradebook.eyebrow": ["Assessment", "Evaluación"],
  "gradebook.title": ["Gradebook", "Calificaciones"],
  "gradebook.loading": ["Loading the gradebook…", "Cargando las calificaciones…"],
  "gradebook.tab.semester": ["Semester", "Semestre"],
  "gradebook.tab.weights": ["Weights", "Pesos"],
  "gradebook.col.student": ["Student", "Estudiante"],
  "gradebook.col.dropLowest": ["Drop lowest", "Descartar más bajas"],
  "gradebook.emptyTitle": ["No grades yet", "Aún no hay calificaciones"],
  "gradebook.emptyBody": [
    "Scores flow in automatically as students submit graded activities.",
    "Los puntajes llegan automáticamente cuando los estudiantes entregan actividades calificadas."
  ],
  "gradebook.perClassNote": [
    "Per-class review (pulse answers, quiz stats, and reflection texts in one place) arrives in Phase 4. Adjustments and locking stay in the current course app until then.",
    "La revisión por clase (respuestas rápidas, estadísticas del quiz y textos de reflexión en un solo lugar) llega en la Fase 4. Los ajustes y el cierre de calificaciones siguen en la aplicación actual del curso por ahora."
  ],

  // ---------------------------------------------------------------- people
  "people.eyebrow": ["Administration", "Administración"],
  "people.title": ["People", "Personas"],
  "people.addTitle": ["Add one person", "Agregar una persona"],
  "people.addBody": [
    "For a whole class list, use CSV import (still in the current course app; it ports here next). This form covers late enrollments, guests, and QA accounts.",
    "Para una lista completa, usa la importación CSV (todavía en la aplicación actual del curso; se traslada aquí después). Este formulario sirve para inscripciones tardías, invitados y cuentas de prueba."
  ],
  "people.email": ["Email", "Correo"],
  "people.fullName": ["Full name", "Nombre completo"],
  "people.studentId": ["Student / staff ID (optional)", "Matrícula o ID de personal (opcional)"],
  "people.section": ["Section", "Grupo"],
  "people.role": ["Role", "Rol"],
  "people.reason": [
    "Reason for outside-institution access",
    "Motivo del acceso desde fuera de la institución"
  ],
  "people.reasonPlaceholder": [
    "e.g. Guest professor for week 8",
    "p. ej. Profesor invitado de la semana 8"
  ],
  "people.reasonNote": [
    "This address is outside the approved domains — the reason is recorded in the audit log.",
    "Esta dirección está fuera de los dominios aprobados — el motivo queda registrado en la bitácora."
  ],
  "people.add": ["Add person", "Agregar persona"],
  "people.added": ["{name} was added to the roster.", "{name} se agregó a la lista."],
  "people.addFailed": ["Could not add this person.", "No se pudo agregar a esta persona."],
  "people.roster": ["Roster", "Lista del curso"],
  "people.loadingRoster": ["Loading the roster…", "Cargando la lista…"],
  "people.emptyTitle": ["Nobody on the roster yet", "Aún no hay nadie en la lista"],
  "people.emptyBody": [
    "Add people above, or import the class CSV to bring everyone in at once.",
    "Agrega personas arriba o importa el CSV del grupo para incorporar a todos de una vez."
  ],
  "people.col.name": ["Name", "Nombre"],
  "people.col.id": ["ID", "ID"],
  "people.col.roleSection": ["Role · Section", "Rol · Grupo"],
  "people.externalAccess": ["External access", "Acceso externo"],
  "people.col.reason": ["Reason", "Motivo"],
  "role.student": ["Student", "Estudiante"],
  "role.teaching_assistant": ["Teaching assistant", "Asistente de docencia"],
  "role.instructor": ["Instructor", "Profesor"],
  "role.observer": ["Observer", "Observador"],
  "role.platform_owner": ["Platform owner", "Administrador de la plataforma"],

  // ---------------------------------------------------------------- run class
  "run.title": ["Run class", "Dar clase"],
  "run.eyebrow": ["Live teaching", "Clase en vivo"],
  "run.backToHome": ["Back to home", "Regresar al inicio"],
  "run.noSession": ["Pick a class session first", "Primero elige una sesión de clase"],
  "run.noSessionBody": [
    "Open Run class from a scheduled session on your home screen.",
    "Abre Dar clase desde una sesión programada en tu pantalla de inicio."
  ],
  "run.step.pulse": ["Ask a quick question", "Hacer una pregunta rápida"],
  "run.step.pulseBody": [
    "Push a question mid-lecture to check the room is with you. It's graded: answering earns partial credit, answering correctly earns full credit.",
    "Lanza una pregunta a mitad de la clase para comprobar que el grupo te sigue. Cuenta para la calificación: responder da crédito parcial y acertar da crédito completo."
  ],
  "run.question": ["Question", "Pregunta"],
  "run.seconds": ["Seconds to answer", "Segundos para responder"],
  "run.points": ["Points", "Puntos"],
  "run.push": ["Send to the class", "Enviar al grupo"],
  "run.pushing": ["Sending…", "Enviando…"],
  "run.pushFailed": ["Could not send the question.", "No se pudo enviar la pregunta."],
  "run.correctAnswer": ["Correct answer", "Respuesta correcta"],

  // Questions come from the generated bank — the instructor never writes one.
  "run.pickLecture": ["Which class are you teaching?", "¿Cuál clase estás dando?"],
  "run.pickDifficulty": ["How hard?", "¿Qué tan difícil?"],
  "run.anyDifficulty": ["Surprise me", "Sorpréndeme"],
  "difficulty.easy": ["Easy", "Fácil"],
  "difficulty.medium": ["Medium", "Media"],
  "difficulty.hard": ["Hard", "Difícil"],
  "run.draw": ["Pick a question", "Elegir una pregunta"],
  "run.drawing": ["Picking…", "Eligiendo…"],
  "run.drawAgain": ["Pick a different one", "Elegir otra"],
  "run.drawFailed": ["Could not pick a question.", "No se pudo elegir una pregunta."],
  "run.noBank": [
    "This class has no question bank yet. Banks are generated from the class content.",
    "Esta clase todavía no tiene banco de preguntas. Los bancos se generan a partir del contenido de la clase."
  ],
  "run.bankCount": [
    "{total} questions ready · {easy} easy · {medium} medium · {hard} hard",
    "{total} preguntas listas · {easy} fáciles · {medium} medias · {hard} difíciles"
  ],
  "run.preview": ["Ready to send", "Lista para enviar"],
  "run.loadingBanks": ["Loading your question banks…", "Cargando tus bancos de preguntas…"],
  "run.askedAlready": [
    "Already asked this class: {count}",
    "Ya preguntadas en esta clase: {count}"
  ],
  "run.liveQuestion": ["Question on screen", "Pregunta en pantalla"],
  "run.answeredOf": ["{answered} of {enrolled} answered", "{answered} de {enrolled} respondieron"],
  "run.correctCount": ["{correct} correct", "{correct} correctas"],
  "run.timeLeft": ["{seconds}s left", "quedan {seconds}s"],
  "run.timeUp": ["Time is up", "Se acabó el tiempo"],
  "run.reveal": ["Show the answer", "Mostrar la respuesta"],
  "run.close": ["Close the question", "Cerrar la pregunta"],
  "run.askAnother": ["Ask another question", "Hacer otra pregunta"],
  "run.revealed": ["Answer shown to the class", "Respuesta mostrada al grupo"],
  "run.whoAnswered": ["Who answered", "Quién respondió"],
  "run.nobodyYet": ["Nobody has answered yet.", "Todavía nadie ha respondido."],
  "run.correctLabel": ["Correct", "Correcta"],
  "run.theirAnswer": ["Their answer", "Su respuesta"],
  "run.startSessionFirst": [
    "Start the class session before sending a question.",
    "Inicia la sesión de clase antes de enviar una pregunta."
  ],

  // ---------------------------------------------------------------- end of class
  "endOfClass.title": ["End-of-class quiz", "Quiz de fin de clase"],
  "endOfClass.body": [
    "A mixed set of easy, medium, and hard questions drawn from today's lecture bank — nothing to type.",
    "Un conjunto mixto de preguntas fáciles, medias y difíciles tomadas del banco de esta clase — no hay nada que escribir."
  ],
  "endOfClass.start": ["Start the quiz", "Iniciar el quiz"],
  "endOfClass.starting": ["Starting…", "Iniciando…"],
  "endOfClass.startFailed": ["Could not start the quiz.", "No se pudo iniciar el quiz."],
  "endOfClass.submittedOf": ["submitted · {started} started", "entregados · {started} iniciados"],
  "endOfClass.close": ["Close the quiz", "Cerrar el quiz"],
  "endOfClass.closing": ["Closing…", "Cerrando…"],
  "endOfClass.closeFailed": ["Could not close the quiz.", "No se pudo cerrar el quiz."],
  "endOfClass.closed": ["Quiz closed", "Quiz cerrado"],
  "endOfClass.average": ["Class average: {score}%", "Promedio del grupo: {score}%"],
  "endOfClass.reflections": ["Reflections", "Reflexiones"],
  "endOfClass.loadingReflections": ["Loading reflections…", "Cargando reflexiones…"],
  "endOfClass.noReflectionsYet": [
    "No reflections submitted yet.",
    "Aún no se ha enviado ninguna reflexión."
  ],

  // ---------------------------------------------------------------- student live
  "live.title": ["In class", "En clase"],
  "live.eyebrow": ["Live", "En vivo"],
  "live.waitingTitle": ["You're in. Watch the screen.", "Ya estás dentro. Mira la pantalla."],
  "live.waitingBody": [
    "When your professor asks a question it appears here. Keep this page open.",
    "Cuando tu profesor haga una pregunta, aparecerá aquí. Deja esta página abierta."
  ],
  "live.noClass": ["No class is live right now", "No hay clase en curso ahora"],
  "live.noClassBody": [
    "This screen wakes up when your professor starts the class.",
    "Esta pantalla se activa cuando tu profesor inicia la clase."
  ],
  "live.answer": ["Tap your answer", "Toca tu respuesta"],
  "live.sending": ["Sending…", "Enviando…"],
  "live.recorded": ["Answer recorded", "Respuesta registrada"],
  "live.recordedBody": [
    "Wait for your professor to show the answer.",
    "Espera a que tu profesor muestre la respuesta."
  ],
  "live.youWereRight": ["You got it right", "Respondiste bien"],
  "live.youWereWrong": ["Not this time", "No esta vez"],
  "live.correctWas": ["The correct answer was:", "La respuesta correcta era:"],
  "live.pointsEarned": ["+{points} points", "+{points} puntos"],
  "live.answerFailed": ["Could not record your answer.", "No se pudo registrar tu respuesta."],
  "live.timeUp": ["Time is up for this question", "Se acabó el tiempo de esta pregunta"],
  "live.backToToday": ["Leave class view", "Salir de la vista de clase"],
  "live.doneTitle": ["That's everything for today", "Eso es todo por hoy"],
  "live.doneBody": [
    "Your pulse answers, quiz, and reflection are all in. See you next class.",
    "Tus respuestas rápidas, el quiz y tu reflexión ya quedaron registrados. Nos vemos en la próxima clase."
  ],
  "live.viewGrades": ["View my grades", "Ver mis calificaciones"],

  // ---------------------------------------------------------------- quiz
  "quiz.loading": ["Loading the quiz…", "Cargando el quiz…"],
  "quiz.questionN": ["Question {n} of {total}", "Pregunta {n} de {total}"],
  "quiz.previous": ["Back", "Regresar"],
  "quiz.next": ["Next", "Siguiente"],
  "quiz.submit": ["Submit quiz", "Enviar quiz"],
  "quiz.submitting": ["Submitting…", "Enviando…"],
  "quiz.answeredOf": ["{answered} of {total} answered", "{answered} de {total} respondidas"],
  "quiz.done": ["Quiz submitted", "Quiz enviado"],
  "quiz.doneBody": [
    "Your score is recorded. Your professor will show the class results shortly.",
    "Tu calificación quedó registrada. Tu profesor mostrará los resultados del grupo en un momento."
  ],

  // ---------------------------------------------------------------- reflection
  "reflection.eyebrow": ["End of class", "Fin de la clase"],
  "reflection.title": ["What did you learn today?", "¿Qué aprendiste hoy?"],
  "reflection.prompt": [
    "Write one paragraph, {min}–{max} words, about what you learned in this class.",
    "Escribe un párrafo, de {min} a {max} palabras, sobre lo que aprendiste en esta clase."
  ],
  "reflection.placeholder": [
    "Today I learned that…",
    "Hoy aprendí que…"
  ],
  "reflection.wordCount": ["{count} words (need {min}–{max})", "{count} palabras (se necesitan {min}–{max})"],
  "reflection.submit": ["Submit reflection", "Enviar reflexión"],
  "reflection.submitting": ["Submitting…", "Enviando…"],
  "reflection.submitFailed": ["Could not submit your reflection.", "No se pudo enviar tu reflexión."],

  // ---------------------------------------------------------------- status pills
  "state.draft": ["Hidden", "Oculto"],
  "state.scheduled": ["Scheduled", "Programado"],
  "state.scheduledFor": ["Scheduled for {date}", "Programado para {date}"],
  "state.released": ["Open now", "Disponible"],
  "state.live": ["Live", "En curso"],
  "state.paused": ["Paused", "En pausa"],
  "state.review_only": ["Review only", "Solo repaso"],
  "state.closed": ["Closed", "Cerrado"],
  "state.archived": ["Archived", "Archivado"],
  "state.planned": ["Planned", "Planeado"],
  "state.open": ["Open", "Abierto"],
  "state.continued": ["Continued", "Continuado"],
  "state.cancelled": ["Cancelled", "Cancelado"],
  "state.posted": ["Posted", "Publicado"],
  "state.locked": ["Final", "Definitivo"],
  "state.missing": ["Missing", "Sin entregar"],
  "state.excused": ["Excused", "Justificado"],
  "state.submitted": ["Submitted", "Entregado"],
  "state.started": ["In progress", "En proceso"],
  "state.active": ["Active", "Activo"],
  "state.inactive": ["Inactive", "Inactivo"],
  "state.invited": ["Invited", "Invitado"],
  "state.revoked": ["Revoked", "Revocado"]
} as const;

export type StringKey = keyof typeof strings;
