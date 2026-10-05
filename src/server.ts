import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { YankiConnect } from "yanki-connect";
import { registerPromptHandlers } from "./prompts.js";
import { registerResourceHandlers } from "./resource-manager.js";
import { registerToolHandlers } from "./tool-manager.js";

export const SERVER_VERSION = "0.2.0";

/** Sent once at connection time instead of repeating these rules in every tool description. */
export const SERVER_INSTRUCTIONS = `Anki MCP: control the user's Anki collection through AnkiConnect.

Card content:
- Field values are HTML, never Markdown: <br> for line breaks, <strong>/<em>, <ol>/<ul>/<li>, and <pre style="background-color: transparent; padding: 10px; border-radius: 5px;"> for code.
- Before adding to an existing deck, call get_deck_model_info to get the note type and field names.
- New notes: add_card (one), add_bulk (many), add_cloze_cards (cloze). Existing notes: update_note_fields / bulk_update_notes.

Studying:
- Start with get_study_overview, then get_due_cards. Ask one question at a time, grade the reply, and record it with answer_cards (1=Again, 2=Hard, 3=Good, 4=Easy).
- find_leeches and get_card_history help with cards the user keeps forgetting.

Selecting cards/notes:
- Bulk tools take deckName (subdecks included), tags (matches any of them, child tags like tag::sub included) and query (any Anki search, ANDed), or explicit cardIds/noteIds which override the filters.

Safety:
- Bulk writes (suspend/unsuspend, move, reschedule, tags, find_and_replace, add_bulk) accept dryRun: preview first when the selection is broad.
- delete_notes always needs a preview + confirmToken; show the preview to the user and only confirm after they agree.
- If a tool says Anki can't be reached, ask the user to open Anki instead of retrying.`;

export function createServer(getClient: () => YankiConnect): Server {
  const server = new Server(
    { name: "anki-mcp", version: SERVER_VERSION },
    {
      capabilities: { resources: {}, tools: {}, prompts: {} },
      instructions: SERVER_INSTRUCTIONS,
    }
  );
  registerToolHandlers(server, getClient);
  registerResourceHandlers(server, getClient);
  registerPromptHandlers(server);
  return server;
}
