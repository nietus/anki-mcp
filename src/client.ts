import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { YankiConnect } from "yanki-connect";

console.error("[MCP Anki Client] Script started.");

let client: YankiConnect;
try {
  console.error("[MCP Anki Client] Initializing YankiConnect...");
  client = new YankiConnect();
  console.error("[MCP Anki Client] YankiConnect initialized successfully.");
} catch (e: any) {
  console.error("[MCP Anki Client] Error initializing YankiConnect:", e.message, e.stack);
  process.exit(1);
}

interface Card {
  cardId: number;
  question: string;
  answer: string;
  due: number;
}

/**
 * Create an MCP server with capabilities for resources (to get Anki cards),
 * and tools (create new cards, get cards, update card fields, get deck names, et cetera).
 */
const server = new Server(
  {
    name: "anki-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

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
        mimiType: "application/json",
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
  const query = url.pathname.split("/").pop();
  if (!query) {
    throw new Error("Invalid resource URI");
  }

  const cards = await findCardsAndOrder(query);

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "application/json",
      text: JSON.stringify(cards)
    }]
  };
});

/**
 * Fetches Anki cards based on a query, retrieves their information,
 * cleans the content, and sorts them by due date.
 * @param query - The Anki search query
 * @returns A promise that resolves to an array of Card objects.
 */
async function findCardsAndOrder(ankiQuery: string): Promise<Card[]> {
  console.error(`[MCP Anki Client] findCardsAndOrder: Processing query='${ankiQuery}'`);

  // Step 1: Find ALL card IDs matching the core query
  let allCardIds = await client.card.findCards({ query: ankiQuery });
  console.error(`[MCP Anki Client] findCardsAndOrder: Found ${allCardIds.length} total card IDs for query '${ankiQuery}'.`);

  if (allCardIds.length === 0) {
    return []; // No cards match the query
  }

  // Limit to 100 cards
  if (allCardIds.length > 100) {
    console.warn(`[MCP Anki Client] findCardsAndOrder: Query '${ankiQuery}' returned ${allCardIds.length} cards. Limiting to 100.`);
    allCardIds = allCardIds.slice(0, 100);
  }

  // Step 2: Get card info for ALL found IDs
  console.error(`[MCP Anki Client] findCardsAndOrder: Fetching card info for ${allCardIds.length} IDs.`);
  const cardsData = await client.card.cardsInfo({ cards: allCardIds });
  
  const mappedCards: Card[] = cardsData.map((card: { cardId: number; question: string; answer: string; due: number; /* other props */ }) => ({
    cardId: card.cardId,
    question: cleanWithRegex(card.question),
    answer: cleanWithRegex(card.answer),
    due: card.due
  }));

  // Step 3: Sort the fetched cards by due date
  const sortedCards = mappedCards.sort((a: Card, b: Card) => a.due - b.due);
  console.error(`[MCP Anki Client] findCardsAndOrder: Returning ${sortedCards.length} cards, sorted by due date.`);
  
  return sortedCards;
}

/**
 * Formats a simplified query keyword (e.g., "isdue", "isnew") or a deck name
 * into a full Anki search query string.
 * @param simplifiedQuery - The simplified query or deck name.
 * @returns A full Anki search query string.
 */
function formatQuery(simplifiedQuery: string): string {
  let ankiQuery = "";
  // Handle cases from resource URIs like "isdue", "isnew", "deckcurrent"
  if (simplifiedQuery.toLowerCase() === "isdue") {
    ankiQuery = "is:due";
  }
  else if (simplifiedQuery.toLowerCase() === "isnew") {
    ankiQuery = "is:new";
  }
  else if (simplifiedQuery.toLowerCase() === "deckcurrent") {
    ankiQuery = "deck:current";
  }
  // If it already looks like a full query, pass it through
  else if (simplifiedQuery.includes(":")) {
    ankiQuery = simplifiedQuery;
  }
  else {
    // Fallback for other simple terms, though the above should cover current usage
    ankiQuery = simplifiedQuery;
  }

  return ankiQuery;
}

/**
 * Cleans an HTML string from a card field by removing style tags,
 * replacing divs with newlines, stripping all other HTML tags,
 * removing Anki-specific [anki:play:] tags, converting HTML entities,
 * and trimming whitespace.
 * @param htmlString - The HTML string to clean.
 * @returns A cleaned string with basic formatting preserved.
 */
function cleanWithRegex(htmlString: string): string {
  return htmlString
    // Remove style tags and their content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Replace divs with newlines
    .replace(/<div[^>]*>/g, '\n')
    // Remove all HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Remove anki play tags
    .replace(/\[anki:play:[^\]]+\]/g, '')
    // Convert HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Clean up whitespace but preserve newlines
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Handles requests to list available tools that the MCP client can execute.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "update_cards",
        description: "After the user answers cards you've quizzed them on, use this tool to mark them answered and update their ease",
        inputSchema: {
          type: "object",
          properties: {
            answers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  cardId: {
                    type: "number",
                    description: "Id of the card to answer"
                  },
                  ease: {
                    type: "number",
                    description: "Ease of the card between 1 (Again) and 4 (Easy)"
                  }
                }
              }
            }
          },
        }
      },
      {
        name: "add_card",
        description: "Create a new flashcard in Anki for the user. Must use HTML formatting only. IMPORTANT FORMATTING RULES:\n1. Must use HTML tags for ALL formatting - NO markdown\n2. Use <br> for ALL line breaks\n3. For code blocks, use <pre> with inline CSS styling\n4. Example formatting:\n   - Line breaks: <br>\n   - Code: <pre style=\"background-color: transparent; padding: 10px; border-radius: 5px;\">\n   - Lists: <ol> and <li> tags\n   - Bold: <strong>\n   - Italic: <em>",
        inputSchema: {
          type: "object",
          properties: {
            front: {
              type: "string",
              description: "The front of the card. Must use HTML formatting only."
            },
            back: {
              type: "string",
              description: "The back of the card. Must use HTML formatting only."
            }
          },
          required: ["front", "back"]
        }
      },
      {
        name: "get_due_cards",
        description: "Returns a given number (num) of cards due for review.",
        inputSchema: {
          type: "object",
          properties: {
            num: {
              type: "number",
              description: "Number of due cards to get"
            }
          },
          required: ["num"]
        },
      },
      {
        name: "get_new_cards",
        description: "Returns a given number (num) of new and unseen cards.",
        inputSchema: {
          type: "object",
          properties: {
            num: {
              type: "number",
              description: "Number of new cards to get"
            }
          },
          required: ["num"]
        },
      },
      {
        name: "get-deck-names",
        description: "Get a list of all Anki deck names.",
        inputSchema: {
          type: "object",
          properties: {},
        }
      },
      {
        name: "find-cards",
        description: "Find cards using a raw Anki search query. Returns detailed card information including fields.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Anki search query string (e.g., 'deck:Default -tag:test'). If a deck name or field contains spaces, it should be enclosed in double quotes (e.g., '\"deck:My Deck\" tag:important'). To filter for empty fields, use '-FieldName:_*' (e.g., '-Hanzi:_*')."
            }
          },
          required: ["query"]
        }
      },
      {
        name: "update-note-fields",
        description: "Update specific fields of a given Anki note.",
        inputSchema: {
          type: "object",
          properties: {
            noteId: {
              type: "number",
              description: "The ID of the Anki note to update."
            },
            fields: {
              type: "object",
              description: "An object where keys are field names and values are the new field content (e.g., {\"Front\": \"New Q\", \"Back\": \"New A\"})",
              additionalProperties: { type: "string" } // Allows any string key-value pairs
            }
          },
          required: ["noteId", "fields"]
        }
      }
    ]
  };
});

/**
 * Handles requests to call a specific tool with given arguments.
 * This is the main dispatcher for tool execution.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  switch (name) {
    case "update_cards": {
      const answers = args.answers as { cardId: number; ease: number }[];
      const result = await client.card.answerCards({ answers: answers });

      const successfulCards = answers
        .filter((_, index) => result[index])
        .map(card => card.cardId);
      const failedCards = answers.filter((_, index) => !result[index]);

      if (failedCards.length > 0) {
        const failedCardIds = failedCards.map(card => card.cardId);
        throw new Error(`Failed to update cards with IDs: ${failedCardIds.join(', ')}`);
      }

      return {
        content: [{
          type: "text",
          text: `Updated cards ${successfulCards.join(", ")}`
        }]
      };
    }

    case "add_card": {
      const front = String(args.front);
      const back = String(args.back);

      const note = {
        note: {
          deckName: 'Default',
          fields: {
            Back: back,
            Front: front,
          },
          modelName: 'Basic',
        },
      };

      const noteId = await client.note.addNote(note);
      const cardId = (await client.card.findCards({ query: `nid:${noteId}` }))[0];

      return {
        content: [{
          type: "text",
          text: `Created card with id ${cardId}`
        }]
      };
    }

    case "get_due_cards": {
      const num = Number(args.num);

      const cards = await findCardsAndOrder("isdue");

      return {
        content: [{
          type: "text",
          text: JSON.stringify(cards)
        }]
      };
    }

    case "get_new_cards": {
      const num = Number(args.num);

      const cards = await findCardsAndOrder("isnew");

      return {
        content: [{
          type: "text",
          text: JSON.stringify(cards)
        }]
      };
    }

    case "get-deck-names": {
      const deckNames = await client.deck.deckNames();
      return {
        content: [{
          type: "text",
          text: JSON.stringify(deckNames)
        }]
      };
    }

    case "find-cards": {
      const query = String(args.query);

      if (!query) {
        console.error("[MCP Anki Client] find-cards: Query parameter is required.");
        throw new Error("Query parameter is required for find-cards tool.");
      }

      console.error(`[MCP Anki Client] find-cards: Raw query: "${query}"`);

      // Step 1: Find ALL card IDs matching the query
      let allCardIds = await client.card.findCards({ query });
      console.error(`[MCP Anki Client] find-cards: Found ${allCardIds.length} total card IDs for query "${query}".`);

      if (allCardIds.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify([]) }]
        };
      }

      // Limit to 100 cards
      if (allCardIds.length > 100) {
        console.warn(`[MCP Anki Client] find-cards: Query "${query}" returned ${allCardIds.length} cards. Limiting to 100.`);
        allCardIds = allCardIds.slice(0, 100);
      }
      
      // Step 2: Get card info for ALL found card IDs
      const cardsInfoRaw = await client.card.cardsInfo({ cards: allCardIds });
      console.error(`[MCP Anki Client] find-cards: Fetched info for ${cardsInfoRaw.length} cards.`);
      
      const detailedCardsInfoWithDue = cardsInfoRaw.map(card => ({
        cardId: card.cardId,
        noteId: card.note,
        deckName: card.deckName,
        modelName: card.modelName,
        question: cleanWithRegex(card.question),
        answer: cleanWithRegex(card.answer),
        due: card.due,
        fields: Object.fromEntries(
          Object.entries(card.fields).map(([fieldName, fieldData]) => [
            fieldName, 
            cleanWithRegex(fieldData.value) // Clean each field's value
          ])
        )
      }));

      // Sort by due date in descending order (newest/latest due first)
      detailedCardsInfoWithDue.sort((a, b) => b.due - a.due);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(detailedCardsInfoWithDue)
        }]
      };
    }

    case "update-note-fields": {
      const noteId = Number(args.noteId);
      const fieldsToUpdate = args.fields as Record<string, string>;

      if (isNaN(noteId)) {
        throw new Error("Invalid noteId provided.");
      }
      if (!fieldsToUpdate || Object.keys(fieldsToUpdate).length === 0) {
        throw new Error("Fields to update cannot be empty.");
      }

      await client.note.updateNoteFields({
        note: {
          id: noteId,
          fields: fieldsToUpdate,
        },
      });

      return {
        content: [{
          type: "text",
          text: `Successfully requested update for fields of note ID: ${noteId}`
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Main function to initialize and start the MCP server.
 * It sets up the StdioServerTransport for communication.
 */
async function main() {
  console.error("[MCP Anki Client] main() function started.");
  const transport = new StdioServerTransport();
  try {
    console.error("[MCP Anki Client] Attempting server.connect(transport)...");
    await server.connect(transport);
    console.error("[MCP Anki Client] server.connect(transport) completed (this log might not be reached if server runs indefinitely).");
  } catch (error) {
    console.error("[MCP Anki Client] Error during server.connect:", error);
    process.exit(1); // Exit if connection fails critically
  }
}

main().catch((error) => {
  console.error("[MCP Anki Client] Critical error in main execution:", error);
  process.exit(1);
});