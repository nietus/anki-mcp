import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { YankiConnect } from "yanki-connect";
import { registerResourceHandlers } from "./resource-manager.js";
import { registerToolHandlers } from "./tool-manager.js";
// Card interface is now in interfaces.ts and used within resource-manager or tool-manager where needed
// cleanWithRegex is now in utils.ts and used internally by other modules

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

// Register resource handlers from resource-manager.ts
registerResourceHandlers(server, client);

// Register tool handlers from tool-manager.ts
registerToolHandlers(server, client);

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
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[MCP Anki Client] Critical error in main execution:", error);
  process.exit(1);
});