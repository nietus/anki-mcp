import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { describeError } from "./anki.js";
import { audioTools } from "./tools/audio.js";
import { cardTools } from "./tools/cards.js";
import { deckTools } from "./tools/decks.js";
import { modelTools } from "./tools/models.js";
import { noteTools } from "./tools/notes.js";
export const allTools = [
    ...deckTools,
    ...cardTools,
    ...noteTools,
    ...audioTools,
    ...modelTools,
];
const toolsByName = new Map(allTools.map((tool) => [tool.name, tool]));
export function registerToolHandlers(server, getClient) {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: allTools.map(({ name, description, inputSchema, annotations }) => ({
            name,
            description,
            inputSchema,
            annotations,
        })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const tool = toolsByName.get(name);
        if (!tool) {
            return {
                content: [{ type: "text", text: `Unknown tool: ${name}` }],
                isError: true,
            };
        }
        try {
            const result = await tool.handler(args ?? {}, getClient());
            const text = typeof result === "string" ? result : JSON.stringify(result);
            return { content: [{ type: "text", text }] };
        }
        catch (error) {
            // Returned as a tool result (not a protocol error) so the model can
            // read the message and react, e.g. ask the user to open Anki.
            console.error(`[anki-mcp] ${name} failed:`, error);
            return {
                content: [{ type: "text", text: describeError(error) }],
                isError: true,
            };
        }
    });
}
