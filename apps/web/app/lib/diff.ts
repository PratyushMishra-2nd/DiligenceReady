/**
 * Character-level comparison of two short strings.
 *
 * The product's typographic argument is that a CA reads GSTINs and rupee
 * figures one character at a time, looking for the transposition. Printing the
 * two values one above the other and leaving that search to the reader is the
 * work the interface is supposed to be doing: 1,42,500 against 1,24,500 is two
 * characters out of nine, and they are adjacent.
 *
 * A longest-common-subsequence walk rather than a positional compare, because
 * the two strings are not always the same length — a missing digit shifts
 * every character after it, and a positional compare would mark the whole tail
 * as different when one insertion explains it.
 *
 * This compares presentation strings and returns presentation runs. It never
 * parses a figure into a number, and it is not used to decide anything: the
 * engine already decided, and this is how the decision is read.
 */

export type Run = { text: string; changed: boolean };

/** The two strings, each split into runs marked same or changed. */
export function diffChars(left: string, right: string): { left: Run[]; right: Run[] } {
  const a = [...left];
  const b = [...right];

  // table[i][j] = length of the longest common subsequence of a[i:] and b[j:]
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const leftRuns: Run[] = [];
  const rightRuns: Run[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(leftRuns, a[i], false);
      push(rightRuns, b[j], false);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push(leftRuns, a[i], true);
      i += 1;
    } else {
      push(rightRuns, b[j], true);
      j += 1;
    }
  }
  while (i < a.length) {
    push(leftRuns, a[i], true);
    i += 1;
  }
  while (j < b.length) {
    push(rightRuns, b[j], true);
    j += 1;
  }

  return { left: leftRuns, right: rightRuns };
}

function push(runs: Run[], character: string, changed: boolean) {
  const last = runs[runs.length - 1];
  if (last && last.changed === changed) {
    last.text += character;
    return;
  }
  runs.push({ text: character, changed });
}

/** How many characters differ, for the sentence that introduces the diff. */
export function changedCount(runs: Run[]): number {
  return runs.reduce((total, run) => total + (run.changed ? run.text.length : 0), 0);
}
