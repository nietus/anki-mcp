import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { YankiConnect } from "yanki-connect";
import { describeError } from "./anki.js";
import { fetchStudyCards } from "./cards.js";
import { studyOverview } from "./tools/decks.js";
import { modelDetails } from "./tools/models.js";

/** Card lists exposed as resources are capped so reading one stays cheap. */
const RESOURCE_CARD_LIMIT = 50;

const CARD_SEARCHES: Record<string, string> = {
  deckcurrent: "deck:current",
  isdue: "is:due",
  isnew: "is:new -is:suspended",
};

async function readResource(client: YankiConnect, uri: string): Promise<unknown> {
  const url = new URL(uri);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

  switch (url.host) {
    case "search": {
      const query = CARD_SEARCHES[parts[0]?.toLowerCase()];
      if (!query) throw new Error(`Unknown search resource: ${uri}`);
      return fetchStudyCards(client, query, RESOURCE_CARD_LIMIT);
    }
    case "collection":
      if (parts[0] === "overview") return studyOverview(client, []);
      break;
    case "deck":
      // anki://deck/{deckName}/overview
      if (parts.length === 2 && parts[1] === "overview") {
        return studyOverview(client, [parts[0]]);
      }
      break;
    case "model":
      // anki://model/{modelName}
      if (parts.length === 1) return modelDetails(client, parts[0]);
      break;
  }
  throw new Error(`Unknown resource: ${uri}`);
}

export function registerResourceHandlers(
  server: Server,
  getClient: () => YankiConnect
) {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "anki://collection/overview",
        mimeType: "application/json",
        name: "Study overview",
        description: "Due counts per deck, reviews today, streak.",
      },
      {
        uri: "anki://search/isdue",
        mimeType: "application/json",
        name: "Due cards",
        description: `Up to ${RESOURCE_CARD_LIMIT} cards waiting to be studied.`,
      },
      {
        uri: "anki://search/isnew",
        mimeType: "application/json",
        name: "New cards",
        description: `Up to ${RESOURCE_CARD_LIMIT} unseen cards.`,
      },
      {
        uri: "anki://search/deckcurrent",
        mimeType: "application/json",
        name: "Current deck",
        description: `Up to ${RESOURCE_CARD_LIMIT} cards of the deck selected in Anki.`,
      },
    ],
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      {
        uriTemplate: "anki://deck/{deckName}/overview",
        mimeType: "application/json",
        name: "Deck overview",
        description: "Due counts for one deck.",
      },
      {
        uriTemplate: "anki://model/{modelName}",
        mimeType: "application/json",
        name: "Note type details",
        description: "Fields, templates and CSS of a note type.",
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    let data: unknown;
    try {
      data = await readResource(getClient(), uri);
    } catch (error) {
      throw new Error(describeError(error));
    }
    return {
      contents: [
        { uri, mimeType: "application/json", text: JSON.stringify(data) },
      ],
    };
  });
}
