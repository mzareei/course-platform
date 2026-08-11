// Column sorting for the class record tables.
//
// Imports nothing, so it stays trivially testable and cheap to reason about.

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

/**
 * Clicking the sorted column flips it; clicking a new one starts at that
 * column's natural direction — names read best A→Z, scores best worst-first,
 * because the reason to sort by score is to find who is struggling.
 */
export function nextSort<K extends string>(
  current: SortState<K>,
  key: K,
  naturalDirection: SortDirection
): SortState<K> {
  if (current.key !== key) return { key, direction: naturalDirection };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

export type SortValue = string | number | null | undefined;

/**
 * Sorts a copy. Empty values always sink to the bottom whichever way the column
 * is pointing: a student with no grade yet is not the best or the worst in the
 * class, and burying them under the sorted data is the honest position.
 */
export function sortRows<T>(
  rows: T[],
  value: (row: T) => SortValue,
  direction: SortDirection
): T[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const leftEmpty = left === null || left === undefined || left === "";
    const rightEmpty = right === null || right === undefined || right === "";
    if (leftEmpty && rightEmpty) return 0;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;
    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * factor;
    }
    return String(left).localeCompare(String(right)) * factor;
  });
}
