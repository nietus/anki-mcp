import { createHash } from "crypto";

/** Formats a date as YYYY-MM-DD in local time (the format AnkiConnect uses). */
export function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDateString(new Date(y, m - 1, d + delta));
}

/**
 * Consecutive days with at least one review, ending today. If nothing has
 * been reviewed today yet, the streak ending yesterday still counts.
 */
export function computeStreak(
  byDay: [string, number][],
  today: string
): number {
  const reviewed = new Set(byDay.filter(([, n]) => n > 0).map(([d]) => d));
  let day = reviewed.has(today) ? today : shiftDays(today, -1);
  let streak = 0;
  while (reviewed.has(day)) {
    streak++;
    day = shiftDays(day, -1);
  }
  return streak;
}

/** Total reviews in the last `days` days, today included. */
export function reviewsInLastDays(
  byDay: [string, number][],
  today: string,
  days: number
): number {
  const since = shiftDays(today, -(days - 1));
  return byDay
    .filter(([d]) => d >= since && d <= today)
    .reduce((sum, [, n]) => sum + n, 0);
}

export type ReviewTuple = [
  reviewTime: number,
  cardID: number,
  usn: number,
  buttonPressed: number,
  newInterval: number,
  previousInterval: number,
  newFactor: number,
  reviewDuration: number,
  reviewType: number
];

const MATURE_DAYS = 21;

function pct(passed: number, total: number): number | null {
  return total === 0 ? null : Math.round((passed / total) * 1000) / 10;
}

/**
 * Computes true retention from the review log: the share of review-type
 * answers (not learning steps) that were not "Again". Split into young
 * (interval < 21 days) and mature cards, the way Anki's stats do.
 */
export function summarizeReviews(reviews: ReviewTuple[]) {
  let young = 0;
  let youngPassed = 0;
  let mature = 0;
  let maturePassed = 0;
  let learning = 0;
  let totalMs = 0;
  const perDay = new Map<string, number>();
  const cards = new Set<number>();

  for (const [time, cardId, , button, , prevIvl, , duration, type] of reviews) {
    cards.add(cardId);
    totalMs += duration;
    const day = localDateString(new Date(time));
    perDay.set(day, (perDay.get(day) ?? 0) + 1);

    // reviewType: 0 = learn, 1 = review, 2 = relearn, 3 = filtered, 4 = manual
    if (type === 1) {
      const passed = button > 1;
      if (prevIvl >= MATURE_DAYS) {
        mature++;
        if (passed) maturePassed++;
      } else {
        young++;
        if (passed) youngPassed++;
      }
    } else if (type === 0 || type === 2) {
      learning++;
    }
  }

  return {
    totalReviews: reviews.length,
    uniqueCards: cards.size,
    learningSteps: learning,
    retention: {
      overall: pct(youngPassed + maturePassed, young + mature),
      young: pct(youngPassed, young),
      mature: pct(maturePassed, mature),
      youngReviews: young,
      matureReviews: mature,
    },
    avgSecondsPerReview:
      reviews.length === 0
        ? null
        : Math.round(totalMs / reviews.length / 100) / 10,
    totalMinutes: Math.round(totalMs / 60000),
    reviewsPerDay: Object.fromEntries(
      [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
  };
}

export interface WeakCardStats {
  cardId: number;
  lapses: number;
  reps: number;
  factor: number;
  interval: number;
}

/**
 * Orders cards from weakest to strongest: most lapses first, then lowest ease,
 * then shortest interval.
 */
export function rankWeakCards<T extends WeakCardStats>(cards: T[]): T[] {
  return [...cards].sort(
    (a, b) =>
      b.lapses - a.lapses || a.factor - b.factor || a.interval - b.interval
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wraps each term (first occurrence, case-insensitive) in a cloze deletion
 * `{{cN::term}}`, numbering them in order. Text that already contains cloze
 * markup can be passed without terms.
 */
export function wrapCloze(text: string, terms: string[] = []): string {
  let result = text;
  terms.forEach((term, i) => {
    const re = new RegExp(escapeRegExp(term), "i");
    const match = re.exec(result);
    if (!match) {
      throw new Error(`Cloze term "${term}" was not found in the text.`);
    }
    const start = match.index;
    result =
      result.slice(0, start) +
      `{{c${i + 1}::${match[0]}}}` +
      result.slice(start + match[0].length);
  });

  if (!/\{\{c\d+::/.test(result)) {
    throw new Error(
      "Cloze text needs at least one deletion: pass 'terms' or use {{c1::...}} markup."
    );
  }
  return result;
}

/**
 * Deterministic token for a set of IDs. Used for two-step deletes: the
 * preview returns the token, and the delete only runs if the same notes still
 * match when the token is sent back.
 */
export function confirmToken(ids: number[]): string {
  const sorted = [...ids].sort((a, b) => a - b).join(",");
  return createHash("sha256").update(sorted).digest("hex").slice(0, 12);
}
