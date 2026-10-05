import { optBool, optNumber, optNumberArray, optString, optStringArray, reqEnum, reqNumber, reqString, } from "../args.js";
import { MAX_CARDS_INFO, cardsInfoChunked, fetchStudyCards, formatCard, } from "../cards.js";
import { buildCardFilterQuery, cardIdsProperty, dryRunProperty, filterProperties, resolveCardIds, searchTerm, } from "../query.js";
import { rankWeakCards } from "../stats.js";
import { EASE_LABELS, formatInterval } from "../utils.js";
import { DESTRUCTIVE, IDEMPOTENT_WRITE, READ_ONLY, WRITE, } from "./types.js";
const CARD_SECTIONS = ["question", "answer", "fields", "stats"];
function studyQuery(base, deckName) {
    return deckName ? `${searchTerm("deck", deckName)} ${base}` : base;
}
const REVIEW_TYPES = ["learn", "review", "relearn", "filtered", "manual"];
export const cardTools = [
    {
        name: "get_due_cards",
        description: "Get cards due for review now (learning cards first, then oldest due). Each card includes the interval every button would give (nextIntervals).",
        inputSchema: {
            type: "object",
            properties: {
                num: { type: "number", description: "How many cards to return (1-100)." },
                deckName: { type: "string", description: "Optional deck to study (subdecks included)." },
            },
            required: ["num"],
        },
        annotations: READ_ONLY,
        handler: async (args, client) => {
            const num = reqNumber(args, "num", { min: 1, max: 100 });
            return fetchStudyCards(client, studyQuery("is:due", optString(args, "deckName")), num);
        },
    },
    {
        name: "get_new_cards",
        description: "Get new, never-studied cards (suspended cards excluded).",
        inputSchema: {
            type: "object",
            properties: {
                num: { type: "number", description: "How many cards to return (1-100)." },
                deckName: { type: "string", description: "Optional deck (subdecks included)." },
            },
            required: ["num"],
        },
        annotations: READ_ONLY,
        handler: async (args, client) => {
            const num = reqNumber(args, "num", { min: 1, max: 100 });
            // is:new matches on card type, so it would include suspended new cards.
            return fetchStudyCards(client, studyQuery("is:new -is:suspended", optString(args, "deckName")), num);
        },
    },
    {
        name: "answer_cards",
        description: "Record the user's answers to cards you quizzed them on (1=Again, 2=Hard, 3=Good, 4=Easy). Returns each card's new interval.",
        inputSchema: {
            type: "object",
            properties: {
                answers: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            cardId: { type: "number" },
                            ease: { type: "number", description: "1=Again, 2=Hard, 3=Good, 4=Easy" },
                        },
                        required: ["cardId", "ease"],
                    },
                },
            },
            required: ["answers"],
        },
        annotations: WRITE,
        handler: async (args, client) => {
            const raw = args.answers;
            if (!Array.isArray(raw) || raw.length === 0) {
                throw new Error("'answers' must be a non-empty array.");
            }
            const answers = raw.map((a) => {
                const cardId = Number(a?.cardId);
                const ease = Number(a?.ease);
                if (!Number.isFinite(cardId))
                    throw new Error("Every answer needs a numeric cardId.");
                if (![1, 2, 3, 4].includes(ease)) {
                    throw new Error(`Invalid ease ${a?.ease} for card ${cardId}; use 1-4.`);
                }
                return { cardId, ease };
            });
            const ok = await client.card.answerCards({ answers });
            const infos = await client.card.cardsInfo({
                cards: answers.map((a) => a.cardId),
            });
            const byId = new Map(infos.map((c) => [c.cardId, c]));
            const results = answers.map((a, i) => ({
                cardId: a.cardId,
                answer: EASE_LABELS[a.ease - 1],
                recorded: Boolean(ok[i]),
                nextInterval: byId.has(a.cardId)
                    ? formatInterval(byId.get(a.cardId).interval)
                    : undefined,
            }));
            if (results.every((r) => !r.recorded)) {
                throw new Error(`No answers were recorded (card IDs: ${answers
                    .map((a) => a.cardId)
                    .join(", ")}). Check that the cards exist.`);
            }
            return results;
        },
    },
    {
        name: "undo",
        description: "Undo the most recent action in Anki (a review, a field edit, a suspend...). One action per call.",
        inputSchema: { type: "object", properties: {} },
        annotations: WRITE,
        handler: async (_args, client) => {
            const succeeded = await client.graphical.guiUndo();
            if (!succeeded) {
                throw new Error("Undo failed: there may be nothing to undo, or the Anki review screen isn't open.");
            }
            return "Undid the last action.";
        },
    },
    {
        name: "find_cards",
        description: "Search cards with an Anki query and return a page of results. Choose the sections you need to keep output small; use 'fields' when you plan to edit notes.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: 'Anki search query, e.g. \'"deck:My Deck" tag:verbs -is:suspended\'. Empty field: \'Field:\'; non-empty: \'Field:_*\'.',
                },
                include: {
                    type: "array",
                    items: { type: "string", enum: [...CARD_SECTIONS] },
                    description: "Sections to return (default: question, answer).",
                },
                limit: { type: "number", description: "Page size, 1-100 (default 20)." },
                offset: { type: "number", description: "Number of cards to skip (default 0)." },
            },
            required: ["query"],
        },
        annotations: READ_ONLY,
        handler: async (args, client) => {
            const query = reqString(args, "query");
            const limit = optNumber(args, "limit", { min: 1, max: 100 }) ?? 20;
            const offset = optNumber(args, "offset", { min: 0 }) ?? 0;
            const include = optStringArray(args, "include");
            for (const section of include) {
                if (!CARD_SECTIONS.includes(section)) {
                    throw new Error(`Unknown section '${section}'. Use: ${CARD_SECTIONS.join(", ")}.`);
                }
            }
            const sections = new Set(include.length > 0 ? include : ["question", "answer"]);
            // Sort IDs (creation order) so pages are stable, and only fetch one page.
            const allIds = (await client.card.findCards({ query })).sort((a, b) => a - b);
            const pageIds = allIds.slice(offset, offset + limit);
            const cards = pageIds.length > 0 ? await client.card.cardsInfo({ cards: pageIds }) : [];
            return {
                total: allIds.length,
                offset,
                returned: cards.length,
                hasMore: offset + cards.length < allIds.length,
                cards: cards.map((c) => formatCard(c, sections)),
            };
        },
    },
    {
        name: "suspend_cards",
        description: "Deactivate (suspend) cards so they stop appearing in reviews until unsuspend_cards is called. Scheduling (interval, ease, due date) is kept intact. Pass a label when the user will want to resume this exact group later.",
        inputSchema: {
            type: "object",
            properties: {
                ...filterProperties,
                ...cardIdsProperty,
                label: {
                    type: "string",
                    description: "Name for this pause (e.g. 'hsk5-6'). Tags the notes with paused::<label>.",
                },
                ...dryRunProperty,
            },
        },
        annotations: IDEMPOTENT_WRITE,
        handler: async (args, client) => setSuspended(args, client, true),
    },
    {
        name: "unsuspend_cards",
        description: "Reactivate (unsuspend) cards with their original scheduling. With a label, resumes exactly the cards paused under it (cards suspended for other reasons stay suspended); list groups with manage_tags { action: 'list', prefix: 'paused' }.",
        inputSchema: {
            type: "object",
            properties: {
                ...filterProperties,
                ...cardIdsProperty,
                label: { type: "string", description: "Resume the group paused under this label." },
                ...dryRunProperty,
            },
        },
        annotations: IDEMPOTENT_WRITE,
        handler: async (args, client) => setSuspended(args, client, false),
    },
    {
        name: "move_cards",
        description: "Move cards to another deck (created automatically if it doesn't exist).",
        inputSchema: {
            type: "object",
            properties: {
                targetDeck: { type: "string", description: "Destination deck name." },
                ...filterProperties,
                ...cardIdsProperty,
                ...dryRunProperty,
            },
            required: ["targetDeck"],
        },
        annotations: IDEMPOTENT_WRITE,
        handler: async (args, client) => {
            const targetDeck = reqString(args, "targetDeck");
            const { cardIds, query } = await resolveCardIds(client, args);
            const target = query ?? `${cardIds.length} explicit card IDs`;
            if (cardIds.length === 0)
                return `No cards to move (${target}).`;
            if (optBool(args, "dryRun")) {
                return `Dry run: would move ${cardIds.length} cards to "${targetDeck}" (${target}).`;
            }
            await client.deck.changeDeck({ cards: cardIds, deck: targetDeck });
            return `Moved ${cardIds.length} cards to "${targetDeck}" (${target}).`;
        },
    },
    {
        name: "reschedule_cards",
        description: "Change card scheduling: set a due date (e.g. vacation backlog), forget (reset to new) or relearn. Reversible only via undo, so preview with dryRun on broad filters.",
        inputSchema: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["set_due_date", "forget", "relearn"],
                    description: "set_due_date: make cards due on given days; forget: reset to new; relearn: put back into relearning.",
                },
                days: {
                    type: "string",
                    description: "For set_due_date: '0' = today, '1' = tomorrow, '3-7' = spread randomly over 3-7 days, suffix '!' also sets the interval (e.g. '1!').",
                },
                ...filterProperties,
                ...cardIdsProperty,
                ...dryRunProperty,
            },
            required: ["action"],
        },
        annotations: DESTRUCTIVE,
        handler: async (args, client) => {
            const action = reqEnum(args, "action", ["set_due_date", "forget", "relearn"]);
            const days = optString(args, "days");
            if (action === "set_due_date" && (!days || !/^\d+(-\d+)?!?$/.test(days))) {
                throw new Error("set_due_date needs 'days' like '0', '1!', or '3-7'.");
            }
            const { cardIds, query } = await resolveCardIds(client, args);
            const target = query ?? `${cardIds.length} explicit card IDs`;
            if (cardIds.length === 0)
                return `No cards matched (${target}).`;
            if (optBool(args, "dryRun")) {
                return `Dry run: would apply ${action}${days ? ` (${days})` : ""} to ${cardIds.length} cards (${target}).`;
            }
            if (action === "set_due_date") {
                await client.card.setDueDate({ cards: cardIds, days: days });
            }
            else if (action === "forget") {
                await client.card.forgetCards({ cards: cardIds });
            }
            else {
                await client.card.relearnCards({ cards: cardIds });
            }
            return `Applied ${action}${days ? ` (${days})` : ""} to ${cardIds.length} cards (${target}).`;
        },
    },
    {
        name: "find_leeches",
        description: "Find the user's weakest cards (leech tag or many lapses), ranked by lapses and ease. Good for focused drills or rewriting confusing cards.",
        inputSchema: {
            type: "object",
            properties: {
                ...filterProperties,
                minLapses: { type: "number", description: "Minimum lapses to count as weak (default 3)." },
                limit: { type: "number", description: "How many cards to return, 1-50 (default 15)." },
                includeSuspended: {
                    type: "boolean",
                    description: "Include suspended cards (Anki auto-suspends leeches). Default true.",
                },
            },
        },
        annotations: READ_ONLY,
        handler: async (args, client) => {
            const minLapses = optNumber(args, "minLapses", { min: 1 }) ?? 3;
            const limit = optNumber(args, "limit", { min: 1, max: 50 }) ?? 15;
            const filter = buildCardFilterQuery(args, { allowEmpty: true });
            const suspended = optBool(args, "includeSuspended", true) ? "" : "-is:suspended";
            const query = [filter, `(tag:leech OR prop:lapses>=${minLapses})`, "-is:new", suspended]
                .filter(Boolean)
                .join(" ");
            const ids = (await client.card.findCards({ query })).slice(0, MAX_CARDS_INFO);
            if (ids.length === 0)
                return { query, total: 0, cards: [] };
            const infos = await cardsInfoChunked(client, ids);
            const factors = await client.card.getEaseFactors({ cards: ids });
            const factorById = new Map(ids.map((id, i) => [id, factors[i] ?? 0]));
            const ranked = rankWeakCards(infos.map((card) => ({ ...card, factor: factorById.get(card.cardId) ?? 0 }))).slice(0, limit);
            return {
                query,
                total: ids.length,
                cards: ranked.map((card) => formatCard(card, new Set(["question", "answer", "stats"]))),
            };
        },
    },
    {
        name: "get_card_history",
        description: "Full review log of specific cards (date, button, interval change, time spent), to explain why a card keeps being forgotten.",
        inputSchema: {
            type: "object",
            properties: {
                cardIds: { type: "array", items: { type: "number" }, description: "Up to 20 card IDs." },
            },
            required: ["cardIds"],
        },
        annotations: READ_ONLY,
        handler: async (args, client) => {
            const cardIds = optNumberArray(args, "cardIds");
            if (cardIds.length === 0 || cardIds.length > 20) {
                throw new Error("'cardIds' must contain between 1 and 20 IDs.");
            }
            const [infos, reviews] = await Promise.all([
                client.card.cardsInfo({ cards: cardIds }),
                client.statistic.getReviewsOfCards({ cards: cardIds.map(String) }),
            ]);
            return infos.map((card) => ({
                ...formatCard(card, new Set(["question", "answer", "stats"])),
                reviews: (reviews[String(card.cardId)] ?? []).map((r) => ({
                    date: new Date(r.id).toISOString().slice(0, 16).replace("T", " "),
                    button: EASE_LABELS[r.ease - 1] ?? r.ease,
                    type: REVIEW_TYPES[r.type] ?? r.type,
                    interval: `${formatInterval(r.lastIvl)} → ${formatInterval(r.ivl)}`,
                    seconds: Math.round(r.time / 1000),
                })),
            }));
        },
    },
];
/** Tag put on notes suspended as a named group, e.g. `paused::hsk5-6`. */
export function pauseTag(label) {
    const slug = label.trim().replace(/\s+/g, "-").replace(/"/g, "");
    if (!slug)
        throw new Error("'label' cannot be empty.");
    return `paused::${slug}`;
}
async function setSuspended(args, client, suspend) {
    const label = optString(args, "label");
    const dryRun = optBool(args, "dryRun");
    if (label && !suspend) {
        // Resume a named group: only cards this server paused under that label.
        const tag = pauseTag(label);
        const filter = [buildCardFilterQuery(args, { allowEmpty: true }), searchTerm("tag", tag)]
            .filter(Boolean)
            .join(" ");
        const [cardIds, noteIds] = await Promise.all([
            client.card.findCards({ query: `${filter} is:suspended` }),
            client.note.findNotes({ query: filter }),
        ]);
        if (noteIds.length === 0)
            return `Nothing is paused under "${label}" (${filter}).`;
        if (dryRun) {
            return `Dry run: would unsuspend ${cardIds.length} cards paused as "${label}" (${filter}).`;
        }
        if (cardIds.length > 0)
            await client.card.unsuspend({ cards: cardIds });
        await client.note.removeTags({ notes: noteIds, tags: tag });
        return `Unsuspended ${cardIds.length} cards paused as "${label}" and removed the tag ${tag} from ${noteIds.length} notes.`;
    }
    // Only touch cards whose state actually changes.
    const { cardIds, query } = await resolveCardIds(client, args, suspend ? "-is:suspended" : "is:suspended");
    const target = query ?? `${cardIds.length} explicit card IDs`;
    const verb = suspend ? "suspend" : "unsuspend";
    if (cardIds.length === 0) {
        return `No ${suspend ? "active" : "suspended"} cards matched (${target}).`;
    }
    if (dryRun) {
        return `Dry run: would ${verb} ${cardIds.length} cards (${target}).`;
    }
    if (suspend) {
        await client.card.suspend({ cards: cardIds });
        if (label) {
            const tag = pauseTag(label);
            const noteIds = await client.card.cardsToNotes({ cards: cardIds });
            await client.note.addTags({ notes: noteIds, tags: tag });
            return `Suspended ${cardIds.length} cards (${target}) and tagged ${noteIds.length} notes with ${tag}. Resume with unsuspend_cards { label: "${label}" }.`;
        }
    }
    else {
        await client.card.unsuspend({ cards: cardIds });
    }
    return `${suspend ? "Suspended" : "Unsuspended"} ${cardIds.length} cards (${target}).`;
}
