import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { YankiConnect } from "yanki-connect";
import { registerResourceHandlers } from "./resource-manager.js";
import { registerToolHandlers } from "./tool-manager.js";

console.error("[MCP Anki Client] Script started.");

let ankiClientInstance: YankiConnect | null = null;

function getAnkiClient(): YankiConnect {
  if (!ankiClientInstance) {
    console.error("[MCP Anki Client] Initializing YankiConnect on demand...");
    try {
      ankiClientInstance = new YankiConnect();
      console.error(
        "[MCP Anki Client] YankiConnect initialized successfully on demand."
      );
    } catch (e: any) {
      console.error(
        "[MCP Anki Client] Error initializing YankiConnect on demand:",
        e.message,
        e.stack
      );
      throw e; // Re-throw to allow callers to handle or report
    }
  }
  return ankiClientInstance;
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
registerResourceHandlers(server, getAnkiClient);

// Register tool handlers from tool-manager.ts
registerToolHandlers(server, getAnkiClient);

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
    console.error(
      "[MCP Anki Client] server.connect(transport) completed (this log might not be reached if server runs indefinitely)."
    );
  } catch (error) {
    console.error("[MCP Anki Client] Error during server.connect:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[MCP Anki Client] Critical error in main execution:", error);
  process.exit(1);
});
