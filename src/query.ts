import { YankiConnect } from "yanki-connect";
import { ToolArgs, optNumberArray, optString, optStringArray } from "./args.js";

/**
 * Builds a quoted Anki search term (e.g. `"deck:My Deck"`), escaping
 * backslashes and double quotes so names with spaces or quotes are safe.
 */
export function searchTerm(key: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${key}:${escaped}"`;
}

/**
 * Builds an Anki search query from a deck, a list of tags (matched with OR)
 * and an optional raw query. Unless `allowEmpty` is set, at least one filter
 * is required so a write can never target the whole collection by accident.
 */
export function buildCardFilterQuery(
  args: ToolArgs,
  opts: { allowEmpty?: boolean } = {}
): string {
  const parts: string[] = [];

  const deckName = optString(args, "deckName");
  if (deckName) parts.push(searchTerm("deck", deckName));

  const tags = optStringArray(args, "tags");
  if (tags.length === 1) {
    parts.push(searchTerm("tag", tags[0]));
  } else if (tags.length > 1) {
    parts.push(`(${tags.map((t) => searchTerm("tag", t)).join(" OR ")})`);
  }

  const query = optString(args, "query");
  if (query) parts.push(`(${query})`);

  if (parts.length === 0 && !opts.allowEmpty) {
    throw new Error(
      "Provide at least one of 'deckName', 'tags' or 'query' to select cards."
    );
  }
  return parts.join(" ");
}

/** JSON-schema properties shared by every tool that selects cards/notes by filter. */
export const filterProperties = {
  deckName: {
    type: "string",
    description: "Deck (subdecks included).",
  },
  tags: {
    type: "array",
    items: { type: "string" },
    description: "Notes with any of these tags.",
  },
  query: {
    type: "string",
    description: "Extra Anki search, ANDed.",
  },
} as const;

export const cardIdsProperty = {
  cardIds: {
    type: "array",
    items: { type: "number" },
    description: "Card IDs (override filters).",
  },
} as const;

export const noteIdsProperty = {
  noteIds: {
    type: "array",
    items: { type: "number" },
    description: "Note IDs (override filters).",
  },
} as const;

export const dryRunProperty = {
  dryRun: {
    type: "boolean",
    description: "Preview without changing anything.",
  },
} as const;

/**
 * Resolves the target cards of a tool call: explicit `cardIds` win, otherwise
 * the filters are turned into a query (with an optional extra clause).
 */
export async function resolveCardIds(
  client: YankiConnect,
  args: ToolArgs,
  extraClause = ""
): Promise<{ cardIds: number[]; query?: string }> {
  const explicit = optNumberArray(args, "cardIds");
  if (explicit.length > 0) return { cardIds: explicit };

  const filter = buildCardFilterQuery(args);
  const query = extraClause ? `${filter} ${extraClause}` : filter;
  const cardIds = await client.card.findCards({ query });
  return { cardIds, query };
}

/** Same as resolveCardIds, but for notes. */
export async function resolveNoteIds(
  client: YankiConnect,
  args: ToolArgs,
  extraClause = ""
): Promise<{ noteIds: number[]; query?: string }> {
  const explicit = optNumberArray(args, "noteIds");
  if (explicit.length > 0) return { noteIds: explicit };

  const filter = buildCardFilterQuery(args);
  const query = extraClause ? `${filter} ${extraClause}` : filter;
  const noteIds = await client.note.findNotes({ query });
  return { noteIds, query };
}
