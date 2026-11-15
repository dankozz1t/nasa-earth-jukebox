// The roving focus of a radio group: arrows in either axis wrap round, Home and End jump to the ends.
// Null for any other key.
export function rovingIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
