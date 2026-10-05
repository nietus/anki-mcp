import { YankiConnect } from "yanki-connect";

// Read lazily: .env is loaded after the ES module graph is imported.
function connectionSettings() {
  return {
    host: process.env.ANKI_CONNECT_HOST || "http://127.0.0.1",
    port: Number(process.env.ANKI_CONNECT_PORT) || 8765,
    key: process.env.ANKI_CONNECT_KEY || undefined,
  };
}

export function ankiConnectUrl(): string {
  const { host, port } = connectionSettings();
  return `${host}:${port}`;
}

let clientInstance: YankiConnect | null = null;

/** Lazily creates the AnkiConnect client, so the server starts even if Anki is closed. */
export function getAnkiClient(): YankiConnect {
  if (!clientInstance) {
    clientInstance = new YankiConnect(connectionSettings());
  }
  return clientInstance;
}

/**
 * Turns low-level errors into messages the agent can act on, most importantly
 * "Anki is not running" instead of a raw fetch stack trace.
 */
export function describeError(error: unknown): string {
  const err = error as { message?: string; cause?: { code?: string } };
  const message = err?.message ?? String(error);
  const code = err?.cause?.code;

  if (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    /fetch failed|ECONNREFUSED/i.test(message)
  ) {
    return `Could not reach AnkiConnect at ${ankiConnectUrl()}. Ask the user to open Anki and make sure the AnkiConnect add-on (code 2055492159) is installed and enabled.`;
  }
  if (/collection is not available/i.test(message)) {
    return "Anki is open but no profile is loaded. Ask the user to open a profile in Anki and try again.";
  }
  if (/unsupported action/i.test(message)) {
    return `${message}. The installed AnkiConnect add-on is probably outdated; ask the user to update it.`;
  }
  return message;
}
