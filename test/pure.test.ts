import { describe, expect, it } from "vitest";
import { describeError } from "../src/anki.js";
import { buildCardFilterQuery, searchTerm } from "../src/query.js";
import {
  ReviewTuple,
  computeStreak,
  confirmToken,
  rankWeakCards,
  reviewsInLastDays,
  summarizeReviews,
  wrapCloze,
} from "../src/stats.js";
import {
  answerOnly,
  cleanWithRegex,
  formatInterval,
  mapWithConcurrency,
} from "../src/utils.js";

describe("search queries", () => {
  it("quotes and escapes terms", () => {
    expect(searchTerm("deck", "My Deck")).toBe('"deck:My Deck"');
    expect(searchTerm("deck", 'a"b\\c')).toBe('"deck:a\\"b\\\\c"');
  });

  it("combines deck, tags (OR) and query", () => {
    expect(buildCardFilterQuery({ deckName: "Japanese::Vocab", tags: ["x"] })).toBe(
      '"deck:Japanese::Vocab" "tag:x"'
    );
    expect(buildCardFilterQuery({ tags: ["a", "b"], query: "is:review" })).toBe(
      '("tag:a" OR "tag:b") (is:review)'
    );
  });

  it("refuses an empty filter unless allowed", () => {
    expect(() => buildCardFilterQuery({})).toThrow(/at least one/);
    expect(buildCardFilterQuery({}, { allowEmpty: true })).toBe("");
  });
});

describe("text helpers", () => {
  it("cleans card HTML", () => {
    expect(cleanWithRegex("<div>Hello&nbsp;<b>world</b></div><br>a &amp;lt; b")).toBe(
      "Hello world\na &lt; b"
    );
    expect(cleanWithRegex("<style>.x{}</style>Hi [anki:play:q:0]")).toBe("Hi");
  });

  it("drops the repeated question from the answer", () => {
    expect(answerOnly("What is 2+2?", "What is 2+2?\n4")).toBe("4");
    expect(answerOnly("Q", "Different")).toBe("Different");
  });

  it("formats intervals", () => {
    expect(formatInterval(0)).toBe("new");
    expect(formatInterval(-600)).toBe("10m");
    expect(formatInterval(12)).toBe("12d");
    expect(formatInterval(90)).toBe("3.0mo");
    expect(formatInterval(730)).toBe("2.0y");
  });

  it("limits concurrency and keeps order", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});

describe("study stats", () => {
  const byDay: [string, number][] = [
    ["2026-09-25", 10],
    ["2026-09-26", 5],
    ["2026-09-27", 8],
    ["2026-09-20", 3],
  ];

  it("counts the streak ending today or yesterday", () => {
    expect(computeStreak([...byDay, ["2026-09-28", 1]], "2026-09-28")).toBe(4);
    expect(computeStreak(byDay, "2026-09-28")).toBe(3);
    expect(computeStreak(byDay, "2026-09-30")).toBe(0);
  });

  it("sums reviews in a window", () => {
    expect(reviewsInLastDays(byDay, "2026-09-27", 3)).toBe(23);
    expect(reviewsInLastDays(byDay, "2026-09-27", 30)).toBe(26);
  });

  it("computes young/mature retention from review-type answers only", () => {
    const t = new Date(2026, 8, 27, 12).getTime();
    const reviews: ReviewTuple[] = [
      [t, 1, 0, 3, 10, 5, 2500, 4000, 1], // young pass
      [t, 2, 0, 1, 1, 8, 2300, 6000, 1], // young fail
      [t, 3, 0, 3, 60, 30, 2500, 2000, 1], // mature pass
      [t, 4, 0, 1, 0, -600, 2500, 8000, 0], // learning step, ignored
    ];
    const s = summarizeReviews(reviews);
    expect(s.retention.young).toBe(50);
    expect(s.retention.mature).toBe(100);
    expect(s.retention.overall).toBe(66.7);
    expect(s.learningSteps).toBe(1);
    expect(s.avgSecondsPerReview).toBe(5);
    expect(s.reviewsPerDay).toEqual({ "2026-09-27": 4 });
  });

  it("ranks weak cards by lapses, then ease, then interval", () => {
    const ranked = rankWeakCards([
      { cardId: 1, lapses: 2, reps: 9, factor: 2500, interval: 3 },
      { cardId: 2, lapses: 5, reps: 9, factor: 2500, interval: 3 },
      { cardId: 3, lapses: 2, reps: 9, factor: 1300, interval: 3 },
    ]);
    expect(ranked.map((c) => c.cardId)).toEqual([2, 3, 1]);
  });
});

describe("cloze", () => {
  it("wraps terms in order, preserving case", () => {
    expect(wrapCloze("Paris is the capital of France", ["paris", "France"])).toBe(
      "{{c1::Paris}} is the capital of {{c2::France}}"
    );
  });

  it("accepts existing markup and rejects text without deletions", () => {
    expect(wrapCloze("{{c1::H2O}} is water")).toBe("{{c1::H2O}} is water");
    expect(() => wrapCloze("no deletions")).toThrow(/at least one/);
    expect(() => wrapCloze("abc", ["xyz"])).toThrow(/not found/);
  });
});

describe("confirm token and errors", () => {
  it("is independent of ID order and changes with the set", () => {
    expect(confirmToken([3, 1, 2])).toBe(confirmToken([1, 2, 3]));
    expect(confirmToken([1, 2])).not.toBe(confirmToken([1, 2, 3]));
  });

  it("explains connection failures", () => {
    const err = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
    expect(describeError(err)).toMatch(/open Anki/);
    expect(describeError(new Error("collection is not available"))).toMatch(/profile/);
    expect(describeError(new Error("boom"))).toBe("boom");
  });
});
