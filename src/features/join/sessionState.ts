export function canJoinClassSession(state: string): boolean {
  return !["cancelled", "closed"].includes(state);
}
