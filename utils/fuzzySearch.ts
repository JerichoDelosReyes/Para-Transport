/**
 * Lightweight fuzzy search — checks if all characters of the query
 * appear in order within the target string. Returns a score (lower = better match).
 * Returns -1 if no match.
 */
export function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q.length === 0) return 0;
  if (q.length > t.length) return -1;

  // Exact substring match gets best score
  const substringIdx = t.indexOf(q);
  if (substringIdx !== -1) {
    return substringIdx === 0 ? 0 : 1;
  }

  // Character-by-character fuzzy matching
  let qi = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Penalise gaps between consecutive matched characters
      if (lastMatchIdx >= 0) {
        score += ti - lastMatchIdx - 1;
      }
      lastMatchIdx = ti;
      qi++;
    }
  }

  // All query chars matched?
  return qi === q.length ? score + 2 : -1;
}

export type FuzzyResult<T> = { item: T; score: number };

/**
 * Filter & rank an array of items by fuzzy-matching a query against
 * one or more string fields extracted by `getText`.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string[],
  limit = 10,
): FuzzyResult<T>[] {
  if (!query.trim()) return [];

  const results: FuzzyResult<T>[] = [];

  for (const item of items) {
    let bestScore = -1;
    for (const text of getText(item)) {
      const s = fuzzyMatch(query, text);
      if (s >= 0 && (bestScore < 0 || s < bestScore)) {
        bestScore = s;
      }
    }
    if (bestScore >= 0) {
      results.push({ item, score: bestScore });
    }
  }

  results.sort((a, b) => a.score - b.score);
  return results.slice(0, limit);
}
