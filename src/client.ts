#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import { getAnkiClient } from "./anki.js";
import { createServer } from "./server.js";

// Look for .env next to the project (works when launched by Claude Desktop,
// whose working directory is not the project) and in the working directory.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: [path.join(projectRoot, ".env"), path.resolve(".env")] });

async function main() {
  const server = createServer(getAnkiClient);
  await server.connect(new StdioServerTransport());
  console.error("[anki-mcp] Server running on stdio.");
}

main().catch((error) => {
  console.error("[anki-mcp] Fatal error:", error);
  process.exit(1);
});
