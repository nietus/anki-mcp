import { ListResourcesRequestSchema, ReadResourceRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { cleanWithRegex } from "./utils.js";
/**
 * Fetches Anki cards based on a query, retrieves their information,
 * cleans the content, and sorts them by due date.
 * @param client - The YankiConnect client instance.
 * @param ankiQuery - The Anki search query
 * @returns A promise that resolves to an array of Card objects.
 */
async function findCardsAndOrder(client, ankiQuery) {
    console.error(`[MCP Anki Client] findCardsAndOrder: Processing query='${ankiQuery}'`);
    let allCardIds = await client.card.findCards({ query: ankiQuery });
    console.error(`[MCP Anki Client] findCardsAndOrder: Found ${allCardIds.length} total card IDs for query '${ankiQuery}'.`);
    if (allCardIds.length === 0) {
        return [];
    }
    if (allCardIds.length > 999) {
        console.warn(`[MCP Anki Client] findCardsAndOrder: Query '${ankiQuery}' returned ${allCardIds.length} cards. Limiting to 999.`);
        allCardIds = allCardIds.slice(0, 999);
    }
    console.error(`[MCP Anki Client] findCardsAndOrder: Fetching card info for ${allCardIds.length} IDs.`);
    const cardsData = await client.card.cardsInfo({ cards: allCardIds });
    const mappedCards = cardsData.map((card) => ({
        cardId: card.cardId,
        question: cleanWithRegex(card.question),
        answer: cleanWithRegex(card.answer),
        due: card.due
    }));
    const sortedCards = mappedCards.sort((a, b) => a.due - b.due);
    console.error(`[MCP Anki Client] findCardsAndOrder: Returning ${sortedCards.length} cards, sorted by due date.`);
    return sortedCards;
}
/**
 * Formats a simplified query keyword (e.g., "isdue", "isnew") or a deck name
 * into a full Anki search query string.
 * @param simplifiedQuery - The simplified query or deck name.
 * @returns A full Anki search query string.
 */
function formatQuery(simplifiedQuery) {
    let ankiQuery = "";
    if (simplifiedQuery.toLowerCase() === "isdue") {
        ankiQuery = "is:due";
    }
    else if (simplifiedQuery.toLowerCase() === "isnew") {
        ankiQuery = "is:new";
    }
    else if (simplifiedQuery.toLowerCase() === "deckcurrent") {
        ankiQuery = "deck:current";
    }
    else if (simplifiedQuery.includes(":")) {
        ankiQuery = simplifiedQuery;
    }
    else {
        ankiQuery = simplifiedQuery;
    }
    return ankiQuery;
}
export function registerResourceHandlers(server, getClient) {
    /**
     * Handles requests to list available resources (e.g., predefined card searches).
     * These resources can then be read to get card data.
     */
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
            resources: [
                {
                    uri: "anki://search/deckcurrent",
                    mimeType: "application/json",
                    name: "Current Deck",
                    description: "Current Anki deck"
                },
                {
                    uri: "anki://search/isdue",
                    mimeType: "application/json",
                    name: "Due cards",
                    description: "Cards in review and learning waiting to be studied"
                },
                {
                    uri: "anki://search/isnew",
                    mimeType: "application/json",
                    name: "New cards",
                    description: "All unseen cards"
                }
            ]
        };
    });
    /**
     * Handles requests to read the content of a specific resource (e.g., fetch cards for "is:due").
     * It uses the findCardsAndOrder function to get and process the cards.
     */
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const url = new URL(request.params.uri);
        const queryParts = url.pathname.split('/');
        const simplifiedQuery = queryParts[queryParts.length - 1];
        if (!simplifiedQuery) {
            throw new Error("Invalid resource URI: unable to extract query from path.");
        }
        const client = getClient();
        const ankiQuery = formatQuery(simplifiedQuery);
        const cards = await findCardsAndOrder(client, ankiQuery);
        return {
            contents: [{
                    uri: request.params.uri,
                    mimeType: "application/json",
                    text: JSON.stringify(cards)
                }]
        };
    });
}
