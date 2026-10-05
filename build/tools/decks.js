import { optNumber, optStringArray, reqString } from "../args.js";
import { searchTerm } from "../query.js";
import { computeStreak, localDateString, reviewsInLastDays, summarizeReviews, } from "../stats.js";
import { IDEMPOTENT_WRITE, READ_ONLY } from "./types.js";
/** Deck and all its subdecks, since cardReviews only looks at one deck. */
async function deckWithSubdecks(client, deckName) {
    const all = await client.deck.deckNames();
    if (!all.includes(deckName))
        throw new Error(`Deck '${deckName}' not found.`);
    return all.filter((d) => d === deckName || d.startsWith(`${deckName}::`));
}
export async function studyOverview(client, deckNames) {
    const decks = deckNames.length > 0
        ? deckNames
        : (await client.deck.deckNames()).filter((d) => !d.includes("::"));
    const [stats, reviewedToday, byDay] = await Promise.all([
        client.deck.getDeckStats({ decks }),
        client.statistic.getNumCardsReviewedToday(),
        client.statistic.getNumCardsReviewedByDay(),
    ]);
    const today = localDateString(new Date());
    const perDeck = Object.values(stats)
        .map((s) => ({
        deck: s.name,
        new: s.new_count,
        learning: s.learn_count,
        review: s.review_count,
        totalCards: s.total_in_deck,
    }))
        .sort((a, b) => b.review + b.learning + b.new - (a.review + a.learning + a.new));
    return {
        date: today,
        reviewedToday,
        streakDays: computeStreak(byDay, today),
        reviewsLast7Days: reviewsInLastDays(byDay, today, 7),
        reviewsLast30Days: reviewsInLastDays(byDay, today, 30),
        dueToday: perDeck.reduce((acc, d) => ({
            new: acc.new + d.new,
            learning: acc.learning + d.learning,
            review: acc.review + d.review,
        }), { new: 0, learning: 0, review: 0 }),
        decks: perDeck,
    };
}
export async function retentionStats(client, deckName, days) {
    const decks = await deckWithSubdecks(client, deckName);
    const startID = Date.now() - days * 24 * 60 * 60 * 1000;
    const reviews = (await Promise.all(decks.map((deck) => client.statistic.cardReviews({ deck, startID })))).flat();
    return { deckName, days, ...summarizeReviews(reviews) };
}
export const deckTools = [
    {
        name: "get_deck_names",
        description: "List all deck names.",
        inputSchema: { type: "object", properties: {} },
        annotations: READ_ONLY,
        handler: async (_args, client) => client.deck.deckNames(),
    },
    {
        name: "create_deck",
        description: "Create a deck (use '::' for subdecks, e.g. 'Japanese::Verbs').",
        inputSchema: {
            type: "object",
            properties: { deckName: { type: "string" } },
            required: ["deckName"],
        },
        annotations: IDEMPOTENT_WRITE,
        handler: async (args, client) => {
            const deckName = reqString(args, "deckName");
            await client.deck.createDeck({ deck: deckName });
            return `Created deck "${deckName}".`;
        },
    },
    {
        name: "get_deck_model_info",
        description: "Which note types a deck uses. Call before adding cards to an existing deck to pick the right modelName and fields.",
        inputSchema: {
            type: "object",
            properties: { deckName: { type: "string" } },
            required: ["deckName"],
        },
        annotations: READ_ONLY,
        handler: async (args, client) => {
            const deckName = reqString(args, "deckName");
            const allDeckNames = await client.deck.deckNames();
            if (!allDeckNames.includes(deckName)) {
                return { deckName, status: "deck_not_found" };
            }
            const noteIds = await client.note.findNotes({ query: searchTerm("deck", deckName) });
            if (noteIds.length === 0)
                return { deckName, status: "no_notes_found" };
            const sample = await client.note.notesInfo({ notes: noteIds.slice(0, 50) });
            const modelNames = [...new Set(sample.map((n) => n.modelName))].sort();
            return modelNames.length === 1
                ? { deckName, status: "single_model_found", modelName: modelNames[0] }
                : { deckName, status: "multiple_models_found", modelNames };
        },
    },
    {
        name: "get_study_overview",
        description: "Today's study plan: new/learning/review counts per deck, cards reviewed today, streak, and 7/30-day review totals. A good first call for a study session.",
        inputSchema: {
            type: "object",
            properties: {
                deckNames: {
                    type: "array",
                    items: { type: "string" },
                    description: "Decks to include (default: all top-level decks).",
                },
            },
        },
        annotations: READ_ONLY,
        handler: async (args, client) => studyOverview(client, optStringArray(args, "deckNames")),
    },
    {
        name: "get_retention_stats",
        description: "Learning analytics for a deck (subdecks included) over the last N days: true retention (young/mature), reviews per day, average seconds per review.",
        inputSchema: {
            type: "object",
            properties: {
                deckName: { type: "string" },
                days: { type: "number", description: "Look-back window, 1-365 (default 30)." },
            },
            required: ["deckName"],
        },
        annotations: READ_ONLY,
        handler: async (args, client) => retentionStats(client, reqString(args, "deckName"), optNumber(args, "days", { min: 1, max: 365 }) ?? 30),
    },
    {
        name: "sync",
        description: "Sync the collection with AnkiWeb (user must be logged in inside Anki).",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        handler: async (_args, client) => {
            await client.miscellaneous.sync();
            return "Synced with AnkiWeb.";
        },
    },
];
