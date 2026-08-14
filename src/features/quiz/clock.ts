// `M:SS`, for the phone's total clock and the professor's countdown alike.
// Its own module rather than an export from Player.tsx: the End of Class box
// is an instructor screen, and it should not have to import from the student's
// quiz player to format a number.
export function clockText(remainingMs: number) {
  const total = Math.max(0, Math.round(remainingMs / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
