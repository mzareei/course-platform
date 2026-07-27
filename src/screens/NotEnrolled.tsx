export function NotEnrolled({ status, email }: { status: string; email: string }) {
  return (
    <div class="card">
      <p class="eyebrow">Signed in as {email}</p>
      <h2>You're signed in, but not on the course roster yet</h2>
      {status === "missing_profile" ? (
        <p class="hint">
          Your email isn't on the roster for this course. If you just enrolled, ask your
          professor to add you — they need this exact address: <strong>{email}</strong>.
        </p>
      ) : (
        <p class="hint">
          Your profile exists but you're not enrolled in an active section. Ask your professor
          to check your enrollment.
        </p>
      )}
      <p class="hint">Nothing is wrong with your sign-in — access opens the moment you're added.</p>
    </div>
  );
}
