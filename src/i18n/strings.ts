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
  "student.preview.title": ["Student view.", "Vista de estudiante."],
  "student.preview.body": [
    "You are seeing the same Today, Review, and Grades screens as a student.",
    "Estás viendo las mismas pantallas de Hoy, Repaso y Calificaciones que un estudiante."
  ],
  "student.preview.exit": ["Exit student view", "Salir de vista de estudiante"],

  // ---------------------------------------------------------------- sign in
  "signIn.eyebrow": ["Course Platform", "Plataforma del Curso"],
  "signIn.title": ["Sign in", "Iniciar sesión"],
  "signIn.lede": [
    "No password. Enter your course email and we'll send you a one-time sign-in link.",
    "Sin contraseña. Escribe tu correo del curso y te enviaremos un enlace de acceso de un solo uso."
  ],
  "signIn.ledeMicrosoft": [
    "Use the Tec account you already have. No password to remember, and nothing to wait for in your inbox.",
    "Usa la cuenta del Tec que ya tienes. Sin contraseñas nuevas y sin esperar ningún correo."
  ],
  "signIn.emailLabel": ["Course email", "Correo del curso"],
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
  "signIn.invalidEmail": ["Enter a valid email address.", "Escribe una dirección de correo válida."],
  "signIn.cooldown": [
    "A sign-in email was just sent. You can request another in {seconds}s.",
    "Acabamos de enviar un correo de acceso. Puedes pedir otro en {seconds}s."
  ],
  "signIn.microsoft": ["Sign in with your Tec account", "Entrar con tu cuenta del Tec"],
  "signIn.microsoftBody": [
    "The same Microsoft account you use for your Tec email and Teams. Nothing is emailed to you.",
    "La misma cuenta de Microsoft que usas para tu correo del Tec y Teams. No se te envía ningún correo."
  ],
  "signIn.microsoftFailed": [
    "Could not open the Tec sign-in page. Check your connection and try again.",
    "No se pudo abrir la página de acceso del Tec. Revisa tu conexión e inténtalo de nuevo."
  ],
  "signIn.otherWays": ["Or sign in with a code", "O entra con un código"],
  "signIn.sendFailed": ["Could not send the email.", "No se pudo enviar el correo."],
  "signIn.rateLimitedWait": [
    "Too many sign-in emails at once. Wait {seconds} seconds, then press Send again. If your code already arrived, type it below.",
    "Demasiados correos de acceso a la vez. Espera {seconds} segundos y vuelve a presionar Enviar. Si tu código ya llegó, escríbelo abajo."
  ],
  "signIn.rateLimitedBusy": [
    "Too many people are signing in at the same time. Wait a minute and press Send again. If your code already arrived, type it below.",
    "Demasiadas personas están entrando al mismo tiempo. Espera un minuto y vuelve a presionar Enviar. Si tu código ya llegó, escríbelo abajo."
  ],
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
  // There is no "join class" button any more: the QR code on the projector is
  // the only door, because the scan is what records attendance.
  "today.scanToJoin": ["Scan the QR code", "Escanea el código QR"],
  "today.scanToJoinBody": [
    "The class QR code is on the screen at the front. Scan it with your phone camera to join and mark your attendance.",
    "El código QR de la clase está en la pantalla del frente. Escanéalo con la cámara de tu teléfono para entrar y registrar tu asistencia."
  ],
  "today.classPaused": ["Class paused", "Clase pausada"],
  "today.classPausedBody": [
    "Your professor paused this class. It continues in your next session — nothing you have done is lost.",
    "Tu profesor pausó esta clase. Continúa en tu próxima sesión; nada de lo que hiciste se pierde."
  ],
  "today.returnToClass": ["Return to class", "Regresar a la clase"],
  "today.returnToClassBody": [
    "You already scanned in. Go back to the question screen.",
    "Ya registraste tu entrada. Regresa a la pantalla de preguntas."
  ],
  "today.nextClass": ["Next class", "Próxima clase"],
  "today.sessionDetails": ["{date} · Group {code}", "{date} · Grupo {code}"],
  "today.lecture": ["Lecture: {title}", "Lección: {title}"],
  "today.emptyTitle": ["No class scheduled yet", "Aún no hay una clase programada"],
  "today.emptyBody": [
    "Your next class appears here as soon as your professor schedules it.",
    "Tu próxima clase aparecerá aquí en cuanto tu profesor la programe."
  ],

  // ---------------------------------------------------------------- QR join
  "join.eyebrow": ["Join class", "Entrar a la clase"],
  "join.loading.title": ["Opening your class…", "Abriendo tu clase…"],
  "join.loading.body": [
    "We're checking the class code and your enrollment.",
    "Estamos revisando el código de la clase y tu inscripción."
  ],
  "join.invalid.title": ["That class code isn't valid", "Ese código de clase no es válido"],
  "join.invalid.body": [
    "Scan the QR code on the classroom screen again, or ask your professor for the current code.",
    "Vuelve a escanear el código QR de la pantalla del salón o pide a tu profesor el código actual."
  ],
  "join.closed.title": ["This class is closed", "Esta clase está cerrada"],
  "join.closed.body": [
    "The live class has ended, so this join code no longer opens it.",
    "La clase en vivo terminó, así que este código ya no la abre."
  ],
  "join.access.title": ["This class is for another group", "Esta clase es para otro grupo"],
  "join.access.body": [
    "You're signed in, but your active enrollment is not in this class group. Ask your professor to check the roster.",
    "Tu sesión está iniciada, pero tu inscripción activa no pertenece al grupo de esta clase. Pide a tu profesor que revise la lista."
  ],
  "join.unknown.title": ["We couldn't open this class", "No pudimos abrir esta clase"],
  "join.unknown.body": [
    "Check your connection and scan the classroom QR code again.",
    "Revisa tu conexión y vuelve a escanear el código QR del salón."
  ],
  "join.back": ["Back to Today", "Regresar a Hoy"],

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
    "Materials your professor has made available for review stay here for you to revisit.",
    "Los materiales que tu profesor ha puesto disponibles para repasar se quedan aquí para que los revises."
  ],
  "review.emptyTitle": ["Nothing to review yet", "Aún no hay nada que repasar"],
  "review.emptyBody": [
    "Lectures, missions, and other openable materials appear here when your professor makes them available.",
    "Las clases, misiones y otros materiales que se pueden abrir aparecen aquí cuando tu profesor los pone disponibles."
  ],

  // ---------------------------------------------------------------- grades
  "grades.eyebrow": ["Your standing", "Tu situación"],
  "grades.title": ["My Grades", "Mis Calificaciones"],
  "grades.loading": ["Loading your grades…", "Cargando tus calificaciones…"],
  "grades.courseTotal": [
    "Course average across {count} graded class(es)",
    "Promedio del curso en {count} clase(s) calificada(s)"
  ],
  "grades.byClass": ["Class by class", "Clase por clase"],
  "grades.classLabel": ["Class {number}", "Clase {number}"],
  "grades.classQuestions": ["Class questions right", "Preguntas de clase correctas"],
  "grades.quizQuestions": ["Quiz questions right", "Preguntas del quiz correctas"],
  "grades.exitTicket": ["Exit ticket", "Ficha de salida"],
  "grades.classGrade": ["Class grade", "Calificación de la clase"],
  "grades.howCalculated": ["How was this calculated?", "¿Cómo se calculó esto?"],
  "grades.breakdown.adjusted": [
    "Your instructor set this class to {grade}.",
    "Tu profesor ajustó esta clase a {grade}."
  ],
  "grades.status": ["Status", "Estado"],
  "grades.emptyTitle": ["No grades yet", "Aún no hay calificaciones"],
  "grades.emptyBody": [
    "Your grade for a class appears here once your instructor posts it.",
    "Tu calificación de una clase aparece aquí en cuanto tu profesor la publica."
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
  "teach.nav.classes": ["Classes", "Clases"],
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

  // ---------------------------------------------------------------- classes
  "classes.eyebrow": ["Course setup", "Configuración del curso"],
  "classes.title": ["Classes", "Clases"],
  "classes.body": [
    "Set up groups, then schedule each class day with the lecture you plan to teach.",
    "Configura los grupos y después programa cada día de clase con la lección que planeas impartir."
  ],
  "classes.schedule": ["Schedule a class", "Programar una clase"],

  // ---------------------------------------------------------------- admin
  "teach.nav.admin": ["Admin", "Administración"],
  "admin.eyebrow": ["Platform", "Plataforma"],
  "admin.title": ["Platform admin", "Administración de la plataforma"],
  "admin.lede": [
    "Create a course, then invite the professor who will teach it. They claim the account themselves the first time they sign in with that email — there is nothing to send them.",
    "Crea un curso y luego invita al profesor que lo impartirá. La cuenta se activa sola la primera vez que esa persona entre con ese correo — no hay nada que enviarle."
  ],
  "admin.loading": ["Loading the platform…", "Cargando la plataforma…"],
  "admin.loadFailed": ["Could not load the platform admin.", "No se pudo cargar la administración."],

  "admin.courses": ["Courses", "Cursos"],
  "admin.courses.empty": ["No courses yet", "Aún no hay cursos"],
  "admin.courses.emptyBody": [
    "Create the first course below, then invite someone to teach it.",
    "Crea el primer curso abajo y luego invita a alguien a impartirlo."
  ],
  "admin.col.code": ["Code", "Clave"],
  "admin.col.title": ["Title", "Título"],
  "admin.col.term": ["Term", "Periodo"],
  "admin.col.staff": ["Teaching staff", "Personal docente"],

  "admin.newCourse": ["Create a course", "Crear un curso"],
  "admin.field.id": ["Short id", "Identificador corto"],
  "admin.field.idHint": [
    "Lowercase letters, digits, dot, dash or underscore. Used in links and cannot be changed later — e.g. tc2007b.",
    "Minúsculas, dígitos, punto, guion o guion bajo. Aparece en los enlaces y no se puede cambiar después — por ejemplo tc2007b."
  ],
  "admin.field.code": ["Course code", "Clave del curso"],
  "admin.field.codeHint": ["As the university writes it — e.g. TC2007B.", "Como la escribe la universidad — por ejemplo TC2007B."],
  "admin.field.courseTitle": ["Course title", "Título del curso"],
  "admin.field.term": ["Term", "Periodo"],
  "admin.field.termHint": ["For example \"Fall 2026\".", "Por ejemplo \"Otoño 2026\"."],
  "admin.createCourse": ["Create the course", "Crear el curso"],
  "admin.creating": ["Creating…", "Creando…"],
  "admin.createdCourse": [
    "Created {title}. Invite someone to teach it below.",
    "Se creó {title}. Invita abajo a quien lo impartirá."
  ],

  "admin.staff": ["Teaching staff", "Personal docente"],
  "admin.staff.empty": ["Nobody teaches this course yet", "Todavía nadie imparte este curso"],
  "admin.staff.emptyBody": [
    "Invite a professor below and they appear here straight away.",
    "Invita a un profesor abajo y aparecerá aquí de inmediato."
  ],
  "admin.col.person": ["Person", "Persona"],
  "admin.col.role": ["Role", "Rol"],
  "admin.col.account": ["Account", "Cuenta"],
  "admin.filter.course": ["Which course", "Cuál curso"],
  "admin.filter.allCourses": ["Every course", "Todos los cursos"],

  "admin.invite": ["Invite a professor", "Invitar a un profesor"],
  "admin.field.email": ["Institutional email", "Correo institucional"],
  "admin.field.emailHint": [
    "Must be a tec.mx or itesm.mx address, unless an external access grant already exists for it.",
    "Debe ser una dirección tec.mx o itesm.mx, salvo que ya exista un permiso de acceso externo para ella."
  ],
  "admin.field.fullName": ["Full name", "Nombre completo"],
  "admin.field.fullNameOptional": ["Optional", "Opcional"],
  "admin.field.role": ["Role", "Rol"],
  "admin.role.instructor": ["Professor", "Profesor"],
  "admin.role.teaching_assistant": ["Teaching assistant", "Asistente docente"],
  "admin.role.platform_owner": ["Platform owner", "Dueño de la plataforma"],
  "admin.sendInvite": ["Invite them", "Invitar"],
  "admin.inviting": ["Inviting…", "Invitando…"],
  "admin.invited": [
    "{email} can now teach {course}. They get access the first time they sign in with that address.",
    "{email} ya puede impartir {course}. Tendrá acceso la primera vez que entre con esa dirección."
  ],
  "admin.pickCourseFirst": [
    "Choose a course before inviting someone.",
    "Elige un curso antes de invitar a alguien."
  ],

  "admin.remove": ["Remove", "Quitar"],
  "admin.removing": ["Removing…", "Quitando…"],
  "admin.removeConfirm": [
    "Remove {name} from {course}? They lose access to the course immediately, including its gradebook and content. Nothing they have already graded is deleted, and you can invite them again later.",
    "¿Quitar a {name} de {course}? Perderá el acceso al curso de inmediato, incluidas las calificaciones y el contenido. No se borra nada de lo que ya haya calificado, y puedes volver a invitarle después."
  ],
  "admin.removed": ["{name} no longer teaches {course}.", "{name} ya no imparte {course}."],

  // ---------------------------------------------------------------- gradebook
  "gradebook.eyebrow": ["Assessment", "Evaluación"],
  "gradebook.title": ["Gradebook", "Calificaciones"],
  "gradebook.loading": ["Loading the gradebook…", "Cargando las calificaciones…"],
  "gradebook.tab.semester": ["Semester", "Semestre"],
  "gradebook.col.student": ["Student", "Estudiante"],
  "gradebook.emptyTitle": ["No grades yet", "Aún no hay calificaciones"],
  "gradebook.emptyBody": [
    "One grade per class appears here once you post it from the class record.",
    "Una calificación por clase aparece aquí en cuanto la publicas desde el registro de la clase."
  ],
  "gradebook.perClassNote": [
    "Grade adjustments and locking stay in the current course app for now.",
    "Los ajustes de calificación y el cierre siguen en la aplicación actual del curso por ahora."
  ],

  // ------------------------------------------------- gradebook · per class
  "gradebook.tab.perClass": ["Per class", "Por clase"],
  "gradebook.perClass.pick": ["Which class", "Cuál clase"],
  "gradebook.perClass.loading": ["Loading this class…", "Cargando esta clase…"],
  "gradebook.perClass.noSessions": ["No classes yet", "Aún no hay clases"],
  "gradebook.perClass.noSessionsBody": [
    "Once you have run a class, everything that happened in it shows up here.",
    "En cuanto hayas dado una clase, aquí aparece todo lo que ocurrió en ella."
  ],
  "gradebook.perClass.questions": ["Questions asked in class", "Preguntas hechas en clase"],
  "gradebook.perClass.noQuestions": [
    "No questions were sent to the class during this session.",
    "No se enviaron preguntas a la clase durante esta sesión."
  ],
  "gradebook.perClass.correctOf": [
    "{correct} of {answered} correct · {enrolled} in the class",
    "{correct} de {answered} correctas · {enrolled} en la clase"
  ],
  "gradebook.perClass.correctMark": ["Correct answer", "Respuesta correcta"],
  "gradebook.perClass.quiz": ["End-of-class quiz", "Quiz de fin de clase"],
  "gradebook.perClass.noQuiz": [
    "No quiz was run in this class.",
    "No se realizó ningún quiz en esta clase."
  ],
  "gradebook.perClass.quizHeadline": [
    "{submitted} of {started} finished · class average {average}%",
    "{submitted} de {started} terminaron · promedio del grupo {average}%"
  ],
  "gradebook.perClass.reflections": ["Reflections", "Reflexiones"],
  "gradebook.perClass.noReflections": [
    "No reflections were submitted for this class.",
    "No se enviaron reflexiones para esta clase."
  ],
  "gradebook.perClass.reflectionCount": [
    "{count} submitted",
    "{count} enviadas"
  ],
  "gradebook.perClass.words": ["{count} words", "{count} palabras"],
  "gradebook.col.score": ["Score", "Puntaje"],
  "gradebook.col.submittedAt": ["Submitted", "Enviado"],
  "gradebook.perClass.loadFailed": [
    "Could not load this class.",
    "No se pudo cargar esta clase."
  ],

  // ---------------------------------------------------------- student notes
  "studentNotes.title": ["Private notes", "Notas privadas"],
  "studentNotes.pickStudent": ["Choose a student", "Elige un estudiante"],
  "studentNotes.pickStudentBody": [
    "Choose a student to add a private note for this class and review their notes from it.",
    "Elige un estudiante para agregar una nota privada de esta clase y revisar sus notas de ella."
  ],
  "studentNotes.noStudents": [
    "No students are enrolled in this class group.",
    "No hay estudiantes inscritos en el grupo de esta clase."
  ],
  "studentNotes.for": ["Notes for {name}", "Notas de {name}"],
  "studentNotes.text": ["Private note", "Nota privada"],
  "studentNotes.textPlaceholder": [
    "Record an observation, agreement, or next step.",
    "Registra una observación, acuerdo o siguiente paso."
  ],
  "studentNotes.textRequired": ["Write a note before saving it.", "Escribe una nota antes de guardarla."],
  "studentNotes.needsFollowUp": ["Needs follow-up", "Requiere seguimiento"],
  "studentNotes.add": ["Add note", "Agregar nota"],
  "studentNotes.adding": ["Adding note…", "Agregando nota…"],
  "studentNotes.createFailed": ["Could not add this note.", "No se pudo agregar esta nota."],
  "studentNotes.history": ["Note history", "Historial de notas"],
  "studentNotes.loading": ["Loading notes…", "Cargando notas…"],
  "studentNotes.none": ["No private notes yet.", "Aún no hay notas privadas."],
  "studentNotes.loadFailed": ["Could not load these notes.", "No se pudieron cargar estas notas."],
  "studentNotes.rosterLoadFailed": [
    "Could not load the class roster for notes.",
    "No se pudo cargar la lista del grupo para las notas."
  ],
  "studentNotes.details": ["On {date} · {author} · {time}", "{date} · {author} · {time}"],
  "studentNotes.unknownAuthor": ["Unknown author", "Autor desconocido"],
  "studentNotes.resolve": ["Resolve follow-up", "Resolver seguimiento"],
  "studentNotes.resolving": ["Resolving…", "Resolviendo…"],
  "studentNotes.resolved": ["Follow-up resolved", "Seguimiento resuelto"],
  "studentNotes.resolveFailed": ["Could not resolve this follow-up.", "No se pudo resolver este seguimiento."],
  "studentNotes.open": ["Notes", "Notas"],
  "studentNotes.close": ["Close notes", "Cerrar notas"],

  // ---------------------------------------------------------------- people
  "people.eyebrow": ["Administration", "Administración"],
  "people.title": ["People", "Personas"],
  "people.addTitle": ["Add one person", "Agregar una persona"],
  "people.addBody": [
    "For a whole class list, use the spreadsheet import below. This form covers late enrollments, guests, and QA accounts.",
    "Para una lista completa, usa la importación desde hoja de cálculo que está abajo. Este formulario sirve para inscripciones tardías, invitados y cuentas de prueba."
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
  "people.addedWithInvitation": [
    "{name} was added to the roster and an invitation email was sent.",
    "{name} se agregó a la lista y se envió un correo de invitación."
  ],
  "people.addedInvitationFailed": [
    "{name} was added to the roster, but the invitation email could not be sent. Ask them to use Sign in and request a new link.",
    "{name} se agregó a la lista, pero no se pudo enviar el correo de invitación. Pídele que use Iniciar sesión y solicite un nuevo enlace."
  ],
  "people.resendInvitation": ["Resend invitation", "Reenviar invitación"],
  "people.sendingInvitation": ["Sending…", "Enviando…"],
  "people.invitationResent": ["An invitation email was sent to {name}.", "Se envió un correo de invitación a {name}."],
  "people.invitationResendFailed": [
    "The invitation email could not be sent to {name}.",
    "No se pudo enviar el correo de invitación a {name}."
  ],
  "people.addFailed": ["Could not add this person.", "No se pudo agregar a esta persona."],
  // ----------------------------------------------- people · CSV roster import
  "roster.import.title": ["Import a roster from a spreadsheet", "Importar una lista desde una hoja de cálculo"],
  "roster.import.body": [
    "Export your class list as CSV and drop it here. Nothing is written until you have seen exactly what will change.",
    "Exporta tu lista de clase como CSV y súbela aquí. No se guarda nada hasta que veas exactamente qué va a cambiar."
  ],
  "roster.import.columns": [
    "Four columns: full name, student id, institutional email and group. Name, email and group are required; student id is optional. Common header names in English and Spanish are recognised, and role defaults to student.",
    "Cuatro columnas: nombre completo, matrícula, correo institucional y grupo. El nombre, el correo y el grupo son obligatorios; la matrícula es opcional. Se reconocen los encabezados más comunes en inglés y español, y el rol es estudiante por omisión."
  ],
  "roster.import.example": ["See an example file", "Ver un archivo de ejemplo"],
  "roster.import.exampleBody": [
    "One header row, then one row per student:",
    "Una fila de encabezados y luego una fila por estudiante:"
  ],
  "roster.import.exampleGroupNote": [
    "The group has to match the short code of a group you already created on the Groups screen — a row whose group does not exist is skipped, and the preview tells you which ones.",
    "El grupo debe coincidir con la clave corta de un grupo que ya hayas creado en la pantalla Grupos — una fila con un grupo que no existe se omite, y la vista previa te dice cuáles."
  ],
  "roster.import.exampleHeaderNote": [
    "The header names do not have to be these exact ones: nombre, matrícula, correo and grupo work too, as do name, id, email and group.",
    "Los encabezados no tienen que ser exactamente estos: nombre, matrícula, correo y grupo también funcionan, igual que name, id, email y group."
  ],
  "roster.import.exampleRoleNote": [
    "Add a fifth column named role only if the file includes someone who is not a student — student, teaching_assistant, instructor or observer.",
    "Agrega una quinta columna llamada role solo si el archivo incluye a alguien que no es estudiante — student, teaching_assistant, instructor u observer."
  ],
  "roster.import.choose": ["Choose a CSV file", "Elegir un archivo CSV"],
  "roster.import.reading": ["Reading the file…", "Leyendo el archivo…"],
  "roster.import.checking": ["Checking the rows…", "Revisando las filas…"],
  "roster.import.file": ["{name} · {count} rows", "{name} · {count} filas"],
  "roster.import.missingColumns": [
    "Could not find a column for: {columns}. The file's headers were: {headers}",
    "No se encontró una columna para: {columns}. Los encabezados del archivo fueron: {headers}"
  ],
  "roster.import.emptyFile": [
    "That file has no rows in it.",
    "Ese archivo no tiene ninguna fila."
  ],
  "roster.import.truncated": [
    "Only the first {max} rows are imported at a time. Split the file and import the rest afterwards.",
    "Solo se importan {max} filas a la vez. Divide el archivo e importa el resto después."
  ],
  "roster.import.summary": [
    "{accepted} of {total} rows are ready to import.",
    "{accepted} de {total} filas están listas para importar."
  ],
  "roster.import.allGood": [
    "All {total} rows look good.",
    "Las {total} filas se ven bien."
  ],
  "roster.import.rejected": [
    "{count} rows will be skipped",
    "Se omitirán {count} filas"
  ],
  "roster.import.rejectedBody": [
    "Fix them in the spreadsheet and import again — importing now adds only the rows that passed.",
    "Corrígelas en la hoja de cálculo e importa de nuevo — si importas ahora solo se agregan las filas que pasaron."
  ],
  "roster.import.col.row": ["Row", "Fila"],
  "roster.import.col.problem": ["What is wrong", "Qué está mal"],
  "roster.import.apply": ["Import {count} people", "Importar {count} personas"],
  "roster.import.applying": ["Importing…", "Importando…"],
  "roster.import.confirm": [
    "Import {count} people into this course? People already on the roster keep their sign-in and their grades — only their name, id and section are refreshed. Do this between classes rather than during one.",
    "¿Importar {count} personas a este curso? Quienes ya están en la lista conservan su acceso y sus calificaciones — solo se actualizan su nombre, matrícula y grupo. Hazlo entre clases, no durante una."
  ],
  "roster.import.done": [
    "Imported {count} people.",
    "Se importaron {count} personas."
  ],
  "roster.import.doneWithSkips": [
    "Imported {count} people and skipped {skipped}.",
    "Se importaron {count} personas y se omitieron {skipped}."
  ],
  "roster.import.failed": ["Could not import that roster.", "No se pudo importar esa lista."],
  "roster.import.startOver": ["Choose a different file", "Elegir otro archivo"],
  "roster.import.nothingToApply": [
    "None of these rows can be imported. Fix the problems above and try again.",
    "Ninguna de estas filas se puede importar. Corrige los problemas de arriba e inténtalo de nuevo."
  ],

  // ------------------------------------------------------ people · removal
  "people.remove": ["Remove", "Quitar"],
  "people.removedLabel": ["Removed", "Quitado"],
  "people.removing": ["Removing…", "Quitando…"],
  "people.removeConfirm": [
    "Remove {name} from this course? They lose access immediately. Nothing they have already done is deleted — their work and grades stay, and adding the same email again brings them back. You cannot remove yourself.",
    "¿Quitar a {name} de este curso? Perderá el acceso de inmediato. No se borra nada de lo que ya hizo — su trabajo y calificaciones se conservan, y si agregas el mismo correo vuelve a entrar. No puedes quitarte a ti."
  ],
  "people.removed": ["{name} was removed from the course.", "{name} se quitó del curso."],
  "people.removeFailed": ["Could not remove this person.", "No se pudo quitar a esta persona."],

  // ------------------------------------------------------ people · sections
  "sections.title": ["Groups", "Grupos"],
  "sections.body": [
    "A group is one set of students who meet together. Class days, live questions and quizzes all belong to a group, so you need at least one before you can schedule anything.",
    "Un grupo es un conjunto de estudiantes que se reúnen juntos. Los días de clase, las preguntas en vivo y los quizzes pertenecen a un grupo, así que necesitas al menos uno antes de programar algo."
  ],
  "sections.col.code": ["Code", "Clave"],
  "sections.col.name": ["Name", "Nombre"],
  "sections.col.meets": ["Meets", "Se reúne"],
  "sections.add": ["Add a group", "Agregar un grupo"],
  "sections.adding": ["Adding…", "Agregando…"],
  "sections.code": ["Short code", "Clave corta"],
  "sections.codeHint": ["How you refer to it — e.g. A, 601, or Tue-Thu.", "Como te refieres a él — por ejemplo A, 601 o Mar-Jue."],
  "sections.name": ["Name", "Nombre"],
  "sections.meetingPattern": ["When it meets (optional)", "Cuándo se reúne (opcional)"],
  "sections.meetingHint": ["For example \"Tue & Thu 10:00\".", "Por ejemplo \"Mar y Jue 10:00\"."],
  "sections.added": ["Group {code} was created.", "Se creó el grupo {code}."],
  "sections.saveFailed": ["Could not save that group.", "No se pudo guardar ese grupo."],
  "sections.edit": ["Edit", "Editar"],
  "sections.members": ["Manage members", "Administrar integrantes"],
  "sections.campus": ["Campus (optional)", "Campus (opcional)"],
  "sections.status": ["Status", "Estado"],
  "sections.save": ["Save changes", "Guardar cambios"],
  "sections.saving": ["Saving…", "Guardando…"],
  "sections.keep": ["Keep editing", "Seguir editando"],
  "sections.saved": ["Group {code} was updated.", "Se actualizó el grupo {code}."],
  "sections.retire": ["Retire", "Retirar"],
  "sections.retireConfirm": [
    "Retire group {code}? It stops appearing when you schedule a class. Existing class days, grades and students are untouched.",
    "¿Retirar el grupo {code}? Dejará de aparecer al programar una clase. Los días de clase, calificaciones y estudiantes existentes no se tocan."
  ],
  "sections.reactivate": ["Reactivate", "Reactivar"],
  "sections.ownerOnly": [
    "Groups are created, renamed and retired by the platform owner. You can manage the members of the groups you teach.",
    "Los grupos son creados, renombrados y retirados por el administrador de la plataforma. Puedes administrar a los integrantes de los grupos que impartes."
  ],

  // ---------------------------------------------------------------- schedule
  "schedule.title": ["Class days", "Días de clase"],
  "schedule.body": [
    "One entry per class meeting. You run a class from here, and a lecture can be tied to a class day so it appears on that day's Today screen.",
    "Una entrada por cada sesión de clase. Desde aquí das clase, y una lección puede vincularse a un día para que aparezca en la pantalla de Hoy de ese día."
  ],
  "schedule.loading": ["Loading your class days…", "Cargando tus días de clase…"],
  "schedule.loadFailed": ["Could not load your class days.", "No se pudieron cargar tus días de clase."],
  "schedule.emptyTitle": ["No class days yet", "Aún no hay días de clase"],
  "schedule.emptyBody": [
    "Add your first class day below. Once one exists you can run a class from Home, and tie lectures to it.",
    "Agrega tu primer día de clase abajo. En cuanto exista uno podrás dar clase desde Inicio y vincularle lecciones."
  ],
  "schedule.noGroups": [
    "Create a group first — every class day belongs to one.",
    "Crea primero un grupo — cada día de clase pertenece a uno."
  ],
  "schedule.col.when": ["When", "Cuándo"],
  "schedule.col.what": ["Class", "Clase"],
  "schedule.col.group": ["Group", "Grupo"],
  "schedule.col.lecture": ["Lecture", "Lección"],
  "schedule.add": ["Add a class day", "Agregar un día de clase"],
  "schedule.adding": ["Adding…", "Agregando…"],
  "schedule.date": ["Date", "Fecha"],
  "schedule.classTitle": ["What is this class about", "De qué trata esta clase"],
  "schedule.titleHint": [
    "For example \"Week 3: Database Security\". Students see this.",
    "Por ejemplo \"Semana 3: Seguridad en Bases de Datos\". Los estudiantes lo ven."
  ],
  "schedule.group": ["Group", "Grupo"],
  "schedule.lecture": ["Lecture (optional)", "Lección (opcional)"],
  "schedule.lectureNone": ["No lecture yet", "Aún sin lección"],
  "schedule.lectureHint": [
    "Choosing a lecture connects its deck and question bank to this class.",
    "Elegir una lección conecta su presentación y banco de preguntas con esta clase."
  ],
  "schedule.noLecture": ["Not chosen", "Sin elegir"],
  "schedule.added": ["{title} was added for {date}.", "Se agregó {title} para el {date}."],
  "schedule.addFailed": ["Could not add that class day.", "No se pudo agregar ese día de clase."],
  "schedule.edit": ["Edit", "Editar"],
  "schedule.save": ["Save changes", "Guardar cambios"],
  "schedule.saving": ["Saving…", "Guardando…"],
  "schedule.keep": ["Keep editing", "Seguir editando"],
  "schedule.saveFailed": ["Could not save that class day.", "No se pudo guardar ese día de clase."],
  "schedule.saved": ["{title} was updated.", "Se actualizó {title}."],
  "schedule.cancel": ["Cancel this class", "Cancelar esta clase"],
  "schedule.cancelConfirm": [
    "Cancel {title}? It will be marked cancelled and stay visible in your schedule, but students can no longer join it. Anything already graded stays.",
    "¿Cancelar {title}? Se marcará como cancelada y seguirá visible en tu calendario, pero los estudiantes ya no podrán entrar. Lo ya calificado se conserva."
  ],
  "schedule.cancelled": ["{title} was cancelled.", "Se canceló {title}."],
  "schedule.delete": ["Delete", "Eliminar"],
  "schedule.deleteConfirm": [
    "Permanently delete \"{title}\"? Only a class day with no recorded live-question activity can be deleted. This also removes any notes recorded for it — related grade records will be unlinked, not deleted.",
    "¿Eliminar permanentemente \"{title}\"? Solo se puede eliminar un día de clase sin actividad de preguntas en vivo registrada. Esto también borra las notas registradas — los registros de calificación relacionados se desvincularán, no se eliminarán."
  ],
  "schedule.deleted": ["\"{title}\" was deleted.", "\"{title}\" fue eliminado."],
  "schedule.deleteFailed": ["Could not delete this class day.", "No se pudo eliminar este día de clase."],
  "schedule.forceDeleteWarning": [
    "This will also permanently delete every recorded pulse-question round and answer for this class. There is no undo.",
    "Esto también eliminará permanentemente cada ronda y respuesta de preguntas en vivo registrada para esta clase. No hay forma de deshacerlo."
  ],
  "schedule.run": ["Run this class", "Dar esta clase"],

  "people.roster": ["Roster", "Lista del curso"],
  "people.loadingRoster": ["Loading the roster…", "Cargando la lista…"],
  "people.emptyTitle": ["Nobody on the roster yet", "Aún no hay nadie en la lista"],
  "people.emptyBody": [
    "Add people above, or import the class CSV to bring everyone in at once.",
    "Agrega personas arriba o importa el CSV del grupo para incorporar a todos de una vez."
  ],
  "people.viewingGroup": ["Viewing Group {group}", "Viendo el grupo {group}"],
  "people.clearGroup": ["Show everyone", "Mostrar a todas las personas"],
  "people.groupEmpty": ["No one is enrolled in this group yet.", "Aún no hay nadie inscrito en este grupo."],
  "people.loadFailed": ["Could not load the roster and groups.", "No se pudieron cargar la lista y los grupos."],
  "people.group": ["Group", "Grupo"],
  "people.chooseGroup": ["Choose a group", "Elige un grupo"],
  "people.assignGroup": ["Assign group", "Asignar grupo"],
  "people.changeGroup": ["Change group", "Cambiar grupo"],
  "people.assigningGroup": ["Saving group…", "Guardando grupo…"],
  "people.groupAssigned": ["{name} is now in {group}.", "{name} ahora está en {group}."],
  "people.assignGroupFailed": ["Could not change this student's group.", "No se pudo cambiar el grupo de este estudiante."],
  "people.assignGroupUnavailable": [
    "Choose an active or planned group.",
    "Elige un grupo activo o planificado."
  ],
  "people.assignStudentUnavailable": [
    "Only an active or invited student can be assigned to a group.",
    "Solo se puede asignar a un grupo un estudiante activo o invitado."
  ],
  "people.assignRoleUnavailable": [
    "Only student accounts can be assigned to a group.",
    "Solo las cuentas de estudiante se pueden asignar a un grupo."
  ],
  "people.groupNotAssignable": [
    "This group is completed or archived. Reactivate it before assigning students.",
    "Este grupo está completado o archivado. Reactívalo antes de asignar estudiantes."
  ],
  "people.assignToViewingGroup": ["Assign a student to {group}", "Asignar un estudiante a {group}"],
  "people.student": ["Student", "Estudiante"],
  "people.chooseStudent": ["Choose a student", "Elige un estudiante"],
  "people.noStudentsToAssign": [
    "Every active student is already in this group.",
    "Todos los estudiantes activos ya están en este grupo."
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
  "run.classroomQuestion.eyebrow": ["Live question", "Pregunta en vivo"],
  "run.classroomQuestion.answerNeutral": [
    "Choose the best answer on your phone.",
    "Elige la mejor respuesta en tu teléfono."
  ],
  "run.classroomQuestion.continueHint": [
    "Continue the lecture when you are ready.",
    "Continúa la clase cuando estés listo."
  ],
  "run.classroomQuestion.fullscreen": ["Full screen", "Pantalla completa"],
  "run.classroomQuestion.exitFullscreen": [
    "Exit full screen",
    "Salir de pantalla completa"
  ],
  "run.whoAnswered": ["Who answered", "Quién respondió"],
  "run.nobodyYet": ["Nobody has answered yet.", "Todavía nadie ha respondido."],
  "run.correctLabel": ["Correct", "Correcta"],
  "run.theirAnswer": ["Their answer", "Su respuesta"],
  "run.startSessionFirst": [
    "Start the class session before sending a question.",
    "Inicia la sesión de clase antes de enviar una pregunta."
  ],
  "run.join.eyebrow": ["Student entry", "Entrada de estudiantes"],
  "run.join.title": ["Scan to join this class", "Escanea para entrar a esta clase"],
  "run.join.body": [
    "Students scan once, sign in if needed, and stay on the live class screen for every question, quiz, and reflection.",
    "Los estudiantes escanean una vez, inician sesión si hace falta y se quedan en la pantalla de clase en vivo para cada pregunta, quiz y reflexión."
  ],
  "run.join.code": ["Class code: {code}", "Código de clase: {code}"],
  "run.join.qrAlt": [
    "QR code that opens this class",
    "Código QR que abre esta clase"
  ],
  "run.join.qrLoading": ["Building the QR code…", "Generando el código QR…"],
  "run.join.qrFailed": [
    "The QR code could not be generated. Students can use the link or class code instead.",
    "No se pudo generar el código QR. Los estudiantes pueden usar el enlace o el código de clase."
  ],
  "run.start.title": ["Ready to teach", "Todo listo para dar clase"],
  "run.start.body": [
    "Preview the lecture and QR, then start the class when students are ready to join.",
    "Revisa la presentación y el QR; inicia la clase cuando el grupo esté listo para entrar."
  ],
  "run.start.unavailable": [
    "This class cannot be started from its current state.",
    "Esta clase no se puede iniciar en su estado actual."
  ],
  "run.start": ["Start class", "Iniciar clase"],
  "run.starting": ["Starting class…", "Iniciando la clase…"],
  "run.startFailed": ["Could not start the class.", "No se pudo iniciar la clase."],
  "run.controller.eyebrow": ["Projector control", "Control del proyector"],
  "run.controller.title": ["Classroom display", "Pantalla del salón"],
  "run.controller.body": ["Open the projector view on the classroom screen, then move the lecture from here.", "Abre la vista del proyector en la pantalla del salón y mueve la clase desde aquí."],
  "run.controller.projectorLive": ["Projector connected", "Proyector conectado"],
  "run.controller.projectorOffline": ["Projector not connected", "Proyector no conectado"],
  "run.controller.previous": ["Previous", "Anterior"],
  "run.controller.next": ["Next", "Siguiente"],
  "run.controller.slide": ["Slide {slide}", "Diapositiva {slide}"],
  "run.controller.openProjector": ["Open projector view", "Abrir vista del proyector"],
  "run.controller.failed": ["Projector control is temporarily unavailable.", "El control del proyector no está disponible temporalmente."],
  "run.loadingBanksFailed": [
    "Could not load this lecture's question bank.",
    "No se pudo cargar el banco de preguntas de esta clase."
  ],
  "run.deck.opening": [
    "Opening the private lecture deck…",
    "Abriendo la presentación privada…"
  ],
  "run.deck.openFailed": [
    "Could not open the private lecture deck.",
    "No se pudo abrir la presentación privada."
  ],
  "run.deck.refreshWarning": [
    "The deck is still available, but its access refresh failed. We will retry automatically.",
    "La presentación sigue disponible, pero falló la renovación del acceso. Lo intentaremos de nuevo automáticamente."
  ],
  "run.deck.unavailable": [
    "Lecture deck unavailable",
    "Presentación no disponible"
  ],
  "run.deck.noLecture": [
    "No lecture selected for this class",
    "No hay una presentación elegida para esta clase"
  ],
  "run.deck.noLectureBody": [
    "The class can still start, but checkpoints and the final quiz need a lecture selected on the class day.",
    "La clase puede iniciar, pero los puntos de control y el quiz final necesitan una presentación elegida en el día de clase."
  ],
  "run.deck.openClasses": ["Open Classes", "Abrir Clases"],
  "run.plan.title": ["Class question plan", "Plan de preguntas de la clase"],
  "run.plan.create": ["Create plan", "Crear plan"],
  "run.plan.createHint": [
    "Choose the active bank for this class session before adding checkpoints.",
    "Elige el banco activo de esta sesión antes de agregar puntos de control."
  ],
  "run.plan.bankLabel": ["Question bank", "Banco de preguntas"],
  "run.plan.noPlan": [
    "This class does not have a question plan yet.",
    "Esta clase todavía no tiene un plan de preguntas."
  ],
  "run.plan.addCheckpoint": ["Add checkpoint", "Agregar punto de control"],
  "run.plan.pickSlideLabel": ["Which slide are you on?", "¿En qué diapositiva estás?"],
  "run.plan.slideOption": [
    "Slide {slide} — {topic}",
    "Diapositiva {slide} — {topic}"
  ],
  "run.plan.slideOnlyOption": ["Slide {slide}", "Diapositiva {slide}"],
  "run.plan.noUpcoming": [
    "No upcoming checkpoints. Add one to get started.",
    "No hay puntos de control pendientes. Agrega uno para empezar."
  ],
  "run.plan.history": ["Asked so far", "Preguntado hasta ahora"],
  "run.plan.topicLabel": ["Topic", "Tema"],
  "run.plan.slideHintLabel": ["Slide hint", "Pista de diapositiva"],
  "run.plan.notesLabel": ["Notes", "Notas"],
  "run.plan.candidatesLabel": ["Candidate questions", "Preguntas candidatas"],
  "run.plan.edit": ["Edit", "Editar"],
  "run.plan.remove": ["Remove", "Quitar"],
  "run.plan.removeConfirm": [
    "Remove this checkpoint from the class plan?",
    "¿Quitar este punto de control del plan de la clase?"
  ],
  "run.plan.save": ["Save", "Guardar"],
  "run.plan.cancel": ["Cancel", "Cancelar"],
  "run.plan.askNow": ["Ask now", "Preguntar ahora"],
  "run.plan.deckOnSlide": ["Deck on slide {slide}", "Presentación en la diapositiva {slide}"],
  "run.plan.deckWaiting": [
    "Waiting for the deck to report its slide",
    "Esperando a que la presentación indique su diapositiva"
  ],
  "run.plan.autoAskNext": [
    "next poll sends itself at slide {slide} ({topic})",
    "la siguiente encuesta se envía sola en la diapositiva {slide} ({topic})"
  ],
  "run.plan.autoAskNoneLeft": [
    "no more polls are tied to a slide",
    "ya no hay encuestas ligadas a una diapositiva"
  ],
  "run.plan.deckSilent": [
    "This deck cannot tell the platform which slide you are on, so polls will not send themselves. Ask each one from here, or use a lecture built with the current deck engine.",
    "Esta presentación no puede indicar a la plataforma en qué diapositiva estás, así que las encuestas no se enviarán solas. Lanza cada una desde aquí o usa una presentación con el motor actual."
  ],
  "run.plan.afterSlide": [
    "After slide {slide}",
    "Después de la diapositiva {slide}"
  ],
  "run.plan.alreadyAsked": ["Already asked", "Ya se preguntó"],
  "run.plan.skipped": ["Skipped", "Omitido"],
  "run.plan.noCandidates": [
    "No candidate questions selected yet.",
    "Todavía no hay preguntas candidatas seleccionadas."
  ],
  "run.plan.staleCandidates": [
    "Some saved candidate questions are no longer available in the active bank.",
    "Algunas preguntas candidatas guardadas ya no están disponibles en el banco activo."
  ],
  "run.plan.liveRequired": [
    "Ask now is enabled once the class is live.",
    "Preguntar ahora se habilita cuando la clase está en vivo."
  ],
  "run.plan.loadFailed": [
    "Could not load the class question plan.",
    "No se pudo cargar el plan de preguntas de la clase."
  ],
  "run.plan.createFailed": [
    "Could not create the class question plan.",
    "No se pudo crear el plan de preguntas de la clase."
  ],
  "run.plan.saveFailed": [
    "Could not save the class question plan changes.",
    "No se pudieron guardar los cambios del plan de preguntas."
  ],
  "run.plan.class_question_plan_failed": [
    "The class question plan could not be updated right now.",
    "No se pudo actualizar el plan de preguntas en este momento."
  ],
  "run.plan.class_question_plan_action_invalid": [
    "This class question plan action is not available.",
    "Esta acción del plan de preguntas no está disponible."
  ],
  "run.plan.class_question_plan_auth_invalid": [
    "Your session expired. Sign in again to continue editing the class plan.",
    "Tu sesión venció. Inicia sesión de nuevo para seguir editando el plan."
  ],
  "run.plan.class_question_plan_auth_required": [
    "Sign in to continue editing the class question plan.",
    "Inicia sesión para seguir editando el plan de preguntas."
  ],
  "run.plan.class_question_plan_bank_mismatch": [
    "The selected bank does not match this class plan anymore.",
    "El banco seleccionado ya no coincide con este plan de clase."
  ],
  "run.plan.class_question_plan_checkpoint_id_invalid": [
    "That checkpoint is no longer valid. Reload the class plan and try again.",
    "Ese punto de control ya no es válido. Recarga el plan e inténtalo de nuevo."
  ],
  "run.plan.class_question_plan_checkpoint_not_found": [
    "That checkpoint could not be found. Reload the class plan and try again.",
    "No se encontró ese punto de control. Recarga el plan e inténtalo de nuevo."
  ],
  "run.plan.class_question_plan_exists": [
    "This class already has a question plan.",
    "Esta clase ya tiene un plan de preguntas."
  ],
  "run.plan.class_question_plan_forbidden": [
    "You do not have permission to edit this class question plan.",
    "No tienes permiso para editar este plan de preguntas."
  ],
  "run.plan.class_question_plan_method_not_allowed": [
    "This class question plan request is not allowed.",
    "Esta solicitud del plan de preguntas no está permitida."
  ],
  "run.plan.class_question_plan_not_found": [
    "This class question plan no longer exists.",
    "Este plan de preguntas ya no existe."
  ],
  "run.plan.class_question_plan_plan_id_invalid": [
    "That class question plan is no longer valid. Reload and try again.",
    "Ese plan de preguntas ya no es válido. Recarga e inténtalo de nuevo."
  ],
  "run.plan.class_question_plan_profile_not_found": [
    "Your instructor profile could not be confirmed for this class plan.",
    "No se pudo confirmar tu perfil de profesor para este plan."
  ],
  "run.plan.class_question_plan_question_bank_id_invalid": [
    "Choose a valid active question bank for this class plan.",
    "Elige un banco de preguntas activo y válido para este plan."
  ],
  "run.plan.class_question_plan_topic_required": [
    "Each checkpoint needs a topic.",
    "Cada punto de control necesita un tema."
  ],
  "run.plan.class_question_plan_slide_hint_invalid": [
    "Slide hints must be whole numbers greater than zero.",
    "Las pistas de diapositiva deben ser números enteros mayores que cero."
  ],
  "run.plan.class_question_plan_checkpoint_locked": [
    "This checkpoint is already part of class history and can no longer change.",
    "Este punto de control ya forma parte del historial de la clase y ya no se puede cambiar."
  ],
  "run.plan.class_question_plan_question_not_in_bank": [
    "Every selected candidate must belong to this class plan's active bank.",
    "Cada candidata seleccionada debe pertenecer al banco activo de este plan."
  ],
  "run.plan.class_question_plan_question_ids_invalid": [
    "Choose valid candidate questions from the active bank.",
    "Elige preguntas candidatas válidas del banco activo."
  ],
  "run.plan.class_question_plan_question_ids_duplicate": [
    "Choose each candidate question only once.",
    "Elige cada pregunta candidata solo una vez."
  ],
  "run.plan.class_question_plan_question_id_invalid": [
    "That candidate question is no longer valid. Reload the plan and try again.",
    "Esa pregunta candidata ya no es válida. Recarga el plan e inténtalo de nuevo."
  ],
  "run.plan.class_question_plan_question_bank_not_active": [
    "The selected question bank is no longer active for this course.",
    "El banco de preguntas seleccionado ya no está activo para este curso."
  ],
  "run.plan.class_question_plan_question_unavailable": [
    "That saved candidate question is no longer available to send.",
    "Esa pregunta candidata guardada ya no está disponible para enviarse."
  ],
  "run.plan.class_question_plan_question_not_candidate": [
    "That question is no longer one of this checkpoint's approved candidates.",
    "Esa pregunta ya no es una de las candidatas aprobadas para este punto."
  ],
  "run.plan.class_question_plan_payload_invalid": [
    "This checkpoint request is no longer valid. Reload the plan and try again.",
    "Esta solicitud del punto de control ya no es válida. Recarga el plan e inténtalo de nuevo."
  ],
  "run.plan.class_question_plan_session_id_invalid": [
    "This class session is no longer valid for question planning.",
    "Esta sesión de clase ya no es válida para planear preguntas."
  ],
  "run.plan.class_question_plan_session_not_found": [
    "This class session could not be found for question planning.",
    "No se encontró esta sesión de clase para planear preguntas."
  ],
  "run.plan.class_question_plan_session_state_invalid": [
    "This class session can no longer be edited.",
    "Esta sesión de clase ya no se puede editar."
  ],
  "run.plan.class_question_plan_source_plan_id_invalid": [
    "The source class plan is no longer valid.",
    "El plan de clase de origen ya no es válido."
  ],
  "run.plan.class_question_plan_source_plan_not_found": [
    "The source class plan could not be found.",
    "No se encontró el plan de clase de origen."
  ],
  "run.checkpoint.eyebrow": ["Lecture checkpoint", "Punto de control"],
  "run.checkpoint.title": ["Live question controls", "Controles de la pregunta en vivo"],
  "run.checkpoint.afterSlide": [
    "After slide {slide}",
    "Después de la diapositiva {slide}"
  ],
  "run.checkpoint.teaching": [
    "Continue the lecture in the deck.",
    "Continúa la clase en la presentación."
  ],
  "run.checkpoint.next": [
    "The next prepared question appears after slide {slide}.",
    "La siguiente pregunta preparada aparece después de la diapositiva {slide}."
  ],
  "run.checkpoint.finalReached": [
    "All prepared teaching checkpoints are complete.",
    "Se completaron todos los puntos de control preparados."
  ],
  "run.checkpoint.loading": [
    "Choosing a question for the checkpoint after slide {slide}…",
    "Eligiendo una pregunta para el punto después de la diapositiva {slide}…"
  ],
  "run.checkpoint.source": [
    "Slides {start}–{end}",
    "Diapositivas {start}–{end}"
  ],
  "run.checkpoint.skip": ["Skip this checkpoint", "Omitir este punto"],
  "run.checkpoint.continue": ["Continue lecture", "Continuar la clase"],
  "run.checkpoint.closeContinue": [
    "Close and continue",
    "Cerrar y continuar"
  ],
  "run.checkpoint.spaceHint": [
    "Press Space in the deck to send. Right Arrow skips.",
    "Presiona Espacio en la presentación para enviar. Flecha derecha omite."
  ],
  "run.checkpoint.autoSend": [
    "Send each question when I reach its slide",
    "Enviar cada pregunta al llegar a su diapositiva"
  ],
  "run.checkpoint.autoSendOn": [
    "You can teach from fullscreen: reaching the slide a poll is planned for puts its question on student phones. Applies to the class question plan below and to decks that stop by themselves.",
    "Puedes dar clase en pantalla completa: al llegar a la diapositiva de una encuesta planeada, su pregunta aparece en los teléfonos. Aplica al plan de preguntas de abajo y a las presentaciones que se detienen solas."
  ],
  "run.checkpoint.autoSendOff": [
    "Questions wait until you send them, from this panel, from the plan below, or with Space in the deck.",
    "Las preguntas esperan hasta que las envíes, desde este panel, desde el plan de abajo o con Espacio en la presentación."
  ],
  "run.checkpoint.autoSendHeld": [
    "This one was not sent automatically. Press Space in the deck or send it here. Right Arrow skips.",
    "Esta no se envió automáticamente. Presiona Espacio en la presentación o envíala aquí. Flecha derecha omite."
  ],
  "run.reopen": ["Reopen this class", "Reabrir esta clase"],
  "run.reopening": ["Reopening…", "Reabriendo…"],
  "run.reopenReason": [
    "Reopened by the professor from Run class.",
    "Reabierta por el profesor desde Dar clase."
  ],
  "run.reopenFailed": [
    "Could not reopen this class.",
    "No se pudo reabrir esta clase."
  ],
  "run.reset.title": ["Reset this class day", "Reiniciar este día de clase"],
  "run.reset.body": [
    "Clears everything this class recorded — questions asked, answers, attendance, the quiz, reflections and its grade — and arms the planned polls again. The class day, its lecture and its question plan stay exactly as they are.",
    "Borra todo lo que registró esta clase — preguntas lanzadas, respuestas, asistencia, el quiz, las reflexiones y su calificación — y deja las encuestas planeadas listas otra vez. El día de clase, su presentación y su plan de preguntas se conservan."
  ],
  "run.reset.action": ["Reset this class day", "Reiniciar este día de clase"],
  "run.reset.confirmAction": [
    "Yes, erase this class day",
    "Sí, borrar este día de clase"
  ],
  "run.reset.confirm": [
    "This cannot be undone. Press again to confirm.",
    "Esto no se puede deshacer. Presiona otra vez para confirmar."
  ],
  "run.reset.endFirst": [
    "End the class first — a live class cannot be reset from under the students.",
    "Termina la clase primero: no se puede reiniciar una clase en vivo con estudiantes dentro."
  ],
  "run.reset.done": [
    "Cleared {rounds} question(s), {answers} answer(s) and {attendance} check-in(s). {polls} planned poll(s) are ready to ask again.",
    "Se borraron {rounds} pregunta(s), {answers} respuesta(s) y {attendance} registro(s) de asistencia. {polls} encuesta(s) planeada(s) están listas de nuevo."
  ],
  "run.reset.failed": [
    "Could not reset this class day.",
    "No se pudo reiniciar este día de clase."
  ],
  "run.answeredOfPresent": [
    "{answered} of {present} in the room · {enrolled} on the roster",
    "{answered} de {present} en el salón · {enrolled} en la lista"
  ],
  "run.checkpoint.autoRevealHint": [
    "The answer shows itself when the timer ends, when everyone in the room has answered, or once you move three slides past the question. Students then see whether they were right.",
    "La respuesta se muestra sola cuando termina el tiempo, cuando todos en el salón han respondido, o al avanzar tres diapositivas después de la pregunta. Entonces cada quien ve si acertó."
  ],
  "run.checkpoint.revealedAutoHint": [
    "Students can see whether they were right. It clears from their phones on its own; the next question closes this one.",
    "Cada quien ve si acertó. Se quita solo de los teléfonos; la siguiente pregunta cierra esta."
  ],
  "run.checkpoint.spaceRevealHint": [
    "Press Space in the deck to show the answer.",
    "Presiona Espacio en la presentación para mostrar la respuesta."
  ],
  "run.checkpoint.arrowHint": [
    "Press Right Arrow in the deck to continue.",
    "Presiona Flecha derecha en la presentación para continuar."
  ],
  "run.checkpoint.manualBody": [
    "Use the prepared checkpoint list while deck controls are unavailable.",
    "Usa la lista de puntos preparados mientras los controles de la presentación no estén disponibles."
  ],
  "run.checkpoint.manualSelect": [
    "Choose the current checkpoint",
    "Elige el punto de control actual"
  ],
  "run.checkpoint.choose": ["Choose a checkpoint…", "Elige un punto…"],
  "run.checkpoint.option": [
    "After slide {slide} · {count} questions",
    "Después de la diapositiva {slide} · {count} preguntas"
  ],
  "run.checkpoint.bridgeFailed": [
    "The lecture deck controls did not connect.",
    "Los controles de la presentación no se conectaron."
  ],
  "run.checkpoint.recoverFailed": [
    "The current live question could not be restored. Retry before continuing the lecture.",
    "No se pudo restaurar la pregunta en vivo actual. Vuelve a intentarlo antes de continuar la clase."
  ],
  "run.checkpoint.noQuestion": [
    "No question is ready for this checkpoint.",
    "No hay una pregunta lista para este punto de control."
  ],
  "run.checkpoint.mismatch": [
    "The question did not match this slide checkpoint.",
    "La pregunta no correspondió a este punto de la presentación."
  ],
  "run.checkpoint.noBank": [
    "This lecture has no ready checkpoint bank. The deck still works, but live questions and the final quiz are unavailable.",
    "Esta presentación no tiene un banco de puntos listo. La presentación funciona, pero las preguntas en vivo y el quiz final no están disponibles."
  ],
  "run.checkpoint.planDrivenBank": [
    "This deck does not stop for questions on its own. Use the class question plan below to ask each one, then start the quiz when you are finished.",
    "Esta presentación no se detiene sola en las preguntas. Usa el plan de preguntas de la clase para lanzar cada una y después inicia el quiz cuando termines."
  ],
  "run.checkpoint.openContent": [
    "Check the question bank",
    "Revisar el banco de preguntas"
  ],

  // ---------------------------------------------------------------- projector
  "projector.loading": [
    "Synchronizing the classroom display…",
    "Sincronizando la pantalla del salón…"
  ],
  "projector.syncFailed": [
    "The classroom display could not synchronize. Retrying…",
    "La pantalla del salón no pudo sincronizarse. Reintentando…"
  ],
  "projector.unavailableTitle": [
    "Projector unavailable",
    "Proyector no disponible"
  ],
  "projector.unavailableBody": [
    "This class does not have a lecture deck available for the classroom display.",
    "Esta clase no tiene una presentación disponible para la pantalla del salón."
  ],
  "projector.deckTitle": ["Classroom lecture deck", "Presentación para el salón"],
  "projector.pulse.eyebrow": ["Class checkpoint", "Punto de control"],
  "projector.pulse.answeredOf": [
    "{answered} of {eligible} answered",
    "{answered} de {eligible} respondieron"
  ],
  "projector.pulse.correctAnswer": [
    "Correct answer: {answer}",
    "Respuesta correcta: {answer}"
  ],

  // ---------------------------------------------------------------- end of class
  "endOfClass.title": ["End-of-class quiz", "Quiz de fin de clase"],
  "endOfClass.body": [
    "A mixed set of easy, medium, and hard questions drawn from today's lecture bank — nothing to type.",
    "Un conjunto mixto de preguntas fáciles, medias y difíciles tomadas del banco de esta clase — no hay nada que escribir."
  ],
  "endOfClass.start": ["Start the quiz", "Iniciar el quiz"],
  "endOfClass.startAnother": ["Start another quiz", "Iniciar otro quiz"],
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
  "live.pausedTitle": ["Class paused", "Clase pausada"],
  "live.pausedBody": [
    "Your professor paused the class. Stay on this screen — the next question appears here as soon as it continues.",
    "Tu profesor pausó la clase. Quédate en esta pantalla: la siguiente pregunta aparecerá aquí en cuanto continúe."
  ],
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
  "quiz.next": ["Next", "Siguiente"],
  "quiz.submit": ["Submit quiz", "Enviar quiz"],
  "quiz.submitting": ["Submitting…", "Enviando…"],
  "quiz.answeredOf": ["{answered} of {total} answered", "{answered} de {total} respondidas"],
  "quiz.done": ["Quiz submitted", "Quiz enviado"],
  "quiz.doneBody": [
    "Your score is recorded. Your professor will show the class results shortly.",
    "Tu calificación quedó registrada. Tu profesor mostrará los resultados del grupo en un momento."
  ],
  "run.step.end": ["End the class", "Terminar la clase"],
  "run.step.endBody": [
    "Closes the class for students: the live screen stops being offered, and any open question or running quiz is closed.",
    "Cierra la clase para los estudiantes: deja de ofrecerse la pantalla en vivo y se cierra cualquier pregunta abierta o quiz en curso."
  ],
  "run.endClass": ["End the class", "Terminar la clase"],
  "run.pause": ["Pause the class", "Pausar la clase"],
  "run.pausing": ["Pausing…", "Pausando…"],
  "run.pauseFailed": [
    "The class could not be paused. Try again.",
    "No se pudo pausar la clase. Inténtalo de nuevo."
  ],
  "run.resume": ["Resume the class", "Reanudar la clase"],
  "run.resuming": ["Resuming…", "Reanudando…"],
  "run.resumeFailed": [
    "The class could not be resumed. Try again.",
    "No se pudo reanudar la clase. Inténtalo de nuevo."
  ],
  "run.paused": ["Class paused", "Clase pausada"],
  "run.pausedBody": [
    "Nothing has been graded and the lecture has not been published. Your students keep this class as theirs. Resume it whenever you are ready — later today or next session.",
    "Nada se ha calificado y la clase no se ha publicado. Tus estudiantes conservan esta clase como suya. Reanúdala cuando quieras, hoy mismo o en la próxima sesión."
  ],
  "run.endConfirm": [
    "End the class now? Any open question and any running quiz will be closed, and students will no longer be able to join. Reflections stay open for a few more minutes.",
    "¿Terminar la clase ahora? Se cerrará cualquier pregunta abierta y cualquier quiz en curso, y los estudiantes ya no podrán unirse. Las reflexiones siguen abiertas unos minutos más."
  ],
  "run.endConfirmAction": [
    "Confirm: end the class",
    "Confirmar: terminar la clase"
  ],
  "run.ended": ["Class ended", "Clase terminada"],
  "run.endedBody": [
    "This class is closed. Reflections submitted during the grace window still appear above.",
    "Esta clase está cerrada. Las reflexiones enviadas durante el periodo de gracia siguen apareciendo arriba."
  ],
  "run.endFailed": ["Could not end the class.", "No se pudo terminar la clase."],

  // ---------------------------------------------------------------- content (AI pipeline)
  "content.eyebrow": ["COURSE MATERIALS", "MATERIAL DEL CURSO"],
  "content.title": ["Content", "Contenido"],
  "content.lede": [
    "Upload a lecture PDF and the platform builds the web deck and its question bank for you. You review everything before students can see any of it.",
    "Sube el PDF de una clase y la plataforma arma la presentación web y su banco de preguntas. Tú revisas todo antes de que los estudiantes puedan verlo."
  ],
  // ------------------------------------------------- content · your library
  "content.tab.library": ["Materials", "Materiales"],
  "content.tab.banks": ["Question banks", "Bancos de preguntas"],
  "content.tab.generate": ["Generate from a PDF", "Generar desde un PDF"],
  "content.tab.import": ["Import", "Importar"],
  "content.library.loading": ["Loading materials…", "Cargando materiales…"],
  "content.library.loadFailed": ["Could not load your materials.", "No se pudieron cargar tus materiales."],
  "content.library.emptyTitle": ["No materials can be released for review yet", "Aún no hay materiales que se puedan publicar para repasar"],
  "content.library.emptyBody": [
    "Lectures, missions, case files, and resources with a student delivery route appear here.",
    "Aquí aparecen las clases, misiones, casos y recursos que tienen una ruta de entrega para estudiantes."
  ],
  "content.library.unmanagedTitle": ["Other items", "Otros elementos"],
  "content.library.unmanagedHint": [
    "These aren't shown to students in Review and have no availability controls here — for example, a question-bank-only import with no lecture deck. Delete is available if you no longer need one.",
    "Estos no se muestran a los estudiantes en Revisión y no tienen controles de disponibilidad aquí — por ejemplo, una importación de solo banco de preguntas sin diapositivas. Puedes eliminarlo si ya no lo necesitas."
  ],
  "content.library.lede": [
    "Materials here have a student delivery route. \"Available\" means students can open them from Review. Take a material back whenever you want — nothing they have already done is lost.",
    "Los materiales aquí tienen una ruta de entrega para estudiantes. \"Disponible\" significa que pueden abrirlos desde Repasar. Puedes quitar un material cuando quieras — no se pierde nada de lo que ya hayan hecho."
  ],
  "content.library.countAvailable": [
    "{available} of {total} available to students",
    "{available} de {total} disponibles para estudiantes"
  ],
  "content.library.filterAll": ["All", "Todo"],
  "content.library.filterAvailable": ["Available to students", "Disponible para estudiantes"],
  "content.library.filterHidden": ["Not available", "No disponible"],

  "content.library.statusAvailable": ["Students can open it", "Los estudiantes pueden abrirlo"],
  "content.library.statusHidden": ["Not available to students", "No disponible para estudiantes"],

  "content.library.makeAvailable": ["Make available now", "Ponerlo disponible ahora"],
  "content.library.removeFromReview": ["Remove from Review", "Quitar de Repasar"],
  "content.library.cancelScheduled": ["Cancel scheduled access", "Cancelar acceso programado"],
  "content.library.assignToClass": ["Assign to a class", "Asignar a una clase"],
  "content.library.assignClassPlaceholder": [
    "Choose an unstarted class",
    "Elige una clase que no haya comenzado"
  ],
  "content.library.assignmentOption": [
    "{date} · Group {group} · {title} · {lecture}",
    "{date} · Grupo {group} · {title} · {lecture}"
  ],
  "content.library.noLecture": ["No lecture assigned", "Sin clase asignada"],
  "content.library.plannedAssignments": ["Planned classes", "Clases programadas"],
  "content.library.plannedAssignment": [
    "{date} · Group {group} · {title}",
    "{date} · Grupo {group} · {title}"
  ],
  "content.library.groupReview": ["Group {group} Review", "Repaso del grupo {group}"],
  "content.library.wholeCourseReview": ["Whole course Review", "Repaso de todo el curso"],
  "content.library.scheduledScope": [
    "{scope} · opens {date}",
    "{scope} · se abre el {date}"
  ],
  "content.library.working": ["Working…", "Trabajando…"],
  "content.library.syncFromRepository": ["Sync from repository", "Sincronizar desde el repositorio"],
  "content.library.syncing": ["Syncing…", "Sincronizando…"],

  "content.library.makeAvailableConfirm": [
    "Make {title} available to the whole course now? Students will be able to open it from Review straight away.",
    "¿Poner {title} a disposición de todo el curso ahora? Podrán abrirlo desde Repasar de inmediato."
  ],
  "content.library.assignConfirm": [
    "Assign {lecture} to {title}? This replaces the lecture currently planned for that class.",
    "¿Asignar {lecture} a {title}? Esto reemplaza la clase planeada actualmente para esa sesión."
  ],
  "content.library.removeFromReviewConfirm": [
    "Remove {title} from {scope}? Students in that scope can no longer open it. Nothing they have already done is lost.",
    "¿Quitar {title} de {scope}? Los estudiantes de ese alcance ya no podrán abrirlo. No se pierde nada de lo que ya hayan hecho."
  ],
  "content.library.cancelScheduledConfirm": [
    "Cancel scheduled access to {title} for {scope}? Students will not receive this material at the scheduled time.",
    "¿Cancelar el acceso programado a {title} para {scope}? Los estudiantes no recibirán este material a la hora programada."
  ],
  "content.library.madeAvailable": ["{title} is now available to your students.", "{title} ya está disponible para tus estudiantes."],
  "content.library.syncConfirm": [
    "Pull the latest validated version of {title} from the private content repository? This updates the instructor copy only; student availability does not change.",
    "¿Traer la última versión validada de {title} desde el repositorio privado de contenido? Esto solo actualiza la copia del instructor; la disponibilidad para estudiantes no cambia."
  ],
  "content.library.synced": [
    "{title} was synced from the repository. Student availability did not change.",
    "{title} se sincronizó desde el repositorio. La disponibilidad para estudiantes no cambió."
  ],
  "content.library.syncUnchanged": [
    "{title} is already up to date. Student availability did not change.",
    "{title} ya está actualizado. La disponibilidad para estudiantes no cambió."
  ],
  "content.library.syncFailed": [
    "Could not sync {title} from the repository.",
    "No se pudo sincronizar {title} desde el repositorio."
  ],
  "content.library.assigned": ["{lecture} is assigned to {title}.", "{lecture} se asignó a {title}."],
  "content.library.removedFromReview": [
    "{title} is no longer available in {scope}.",
    "{title} ya no está disponible en {scope}."
  ],
  "content.library.scheduledCancelled": [
    "Scheduled access to {title} for {scope} was cancelled.",
    "Se canceló el acceso programado a {title} para {scope}."
  ],
  "content.library.changeFailed": ["Could not change that.", "No se pudo cambiar eso."],
  "content.library.notReviewable": [
    "Only materials students can open can be made available for review.",
    "Solo los materiales que los estudiantes pueden abrir se pueden poner disponibles para repasar."
  ],
  "content.banks.title": ["Question banks", "Bancos de preguntas"],
  "content.banks.body": [
    "Questions are used only during a live class. Question-bank readiness is professor-only.",
    "Las preguntas se usan solo durante una clase en vivo. La preparación del banco de preguntas es solo para el profesor."
  ],
  "content.banks.loading": ["Loading question banks…", "Cargando bancos de preguntas…"],
  "content.banks.loadFailed": [
    "Could not load the question banks.",
    "No se pudieron cargar los bancos de preguntas."
  ],
  "content.banks.emptyTitle": ["No question banks yet", "Aún no hay bancos de preguntas"],
  "content.banks.emptyBody": [
    "Generate a lecture from a PDF to create its questions automatically.",
    "Genera una clase desde un PDF para crear sus preguntas automáticamente."
  ],
  "content.banks.lede": [
    "Questions stay professor-only and are used only during a live class. Each bank shows whether its questions are balanced and ready at the right teaching checkpoints.",
    "Las preguntas son solo para el profesor y se usan únicamente durante una clase en vivo. Cada banco muestra si están equilibradas y listas en los puntos de control correctos."
  ],
  "content.banks.total": [
    "{count} generated questions",
    "{count} preguntas generadas"
  ],
  "content.banks.ready": ["Ready for class", "Listo para la clase"],
  "content.banks.flexibleReady": [
    "Ready from the approved teaching plan and source-page mappings.",
    "Listo según el plan docente aprobado y las referencias a páginas fuente."
  ],
  "content.banks.flexibleInvalid": [
    "Every active question needs a valid source-page mapping.",
    "Cada pregunta activa necesita una referencia válida a una página fuente."
  ],
  "content.banks.sourcePages": [
    "Source PDF pages: {pages}",
    "Páginas del PDF fuente: {pages}"
  ],
  "content.banks.needsAttention": ["Needs attention", "Necesita atención"],
  "content.banks.uploadPending": ["Upload pending", "Carga pendiente"],
  "content.banks.checkpointCount": [
    "{count} checkpoints",
    "{count} puntos de control"
  ],
  "content.banks.checkpoint": [
    "Checkpoint {number} · after slide {slide}",
    "Punto de control {number} · después de la diapositiva {slide}"
  ],
  "content.banks.candidates": [
    "{count} candidate questions",
    "{count} preguntas candidatas"
  ],
  "content.banks.missingMetadata": [
    "This earlier bank is not mapped to teaching slides yet. Prepare its checkpoints before using it during class.",
    "Este banco anterior aún no está vinculado con las diapositivas de clase. Prepara sus puntos de control antes de usarlo durante la clase."
  ],
  "content.banks.prepare": ["Prepare checkpoints", "Preparar puntos de control"],
  "content.banks.preparing": [
    "Preparing checkpoints…",
    "Preparando puntos de control…"
  ],
  "content.banks.pendingUpload": [
    "The question mapping is saved, but the updated lecture deck still needs to be uploaded. Resume without generating the questions again.",
    "La vinculación de preguntas está guardada, pero aún falta cargar la clase actualizada. Reanuda sin volver a generar las preguntas."
  ],
  "content.banks.resume": ["Resume upload", "Reanudar carga"],
  "content.banks.retry": ["Retry upload", "Reintentar carga"],
  "content.banks.resuming": ["Resuming upload…", "Reanudando la carga…"],
  "content.banks.prepared": [
    "Prepared {checkpointCount} checkpoints and mapped {questionCount} questions.",
    "Se prepararon {checkpointCount} puntos de control y se vincularon {questionCount} preguntas."
  ],
  "content.banks.prepareFailed": [
    "Could not prepare checkpoints for this bank. Its card has not been marked ready.",
    "No se pudieron preparar los puntos de control de este banco. Su tarjeta no se marcó como lista."
  ],
  "content.banks.invalidMetadata": [
    "This bank needs exactly 18 questions, a 6/6/6 difficulty balance, 3–5 checkpoints, and at least 2 candidates at each checkpoint.",
    "Este banco necesita exactamente 18 preguntas, un equilibrio de dificultad 6/6/6, de 3 a 5 puntos de control y al menos 2 candidatas en cada punto."
  ],
  "content.banks.readyBody": [
    "Every question is mapped to a teaching checkpoint.",
    "Cada pregunta está vinculada con un punto de control de la clase."
  ],
  "content.banks.refreshDeck": ["Refresh lecture deck", "Actualizar presentación"],
  "content.banks.refreshing": ["Refreshing lecture deck…", "Actualizando presentación…"],
  "content.banks.reviewQuestions": ["Review questions", "Revisar preguntas"],
  "content.banks.closeReview": ["Close review", "Cerrar revisión"],
  "content.banks.loadingQuestions": ["Loading questions…", "Cargando preguntas…"],
  "content.banks.questionsLoadFailed": [
    "Could not load the questions for this bank.",
    "No se pudieron cargar las preguntas de este banco."
  ],
  "content.banks.duringClass": ["During-class checkpoint", "Punto de control durante la clase"],
  "content.banks.endOfClass": ["End-of-class quiz", "Quiz de fin de clase"],
  "content.banks.afterSlide": ["After slide {slide}", "Después de la diapositiva {slide}"],
  "content.banks.questionNumber": ["Question {number}", "Pregunta {number}"],
  "content.banks.sourceEdited": ["Expert edited", "Editada por el profesor"],
  "content.banks.field.prompt": ["Question", "Pregunta"],
  "content.banks.field.promptEs": ["Question (Spanish)", "Pregunta (español)"],
  "content.banks.field.explanation": ["Explanation", "Explicación"],
  "content.banks.field.explanationEs": ["Explanation (Spanish)", "Explicación (español)"],
  "content.banks.field.difficulty": ["Difficulty", "Dificultad"],
  "content.banks.field.option": ["Option {letter}", "Opción {letter}"],
  "content.banks.field.optionEs": ["Option {letter} (Spanish)", "Opción {letter} (español)"],
  "content.banks.correctOption": ["Correct answer", "Respuesta correcta"],
  "content.banks.saveQuestion": ["Save question", "Guardar pregunta"],
  "content.banks.savingQuestion": ["Saving…", "Guardando…"],
  "content.banks.cancelEdit": ["Cancel", "Cancelar"],
  "content.banks.editQuestion": ["Edit", "Editar"],
  "content.banks.deleteQuestion": ["Delete", "Eliminar"],
  "content.banks.deleteConfirm": [
    "Archive this question? It will no longer be used for live questions or end-of-class quizzes.",
    "¿Archivar esta pregunta? Ya no se usará para preguntas durante la clase ni para el quiz de fin de clase."
  ],
  "content.banks.deleteBank": ["Delete bank", "Eliminar banco"],
  "content.banks.deleteBankConfirm": [
    "Permanently delete \"{title}\" and all {count} of its questions? This cannot be undone.",
    "¿Eliminar permanentemente \"{title}\" y sus {count} preguntas? Esto no se puede deshacer."
  ],
  "content.banks.deleteBankFailed": ["Could not delete this question bank.", "No se pudo eliminar este banco de preguntas."],
  "content.banks.forceDeleteWarning": [
    "This will also permanently delete every recorded student answer for this bank's questions, and every recorded live-question round for any class session that ever used it. There is no undo.",
    "Esto también eliminará permanentemente cada respuesta de estudiante registrada para las preguntas de este banco, y cada ronda de preguntas en vivo registrada de cualquier sesión de clase que lo haya usado. No hay forma de deshacerlo."
  ],
  "content.banks.questionDeleted": ["Question removed from the active bank.", "Pregunta retirada del banco activo."],
  "content.banks.questionSaved": ["Question saved.", "Pregunta guardada."],
  "content.banks.questionSaveFailed": ["Could not save this question.", "No se pudo guardar esta pregunta."],
  "content.banks.questionDeleteFailed": ["Could not remove this question.", "No se pudo retirar esta pregunta."],

  "content.uploadTitle": ["New lecture from a PDF", "Nueva clase desde un PDF"],
  "content.uploadBody": [
    "Export your slides to PDF first. Generation takes a few minutes; you can leave this page and come back.",
    "Exporta tus diapositivas a PDF primero. La generación toma unos minutos; puedes salir de esta página y volver."
  ],
  "content.lectureTitle": ["Lecture title", "Título de la clase"],
  "content.lectureTitlePlaceholder": ["Week 4 Lecture 1: Access Control", "Semana 4 Clase 1: Control de Acceso"],
  "content.pdf": ["Slides (PDF)", "Diapositivas (PDF)"],
  "content.willBeSlug": ["Web address: /{slug}", "Dirección web: /{slug}"],
  "content.generate": ["Upload and generate", "Subir y generar"],
  "content.uploading": ["Uploading…", "Subiendo…"],
  "content.uploadFailed": ["Could not upload that PDF.", "No se pudo subir ese PDF."],
  "content.sourceTruth": [
    "The uploaded PDF is the source of truth. The title and notes guide presentation only; they do not add curriculum.",
    "El PDF cargado es la fuente de verdad. El título y las notas solo guían la presentación; no agregan contenido curricular."
  ],
  "content.titleLabelOnly": [
    "This is a display label, not a curriculum instruction.",
    "Esta es una etiqueta de visualización, no una instrucción curricular."
  ],
  "content.brief.title": ["Teaching brief", "Indicación docente"],
  "content.brief.body": [
    "Choose what to generate and add teaching preferences before the PDF is analyzed.",
    "Elige qué generar y agrega preferencias docentes antes de analizar el PDF."
  ],
  "content.brief.instructions": ["Teaching instructions", "Instrucciones docentes"],
  "content.brief.preferences": ["Checkpoint preferences", "Preferencias de puntos de control"],
  "content.brief.liveGoal": ["Live checkpoints", "Puntos de control en clase"],
  "content.brief.candidatesGoal": ["Candidates per checkpoint", "Candidatas por punto de control"],
  "content.brief.endQuizGoal": ["End-of-class questions", "Preguntas al final de la clase"],
  "content.aiDecides": ["Leave blank: AI decides", "Déjalo vacío: la IA decide"],
  "content.mode.label": ["Generation mode", "Modo de generación"],
  "content.mode.deckAndBank": ["Presentation deck and question bank", "Presentación y banco de preguntas"],
  "content.mode.bankOnly": ["Question bank only", "Solo banco de preguntas"],
  "content.status.ready_for_plan_review": ["Plan ready for your review", "Plan listo para tu revisión"],
  "content.plan.review": ["Review teaching plan", "Revisar plan docente"],
  "content.plan.title": ["Review the teaching plan", "Revisa el plan docente"],
  "content.plan.body": [
    "Check the PDF-page outline and adjust question placement before generation continues.",
    "Revisa el esquema por páginas del PDF y ajusta la colocación de preguntas antes de continuar la generación."
  ],
  "content.plan.loading": ["Loading teaching plan…", "Cargando plan docente…"],
  "content.plan.sourcePages": ["PDF source pages", "Páginas fuente del PDF"],
  "content.plan.sourcePage": ["PDF page {page}", "Página {page} del PDF"],
  "content.plan.checkpoints": ["Suggested checkpoints", "Puntos de control sugeridos"],
  "content.plan.checkpoint": ["Checkpoint {number}", "Punto de control {number}"],
  "content.plan.topic": ["Topic", "Tema"],
  "content.plan.sourceMapping": ["Source PDF pages", "Páginas fuente del PDF"],
  "content.plan.afterPage": ["Suggest after PDF page", "Sugerir después de la página del PDF"],
  "content.plan.candidateGoal": ["Candidate questions", "Preguntas candidatas"],
  "content.plan.endQuizGoal": ["End-of-class questions", "Preguntas al final de la clase"],
  "content.plan.approve": ["Approve plan and generate", "Aprobar plan y generar"],
  "content.plan.approving": ["Approving plan…", "Aprobando plan…"],
  "content.plan.loadFailed": ["Could not load the teaching plan.", "No se pudo cargar el plan docente."],
  "content.plan.approveFailed": ["Could not approve this teaching plan.", "No se pudo aprobar este plan docente."],
  "content.jobsTitle": ["Lectures being built", "Clases en construcción"],
  "content.loadingJobs": ["Loading…", "Cargando…"],
  "content.noJobsTitle": ["Nothing generated yet", "Aún no hay nada generado"],
  "content.noJobsBody": [
    "Drop your first lecture PDF above to see how it works.",
    "Sube tu primer PDF de clase arriba para ver cómo funciona."
  ],
  "content.status.queued": ["Queued", "En cola"],
  "content.status.extracting": ["Reading the PDF", "Leyendo el PDF"],
  "content.status.outlining": ["Planning the lecture", "Planeando la clase"],
  "content.status.generating_deck": ["Writing slides", "Escribiendo diapositivas"],
  "content.status.generating_questions": ["Writing questions", "Escribiendo preguntas"],
  "content.status.grounding": ["Checking against the PDF", "Verificando con el PDF"],
  "content.status.assembling": ["Assembling", "Ensamblando"],
  "content.status.ready_for_review": ["Ready for your review", "Lista para tu revisión"],
  "content.status.approved": ["Approved", "Aprobada"],
  "content.status.failed": ["Failed", "Falló"],
  "content.stepOf": ["Step {step} of {total}", "Paso {step} de {total}"],
  "content.review": ["Review it", "Revisarla"],
  "cleanup.title": [
    "Some lectures link out to the public site",
    "Algunas clases enlazan al sitio público"
  ],
  "cleanup.body": [
    "These files were moved into private storage with their original links intact, so a student reading them can click through to the public copy. Cleaning removes only those navigation links — your slides are untouched, and a copy of each file is kept so it can be restored.",
    "Estos archivos se movieron al almacenamiento privado con sus enlaces originales intactos, así que un estudiante que los lea puede pasar a la copia pública. La limpieza elimina solo esos enlaces de navegación — tus diapositivas no se tocan y se guarda una copia de cada archivo para poder restaurarlo."
  ],
  "cleanup.found": [
    "{items} item(s) still link out, {links} link(s) in total.",
    "{items} material(es) todavía enlazan hacia afuera, {links} enlace(s) en total."
  ],
  "cleanup.allClean": [
    "No material links out to the public site.",
    "Ningún material enlaza al sitio público."
  ],
  "cleanup.action": ["Clean these links", "Limpiar estos enlaces"],
  "cleanup.confirm": [
    "Confirm: clean the links",
    "Confirmar: limpiar los enlaces"
  ],
  "cleanup.working": ["Cleaning {title}…", "Limpiando {title}…"],
  "cleanup.done": [
    "Cleaned {count} item(s).",
    "Se limpiaron {count} material(es)."
  ],
  "cleanup.failed": [
    "Could not clean {title}. Nothing was changed for it.",
    "No se pudo limpiar {title}. No se cambió nada en ese material."
  ],
  "content.library.sharedBadge": ["Shared with you", "Compartido contigo"],
  "content.library.sharedHint": [
    "Another instructor owns this. Take a copy to teach and edit your own version — theirs is not changed.",
    "Otro profesor es el dueño. Toma una copia para impartir y editar tu propia versión — la de esa persona no cambia."
  ],
  "content.library.copy": ["Take a copy", "Tomar una copia"],
  "content.library.copying": ["Copying…", "Copiando…"],
  "content.library.copied": [
    "Copied {title}. It is yours now, with its questions.",
    "Se copió {title}. Ahora es tuya, con sus preguntas."
  ],
  "content.library.copyFailed": ["Could not copy that item.", "No se pudo copiar ese material."],
  "content.library.share": ["Share", "Compartir"],
  "content.library.shareTo": ["Share with a group", "Compartir con un grupo"],
  "content.library.sharePlaceholder": ["Choose a group", "Elige un grupo"],
  "content.library.shareSubmit": ["Share", "Compartir"],
  "content.library.sharing": ["Sharing…", "Compartiendo…"],
  "content.library.shared": [
    "Shared {title} with {group}. They can open it and take their own copy — your version is unchanged.",
    "Se compartió {title} con {group}. Podrán abrirla y tomar su propia copia — tu versión no cambia."
  ],
  "content.library.shareFailed": ["Could not share that item.", "No se pudo compartir ese material."],
  "content.library.currentShares": ["Currently shared with", "Actualmente compartido con"],
  "content.library.revoke": ["Revoke", "Revocar"],
  "content.library.revoking": ["Revoking…", "Revocando…"],
  "content.library.revoked": [
    "{group} can no longer see {title}. A copy they already took is theirs to keep.",
    "{group} ya no puede ver {title}. Una copia que ya hayan tomado sigue siendo suya."
  ],
  "content.library.revokeFailed": ["Could not revoke that share.", "No se pudo revocar ese acceso."],
  "content.library.delete": ["Delete", "Eliminar"],
  "content.library.deleteConfirm": [
    "Permanently delete \"{title}\"? It has been made available to students {releases} time(s) before. This cannot be undone.",
    "¿Eliminar permanentemente \"{title}\"? Se ha puesto a disposición de los estudiantes {releases} veces antes. Esto no se puede deshacer."
  ],
  "content.library.deleted": ["\"{title}\" was deleted.", "\"{title}\" fue eliminado."],
  "content.library.deleteFailed": ["Could not delete this material.", "No se pudo eliminar este material."],
  "content.library.content_item_not_found": [
    "This item could not be found.",
    "No se encontró este material."
  ],
  "content.library.content_item_not_owned": [
    "You don't have permission to delete this item.",
    "No tienes permiso para eliminar este material."
  ],
  "content.library.content_item_has_active_release": [
    "This item is currently available to students and can't be deleted. Remove it from Review first.",
    "Este material está disponible actualmente para los estudiantes y no se puede eliminar. Quítalo de Revisión primero."
  ],
  "content.library.content_item_has_active_bank": [
    "This item still has an active question bank. Delete the bank first, then this item.",
    "Este material todavía tiene un banco de preguntas activo. Elimina el banco primero y luego este material."
  ],
  "content.library.content_item_has_activity_history": [
    "An end-of-class quiz has already been run for this item, so it can't be deleted.",
    "Ya se ejecutó un cuestionario de fin de clase para este material, así que no se puede eliminar."
  ],
  "content.library.forceDeleteWarning": [
    "This will also permanently delete every recorded end-of-class quiz attempt and answer for this item. There is no undo.",
    "Esto también eliminará permanentemente cada intento y respuesta del cuestionario de fin de clase registrado para este material. No hay forma de deshacerlo."
  ],
  "content.cancel": ["Cancel", "Cancelar"],
  "forceDelete.trigger": ["Delete anyway", "Eliminar de todos modos"],
  "forceDelete.placeholder": ["Type DELETE to confirm", "Escribe DELETE para confirmar"],
  "forceDelete.confirm": ["Permanently delete", "Eliminar permanentemente"],
  "forceDelete.cancel": ["Cancel", "Cancelar"],
  "content.approvedNote": [
    "Approved — it now appears in your content library as a draft, ready to release for a class.",
    "Aprobada — ya aparece en tu biblioteca de contenido como borrador, lista para publicarse en una clase."
  ],
  "content.reviewTitle": ["Review before students see it", "Revisa antes de que la vean los estudiantes"],
  "content.reviewBody": [
    "Check the slides and the questions. Approving makes this a draft in your library — students still see nothing until you release it for a class.",
    "Revisa las diapositivas y las preguntas. Aprobar la deja como borrador en tu biblioteca — los estudiantes no ven nada hasta que la publiques para una clase."
  ],
  "content.reviewBankOnlyTitle": ["Review question bank", "Revisa el banco de preguntas"],
  "content.reviewBankOnlyBody": [
    "This job creates only a question bank. It does not create a presentation deck or content release; approve it to activate the questions for class planning.",
    "Este trabajo crea solo un banco de preguntas. No crea una presentación ni una publicación de contenido; apruébalo para activar las preguntas para la planificación de clase."
  ],
  "content.close": ["Close", "Cerrar"],
  "content.deckPreview": ["Deck preview", "Vista previa de la presentación"],
  "content.loadingQuestions": ["Loading questions…", "Cargando preguntas…"],
  "content.questionCounts": [
    "{easy} easy · {medium} medium · {hard} hard",
    "{easy} fáciles · {medium} medias · {hard} difíciles"
  ],
  "content.questionCheckpoint": [
    "Source slides {start}–{end} · available after slide {checkpoint}",
    "Diapositivas fuente {start}–{end} · disponible después de la diapositiva {checkpoint}"
  ],
  "content.questionCheckpointMissing": [
    "This question is not mapped to a teaching checkpoint yet.",
    "Esta pregunta aún no está vinculada con un punto de control de la clase."
  ],
  "content.approve": ["Approve this lecture", "Aprobar esta clase"],
  "content.approveBankOnly": ["Approve question bank", "Aprobar banco de preguntas"],
  "content.approving": ["Approving…", "Aprobando…"],
  "content.approveFailed": ["Could not approve it.", "No se pudo aprobar."],

  "quiz.difficulty.easy": ["Easy", "Fácil"],
  "quiz.difficulty.medium": ["Medium", "Media"],
  "quiz.difficulty.hard": ["Hard", "Difícil"],
  "quiz.oneAtATime": [
    "One question at a time — it moves on automatically when time runs out.",
    "Una pregunta a la vez — avanza automáticamente cuando se acaba el tiempo."
  ],
  "quiz.timeUpAdvancing": ["Time's up — moving on…", "Se acabó el tiempo — avanzando…"],

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

  // ---------------------------------------------------------------- deck bridge
  "deck.bridgeInvalid": [
    "The lecture deck sent an invalid control message.",
    "La presentación envió un mensaje de control no válido."
  ],
  "deck.bridgeUnavailable": [
    "The lecture deck controls are not ready yet.",
    "Los controles de la presentación todavía no están listos."
  ],

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
  "state.late": ["Submitted late", "Entregado tarde"],
  "state.started": ["In progress", "En proceso"],
  "state.active": ["Active", "Activo"],
  "state.inactive": ["Inactive", "Inactivo"],
  "state.invited": ["Invited", "Invitado"],
  "state.revoked": ["Revoked", "Revocado"],
  "state.completed": ["Completed", "Concluido"],
  "state.merged": ["Merged account", "Cuenta fusionada"],
  "state.dropped": ["Dropped", "Dado de baja"],

  // --------------------------------------------------------------- import
  "import.title": ["Import a lecture", "Importar una clase"],
  "import.chooseFile": ["Choose a file", "Elegir un archivo"],
  "import.paste": ["Or paste the file contents", "O pega el contenido del archivo"],
  "import.loadedSummary": ["Loaded: {count} questions", "Cargadas: {count} preguntas"],
  "import.loadDifferentFile": ["Load a different file", "Cargar otro archivo"],
  "import.group.upToSlide": ["Covers up to slide {slide}", "Cubre hasta la diapositiva {slide}"],
  "import.group.noSlide": ["No slide given", "Sin diapositiva indicada"],
  "import.difficultyDefaulted": ["Difficulty not given — set to medium", "Sin dificultad — se asignó media"],
  "import.commit": ["Save to the course", "Guardar en el curso"],
  "import.fixFirst": ["Fix the flagged questions first", "Corrige primero las preguntas marcadas"],
  "import.needsFix": ["Needs a fix", "Requiere corrección"],
  "import.addOption": ["Add an option", "Agregar una opción"],
  "import.removeOption": ["Remove this option", "Quitar esta opción"],
  "import.noAutoCue": [
    "An imported deck does not stop at questions on its own. You choose each question from Run Class.",
    "Una presentación importada no se detiene sola en las preguntas. Tú eliges cada pregunta desde Dar clase."
  ],
  "import.problem.notJson": ["This file is not valid JSON: {detail}", "Este archivo no es JSON válido: {detail}"],
  "import.problem.noQuestions": ["This file has no questions array.", "Este archivo no tiene un arreglo de preguntas."],
  "import.problem.promptEmpty": ["This question has no text", "Esta pregunta no tiene texto"],
  "import.problem.promptTooLong": ["Question is too long ({detail} characters)", "La pregunta es demasiado larga ({detail} caracteres)"],
  "import.problem.optionEmpty": ["This option is empty", "Esta opción está vacía"],
  "import.problem.optionTooLong": ["Option is too long ({detail} characters)", "La opción es demasiado larga ({detail} caracteres)"],
  "import.problem.optionCount": ["Needs exactly four options — found {detail}", "Se requieren exactamente cuatro opciones — hay {detail}"],
  "import.problem.correctCount": ["Needs exactly one correct answer — found {detail}", "Se requiere exactamente una respuesta correcta — hay {detail}"],
  "import.problem.missingSpanish": ["Spanish text is missing", "Falta el texto en español"],
  "import.deck.relative": ["The deck refers to a file that will not exist once uploaded: {detail}", "La presentación usa un archivo que no existirá al subirla: {detail}"],
  "import.deck.forbiddenHost": ["The deck links to the public site: {detail}", "La presentación enlaza al sitio público: {detail}"],
  "import.deck.undeclaredHost": ["The deck links to an unexpected site: {detail}", "La presentación enlaza a un sitio inesperado: {detail}"],
  "import.deck.noTitle": ["The deck has no title", "La presentación no tiene título"],

  // -------------------------------------------------- import · orchestration
  "import.draftRestored": [
    "A draft you were working on was restored.",
    "Se restauró un borrador en el que estabas trabajando."
  ],
  "import.slug": ["Lecture slug", "Identificador de la clase"],
  "import.slugHint": [
    "Links the question bank and the deck to the same lecture. Lowercase letters, numbers and dashes.",
    "Vincula el banco de preguntas y la presentación a la misma clase. Minúsculas, números y guiones."
  ],
  "import.slugRequired": [
    "Enter a lecture slug before saving.",
    "Escribe un identificador de clase antes de guardar."
  ],
  "import.saving": ["Saving…", "Guardando…"],
  "import.commitFailed": ["Could not save this import.", "No se pudo guardar esta importación."],
  "import.bank.success": ["Question bank imported.", "Banco de preguntas importado."],
  "import.bank.failed": ["The question bank could not be imported.", "No se pudo importar el banco de preguntas."],
  "import.deck.sectionTitle": ["Lecture deck (optional)", "Presentación de la clase (opcional)"],
  "import.deck.chooseFile": ["Choose the deck HTML file", "Elegir el archivo HTML de la presentación"],
  "import.deck.externalLinks": [
    "Sites this deck legitimately links to",
    "Sitios a los que esta presentación enlaza legítimamente"
  ],
  "import.deck.externalLinksHint": [
    "Separate multiple hostnames with a comma or a new line — e.g. example.com",
    "Separa varios nombres de dominio con una coma o un salto de línea — por ejemplo example.com"
  ],
  "import.deck.success": ["Lecture deck imported.", "Presentación importada."],
  "import.deck.failed": ["The lecture deck could not be imported.", "No se pudo importar la presentación."],

  // ------------------------------------------------- import · authoring prompt
  // Chrome only. The prompt body itself stays in English — it is instructions
  // to a model, not text a person reads.
  "import.prompt.title": ["The authoring prompt", "El prompt de autoría"],
  "import.prompt.lede": [
    "Paste this into ChatGPT, Claude or Gemini — whichever you already pay for. It answers with the question file you upload below.",
    "Pega esto en ChatGPT, Claude o Gemini — el que ya pagues. Responderá con el archivo de preguntas que subes abajo."
  ],
  "import.prompt.validationCaveat": [
    "Written and tested by Prof. Zareei. As with any AI-generated content, check the result in the preview before relying on it in front of a class.",
    "Escrito y probado por el Prof. Zareei. Como con cualquier contenido generado por IA, revisa el resultado en la vista previa antes de confiar en él frente a un grupo."
  ],
  "import.prompt.attach": [
    "Attach the lecture itself — the PDF or slide export — in the same message, and say how many slides it has so the questions land on the right ones.",
    "Adjunta la clase misma — el PDF o la exportación de diapositivas — en el mismo mensaje, e indica cuántas diapositivas tiene para que las preguntas apunten a las correctas."
  ],
  "import.prompt.copy": ["Copy the prompt", "Copiar el prompt"],
  "import.prompt.copied": ["Copied!", "¡Copiado!"],
  "import.prompt.copyFailed": [
    "This browser would not let the page copy for you. Select the text below and copy it yourself.",
    "Este navegador no permitió que la página copiara por ti. Selecciona el texto de abajo y cópialo tú."
  ],

  // ------------------------------------------------------------ class record
  "live.scanToJoin": ["Scan the QR code to join", "Escanea el código QR para entrar"],
  "live.scanToJoinBody": [
    "You have not joined this class yet. Scan the QR code on the screen at the front with your phone camera.",
    "Todavía no has entrado a esta clase. Escanea el código QR de la pantalla del frente con la cámara de tu teléfono."
  ],
  "gradebook.perClass.openRecord": ["Open the class record", "Abrir el registro de la clase"],

  "classRecord.eyebrow": ["Class record", "Registro de la clase"],
  "classRecord.heading": ["Class {number} · {title}", "Clase {number} · {title}"],
  "classRecord.loading": ["Loading the class record…", "Cargando el registro de la clase…"],
  "classRecord.loadFailed": [
    "The class record could not be loaded.",
    "No se pudo cargar el registro de la clase."
  ],
  "classRecord.noSession": ["Pick a class first", "Primero elige una clase"],
  "classRecord.backToGrades": ["Back to grades", "Volver a calificaciones"],
  "classRecord.postToGradebook": ["Post to the gradebook", "Publicar en el libro de calificaciones"],
  "classRecord.posting": ["Posting…", "Publicando…"],
  "classRecord.postFailed": [
    "The grades could not be posted.",
    "No se pudieron publicar las calificaciones."
  ],
  "classRecord.postedResult": [
    "Posted {posted} grades. {skipped} students have nothing to grade yet.",
    "Se publicaron {posted} calificaciones. {skipped} estudiantes aún no tienen nada que calificar."
  ],
  "classRecord.sortBy": ["Sort by {column}", "Ordenar por {column}"],
  "classRecord.save": ["Save", "Guardar"],
  "classRecord.saving": ["Saving…", "Guardando…"],
  "classRecord.cancel": ["Cancel", "Cancelar"],
  "classRecord.showDetail": ["How was this calculated?", "¿Cómo se calculó?"],
  "classRecord.hideDetail": ["Hide the calculation", "Ocultar el cálculo"],

  "classRecord.attendance.title": ["Attendance and engagement", "Asistencia y participación"],
  "classRecord.attendance.summary": [
    "{present} present · {late} late · {leftEarly} left early · {absent} absent",
    "{present} presentes · {late} con retardo · {leftEarly} se retiraron antes · {absent} ausentes"
  ],
  "classRecord.attendance.startedAt": [
    "Class started at {time}. Arriving more than {minutes} minutes later counts as late.",
    "La clase inició a las {time}. Llegar más de {minutes} minutos después cuenta como retardo."
  ],
  "classRecord.attendance.neverStarted": [
    "This class was never started, so nobody could scan in.",
    "Esta clase nunca se inició, así que nadie pudo registrarse."
  ],
  "classRecord.attendance.footnote": [
    "{pushed} questions were pushed to the room on {date}. Engagement is the share of them a student answered, right or wrong.",
    "Se enviaron {pushed} preguntas al grupo el {date}. La participación es la proporción de ellas que el estudiante respondió, con acierto o sin él."
  ],
  "classRecord.status.present": ["Present", "Presente"],
  "classRecord.status.late": ["Late", "Retardo"],
  "classRecord.status.left_early": ["Left early", "Se retiró antes"],
  "classRecord.status.absent": ["Absent", "Ausente"],
  "classRecord.markPresent": ["Mark present", "Marcar presente"],
  "classRecord.markPresentNote": [
    "Why? e.g. phone battery died",
    "¿Por qué? p. ej. se le acabó la batería"
  ],
  "classRecord.markPresentFailed": [
    "That student could not be marked present.",
    "No se pudo marcar presente a ese estudiante."
  ],
  "classRecord.markedByHand": ["marked by hand", "marcado a mano"],
  "classRecord.attendedDays": ["Days attended: {days}", "Días asistidos: {days}"],

  "classRecord.column.student": ["Student", "Estudiante"],
  "classRecord.column.studentId": ["Student ID", "Matrícula"],
  "classRecord.column.checkIn": ["QR check-in", "Registro QR"],
  "classRecord.column.status": ["Attendance", "Asistencia"],
  "classRecord.column.pulseResponses": ["Responses", "Respuestas"],
  "classRecord.column.engagement": ["Engagement", "Participación"],
  "classRecord.column.lastActivity": ["Last activity", "Última actividad"],
  "classRecord.column.pulseCorrect": ["Class questions right", "Preguntas de clase correctas"],
  "classRecord.column.pulseTotal": ["Class questions asked", "Preguntas de clase totales"],
  "classRecord.column.quizCorrect": ["Quiz questions right", "Preguntas del quiz correctas"],
  "classRecord.column.quizTotal": ["Quiz questions asked", "Preguntas del quiz totales"],
  "classRecord.column.submission": ["Final submission", "Entrega final"],
  "classRecord.column.finalGrade": ["Class grade", "Calificación de la clase"],

  "classRecord.grading.title": ["Class grading", "Calificación de la clase"],
  "classRecord.grading.formula": [
    "{pulseWeight}% class questions and {quizWeight}% final quiz. Getting {threshold}% right earns 100; below that the grade scales down proportionally. A missing final submission costs {penalty}%.",
    "{pulseWeight}% preguntas de clase y {quizWeight}% quiz final. Acertar {threshold}% otorga 100; por debajo de eso la calificación baja de forma proporcional. Una entrega final faltante cuesta {penalty}%."
  ],
  "classRecord.grading.totals": [
    "{pulses} graded class questions of {pushed} pushed · {quiz} quiz questions.",
    "{pulses} preguntas de clase calificadas de {pushed} enviadas · {quiz} preguntas del quiz."
  ],
  "classRecord.submission.submitted": ["Submitted", "Entregada"],
  "classRecord.submission.missing": ["Missing", "Faltante"],

  "classRecord.override": ["Override this grade", "Ajustar esta calificación"],
  "classRecord.changeOverride": ["Change the override", "Cambiar el ajuste"],
  "classRecord.saveOverride": ["Save the override", "Guardar el ajuste"],
  "classRecord.clearOverride": ["Remove the override", "Quitar el ajuste"],
  "classRecord.overrideGrade": ["Grade out of 100", "Calificación sobre 100"],
  "classRecord.overrideReason": ["Reason (recorded permanently)", "Motivo (queda registrado de forma permanente)"],
  "classRecord.overrideReasonPlaceholder": [
    "Why is this grade being changed?",
    "¿Por qué se modifica esta calificación?"
  ],
  "classRecord.overrideFailed": [
    "That grade could not be overridden.",
    "No se pudo ajustar esa calificación."
  ],
  "classRecord.reasonRequired": [
    "A written reason is required before an override can be saved.",
    "Se requiere un motivo por escrito antes de guardar un ajuste."
  ],

  "classRecord.breakdown.pulse": [
    "Class questions: {correct} of {total} right = {accuracy}, weighted {weight}%.",
    "Preguntas de clase: {correct} de {total} correctas = {accuracy}, con peso de {weight}%."
  ],
  "classRecord.breakdown.quiz": [
    "Final quiz: {correct} of {total} right = {accuracy}, weighted {weight}%.",
    "Quiz final: {correct} de {total} correctas = {accuracy}, con peso de {weight}%."
  ],
  "classRecord.breakdown.raw": [
    "Combined raw accuracy: {raw}.",
    "Precisión combinada sin escalar: {raw}."
  ],
  "classRecord.breakdown.scaled": [
    "Scaled: {raw} ÷ {threshold}% × 100 = {scaled}.",
    "Escalada: {raw} ÷ {threshold}% × 100 = {scaled}."
  ],
  "classRecord.breakdown.capped": ["capped at 100", "limitada a 100"],
  "classRecord.breakdown.penaltyApplied": [
    "Final submission missing: {penalty}% deducted.",
    "Entrega final faltante: se descuenta {penalty}%."
  ],
  "classRecord.breakdown.penaltyNone": [
    "Final submission received, so no deduction.",
    "Entrega final recibida, sin descuento."
  ],
  "classRecord.breakdown.calculated": [
    "Calculated class grade: {grade}.",
    "Calificación calculada de la clase: {grade}."
  ],
  "classRecord.breakdown.overrideHistory": ["Override history", "Historial de ajustes"],
  "classRecord.breakdown.historySet": [
    "Set to {grade} (calculated {calculated}) by {actor} on {when}",
    "Ajustada a {grade} (calculada {calculated}) por {actor} el {when}"
  ],
  "classRecord.breakdown.historyCleared": [
    "Override removed by {actor} on {when}",
    "Ajuste eliminado por {actor} el {when}"
  ],

  // ------------------------------------------------------------ course reset
  "reset.title": ["Reset the course", "Reiniciar el curso"],
  "reset.body": [
    "Clears everything students did — check-ins, answers, quizzes, reflections, grades — and rewinds every class to not-yet-held. Your lectures, question banks, schedule and groups stay exactly as they are.",
    "Borra todo lo que hicieron los estudiantes — registros, respuestas, quizzes, reflexiones, calificaciones — y regresa cada clase a no impartida. Tus lecciones, bancos de preguntas, calendario y grupos quedan intactos."
  ],
  "reset.check": ["See what would be cleared", "Ver qué se borraría"],
  "reset.checking": ["Counting…", "Contando…"],
  "reset.previewFailed": [
    "The count could not be loaded.",
    "No se pudo cargar el conteo."
  ],
  "reset.summary": [
    "{activity} rows of student activity and {legacy} rows from the old pilot apps. {sessions} classes would be rewound; all {kept} stay in the schedule.",
    "{activity} registros de actividad de estudiantes y {legacy} registros de las apps piloto anteriores. {sessions} clases se regresarían a no impartidas; las {kept} permanecen en el calendario."
  ],
  "reset.col.what": ["What", "Qué"],
  "reset.col.rows": ["Rows", "Registros"],
  "reset.col.remove": ["Remove", "Quitar"],
  "reset.col.checkIns": ["Check-ins", "Registros"],
  "reset.col.answers": ["Answers", "Respuestas"],
  "reset.col.quizzes": ["Quiz attempts", "Intentos"],
  "reset.col.reflections": ["Reflections", "Reflexiones"],
  "reset.row.checkIns": ["QR check-ins", "Registros por QR"],
  "reset.row.pulseRounds": ["Questions pushed in class", "Preguntas enviadas en clase"],
  "reset.row.pulseAnswers": ["Answers to those questions", "Respuestas a esas preguntas"],
  "reset.row.quizAttempts": ["Quiz attempts", "Intentos de quiz"],
  "reset.row.quizAnswers": ["Quiz answers", "Respuestas de quiz"],
  "reset.row.reflections": ["Written reflections", "Reflexiones escritas"],
  "reset.row.postedGrades": ["Posted grades", "Calificaciones publicadas"],
  "reset.row.overrides": ["Grade overrides", "Ajustes de calificación"],
  "reset.row.participation": ["Participation points", "Puntos de participación"],
  "reset.row.notes": ["Notes about students", "Notas sobre estudiantes"],
  "reset.row.legacy": ["Old pilot-app records", "Registros de apps piloto anteriores"],
  "reset.row.rewound": ["Classes rewound to not-yet-held", "Clases regresadas a no impartidas"],
  "reset.keptNote": [
    "Kept: lectures, question banks, the schedule, groups, the roster, gradebook categories, and the record that this reset happened.",
    "Se conservan: lecciones, bancos de preguntas, calendario, grupos, lista de estudiantes, categorías del libro de calificaciones y el registro de que este reinicio ocurrió."
  ],
  "reset.students": ["Students in the roster", "Estudiantes en la lista"],
  "reset.studentsBody": [
    "Tick anyone invented for a rehearsal to remove their account entirely. Leave real students unticked — their activity is cleared either way.",
    "Marca a quien hayas inventado para un ensayo para eliminar su cuenta por completo. Deja sin marcar a los estudiantes reales — su actividad se borra de todos modos."
  ],
  "reset.noStudents": ["Nobody is enrolled yet.", "Todavía no hay nadie inscrito."],
  "reset.removeAria": ["Remove {name} from the course", "Quitar a {name} del curso"],
  "reset.warning": [
    "This deletes {rows} rows and {students} student accounts, and cannot be undone.",
    "Esto elimina {rows} registros y {students} cuentas de estudiante, y no se puede deshacer."
  ],
  "reset.placeholder": ["Type RESET to confirm", "Escribe RESET para confirmar"],
  "reset.confirm": ["Reset the course now", "Reiniciar el curso ahora"],
  "reset.running": ["Resetting…", "Reiniciando…"],
  "reset.cancel": ["Cancel", "Cancelar"],
  "reset.failed": ["The reset did not complete.", "El reinicio no se completó."],
  "reset.done": [
    "Cleared {rows} rows and removed {removed} accounts.",
    "Se borraron {rows} registros y se eliminaron {removed} cuentas."
  ],
  "reset.refusedTitle": [
    "Some accounts could not be removed:",
    "Algunas cuentas no se pudieron eliminar:"
  ]
} as const;

export type StringKey = keyof typeof strings;
