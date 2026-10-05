import { YankiConnect } from "yanki-connect";
import {
  EASE_LABELS,
  answerOnly,
  chunk,
  cleanWithRegex,
  formatInterval,
  queueLabel,
  truncate,
} from "./utils.js";

type CardInfo = Awaited<ReturnType<YankiConnect["card"]["cardsInfo"]>>[number];

/** Upper bound of cards fetched with cardsInfo in one tool call. */
export const MAX_CARDS_INFO = 1000;

/** cardsInfo in chunks, so huge selections don't become one giant request. */
export async function cardsInfoChunked(
  client: YankiConnect,
  cardIds: number[]
): Promise<CardInfo[]> {
  const results: CardInfo[] = [];
  for (const ids of chunk(cardIds, 250)) {
    results.push(...(await client.card.cardsInfo({ cards: ids })));
  }
  return results;
}

/**
 * Maps AnkiConnect's per-button interval preview (e.g. ["<1m","<10m","4d","9d"])
 * to button labels, so the agent can say "Good → 4 days".
 */
export function nextReviewsByButton(
  card: CardInfo
): Record<string, string> | undefined {
  const next = card.nextReviews;
  if (!Array.isArray(next) || next.length === 0) return undefined;
  return Object.fromEntries(
    next.map((v, i) => [
      next.length === 4 ? EASE_LABELS[i] : `button${i + 1}`,
      // Anki wraps the numbers in invisible bidi isolate marks.
      v.replace(/[⁦-⁩]/g, ""),
    ])
  );
}

export type CardSection = "question" | "answer" | "fields" | "stats";

/** Builds a compact card object containing only the requested sections. */
export function formatCard(card: CardInfo, sections: Set<CardSection>) {
  const out: Record<string, unknown> = {
    cardId: card.cardId,
    noteId: card.note,
    deckName: card.deckName,
    modelName: card.modelName,
  };
  const question = cleanWithRegex(card.question);
  if (sections.has("question")) out.question = truncate(question);
  if (sections.has("answer")) {
    out.answer = truncate(answerOnly(question, cleanWithRegex(card.answer)));
  }
  if (sections.has("fields")) {
    out.fields = Object.fromEntries(
      Object.entries(card.fields)
        .sort(([, a], [, b]) => a.order - b.order)
        .map(([name, field]) => [name, truncate(cleanWithRegex(field.value))])
    );
  }
  if (sections.has("stats")) {
    out.state = queueLabel(card.queue);
    out.interval = formatInterval(card.interval);
    out.reps = card.reps;
    out.lapses = card.lapses;
    const factor = (card as { factor?: number }).factor;
    if (factor) out.ease = `${factor / 10}%`;
  }
  return out;
}

/** Learning cards first (they're time-critical), then by due. */
function studyOrder(a: CardInfo, b: CardInfo): number {
  const la = a.queue === 1 || a.queue === 3 ? 0 : 1;
  const lb = b.queue === 1 || b.queue === 3 ? 0 : 1;
  return la - lb || a.due - b.due;
}

/**
 * Fetches cards for a study session: question, answer (without the repeated
 * question) and the interval each button would give.
 */
export async function fetchStudyCards(
  client: YankiConnect,
  query: string,
  limit: number
) {
  const allIds = await client.card.findCards({ query });
  const ids = allIds.slice(0, MAX_CARDS_INFO);
  const cards = (await cardsInfoChunked(client, ids)).sort(studyOrder);

  return {
    total: allIds.length,
    returned: Math.min(limit, cards.length),
    cards: cards.slice(0, limit).map((card) => {
      const question = cleanWithRegex(card.question);
      return {
        cardId: card.cardId,
        deckName: card.deckName,
        state: queueLabel(card.queue),
        question: truncate(question),
        answer: truncate(answerOnly(question, cleanWithRegex(card.answer))),
        nextIntervals: nextReviewsByButton(card),
      };
    }),
  };
}
