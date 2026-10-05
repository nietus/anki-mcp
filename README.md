# anki-mcp

[![smithery badge](https://smithery.ai/badge/@nietus/anki-mcp)](https://smithery.ai/server/@nietus/anki-mcp)

MCP server for Anki. This server allows interaction with Anki through the Model Context Protocol (MCP). It enables users to manage flashcards, decks, and review processes programmatically.

[![Watch the video](public/0521.png)](https://www.youtube.com/watch?v=NZomvkf8bio)

## Prerequisites

- Node.js and npm installed.
- AnkiConnect plugin installed and running in Anki.
- For audio features: Azure API key (set in `.env` file as `AZURE_API_KEY`). Generated audio is saved to the active profile's `collection.media` folder through AnkiConnect, so no media path needs to be configured.

## Setup and Execution

Highly recommended to run locally, since AnkiConnect only works locally.

Was only tested on windows.

### Running locally via `npx`

If you only wish to use the tool and not develop the tool,
you may launch an MCP STDIO server locally using `npx`:

```sh
npx -y github:nietus/anki-mcp
```

This can be used in Desktop MCP clients such as Msty Studio or others.

### Running locally via source code

Alternatively, you can run locally via source code using these instructions:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/nietus/anki-mcp
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Setup for Audio Features (If you want to use audio tools):**

   Create a .env file in the root directory with your Azure API key:

   ```
   AZURE_API_KEY=your_azure_api_key_here
   ```

   Generated audio files are stored in the active Anki profile's `collection.media` folder through AnkiConnect, so no media directory needs to be configured.

5. **Integrate with Cursor settings (for local execution):**

   To run your local build of anki-mcp with Cursor, you need to tell Cursor how to start the server. Below are example configurations which you can access on cursor settings. Replace YOUR_USERNAME and adjust the path if you cloned anki-mcp to a different location than Downloads.

   **Windows:**

   ```json
   "anki": {
         "command": "cmd",
         "args": [
           "/c",
           "node",
           "c:/Users/YOUR_USERNAME/Downloads/anki-mcp/build/client.js"
       ]
   }
   ```

6. **Integrate with Claude Desktop using an `.mcpb` bundle:**

   The recommended way to use this server with Claude Desktop is to install it as an MCP extension bundle (`.mcpb` file).

   1. **Build and package the extension:**

      ```bash
      npm install
      npm run build
      npm run pack:mcpb
      ```

      This will produce a file at `dist/anki-mcp.mcpb`.

   2. **Install the bundle in Claude Desktop:**

      - Open Claude Desktop.
      - Go to **Settings → Extensions**.
      - Drag and drop the `dist/anki-mcp.mcpb` file into the Extensions panel.

      Claude will handle launching the server automatically when needed.

   3. **Configure environment variables:**

      When prompted during installation, provide your `AZURE_API_KEY`. It is only required for the audio tools.

   That’s it! No manual configuration is needed—Claude Desktop will manage the server for you once the `.mcpb` bundle is installed.
   **macOS / Linux:**

 ```json
  "anki": {
        "command": "bash",
        "args": [
          "-c",
          "node /Users/YOUR_USERNAME/Downloads/anki-mcp/build/client.js"
        ]
      }
  ```

### Create a Claude Desktop extension bundle (.mcpb)

If you want one-click installation inside Claude Desktop, you can package this server as an MCP bundle:

1. Install dependencies and build the project:

   ```bash
   npm install
   npm run build
   ```

2. Generate the `.mcpb` bundle (requires the `@anthropic-ai/mcpb` CLI, which expects Node.js 18+):

   ```bash
   npm run pack:mcpb
   ```

The script stages the compiled server (`build/`), copies runtime dependencies, and produces `dist/anki-mcp.mcpb`. Drag that file into Claude Desktop's Settings → Extensions panel to install. When prompted, provide the Azure Speech API key if you want to use the audio tools.

## Configuration

All environment variables are optional. Put them in a `.env` file in the project folder or pass them through your MCP client.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AZURE_API_KEY` | – | Enables the audio tools (Azure Text-to-Speech). |
| `AZURE_REGION` | `eastus` | Azure Speech region. |
| `ANKI_CONNECT_HOST` | `http://127.0.0.1` | AnkiConnect host. |
| `ANKI_CONNECT_PORT` | `8765` | AnkiConnect port. |
| `ANKI_CONNECT_KEY` | – | AnkiConnect API key, if you set one in the add-on config. |

## Development

```bash
npm test           # unit + in-memory MCP server tests (no Anki needed)
npm run inspector  # try the tools interactively
```

## Available Tools

Every tool is annotated as read-only, write or destructive, so clients like Claude Desktop can auto-approve reads and ask before destructive changes. Errors (including "Anki is not running") come back as readable tool results.

Most bulk tools select cards or notes the same way: `deckName` (subdecks included), `tags` (matches any), `query` (any [Anki search](https://docs.ankiweb.net/searching.html), ANDed), or explicit `cardIds` / `noteIds`. Write tools accept `dryRun: true` to preview the change first.

### Studying

| Tool | What it does |
| --- | --- |
| `get_study_overview` | Today's new/learning/review counts per deck, cards reviewed today, streak, 7/30-day totals. |
| `get_due_cards` / `get_new_cards` | `num` cards to study (optionally from one `deckName`), with the interval each button would give. |
| `answer_cards` | Record answers (`cardId`, `ease` 1-4) and get each card's new interval. *(Previously `update_cards`.)* |
| `find_leeches` | Weakest cards (leech tag / many lapses), ranked by lapses and ease. |
| `get_card_history` | Full review log of up to 20 cards. |
| `get_retention_stats` | True retention (young/mature), reviews per day and time spent for a deck over N days. |
| `undo` | Undo the last action in Anki. |

### Selecting and scheduling cards

| Tool | What it does |
| --- | --- |
| `find_cards` | Paginated search (`query`, `limit`, `offset`); pick the sections to return with `include`: `question`, `answer`, `fields`, `stats`. |
| `suspend_cards` / `unsuspend_cards` | Deactivate/reactivate cards, e.g. all cards with tag X in deck Y. Scheduling is preserved. Pass a `label` when suspending (notes get the tag `paused::<label>`) and `unsuspend_cards { label }` later resumes exactly that group, leaving cards suspended for other reasons alone. |
| `move_cards` | Move cards to `targetDeck` (created if missing). |
| `reschedule_cards` | `set_due_date` (`days`: `0`, `1!`, `3-7`), `forget` (reset to new) or `relearn`. |

### Creating and editing notes

| Tool | What it does |
| --- | --- |
| `add_card` | Create one note. |
| `add_bulk` | Create many notes; duplicates/invalid notes are skipped and reported with the reason. |
| `add_cloze_cards` | Create cloze notes from text plus `terms` to hide, or text with `{{c1::...}}` markup. |
| `update_note_fields` / `bulk_update_notes` | Edit fields of existing notes. |
| `find_and_replace` | Plain or regex replace across notes, optionally limited to some `fields`. |
| `manage_tags` | `list` (with a filter: tag counts), `add`, `remove`, `rename`, `clear_unused`. |
| `add_image` | Add an image to a field from a `url`, local `path` or base64 `data`. |
| `delete_notes` | Two-step delete: the first call previews and returns a `confirmToken`, the second call (with the token) deletes. |

### Audio (requires `AZURE_API_KEY`)

| Tool | What it does |
| --- | --- |
| `add_card_with_audio` | Create a note with audio generated from `sourceField` into `audioField`. |
| `update_card_with_audio` | Generate audio for one existing note. |
| `bulk_generate_audio` | Generate audio for many notes (by default only those with an empty audio field), `limit` per call. |

Supported languages: en, es, fr, de, it, ja, ko, pt, pt-PT, ru, zh, ar, nl, hi, tr, pl, sv, fi, da, no, cs, hu, el, he, th, vi, id, ms, ro.

### Decks and note types

| Tool | What it does |
| --- | --- |
| `get_deck_names` / `create_deck` | List or create decks. |
| `get_deck_model_info` | Which note types a deck uses (call before adding cards to it). |
| `get_model_names` / `get_model_details` | List note types / fields, templates and CSS of one. |
| `edit_note_type_field` | `add`, `remove`, `rename` or `reposition` a field. |
| `update_note_type_templates` / `update_note_type_styling` | Replace templates or CSS. |
| `create_model` | Create a note type. |
| `sync` | Sync with AnkiWeb. |

## Prompts

| Prompt | What it does |
| --- | --- |
| `quiz_me` | Study session: one question at a time, graded and recorded in Anki. |
| `make_cards` | Turn a text into atomic flashcards (previewed before adding). |
| `leech_review` | Find the cards you keep forgetting and fix them. |

## Resources

- `anki://collection/overview` – study overview.
- `anki://search/isdue`, `anki://search/isnew`, `anki://search/deckcurrent` – up to 50 cards each.
- `anki://deck/{deckName}/overview` – due counts for one deck.
- `anki://model/{modelName}` – fields, templates and CSS of a note type.

More information can be found here [Anki Integration | Smithery](https://smithery.ai/server/@nietus/anki-mcp)
