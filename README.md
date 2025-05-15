# anki-mcp

[![smithery badge](https://smithery.ai/badge/@nietus/anki-mcp)](https://smithery.ai/server/@nietus/anki-mcp)

MCP server for Anki. This server allows interaction with Anki through the Model Context Protocol (MCP). It enables users to manage flashcards, decks, and review processes programmatically.

## Prerequisites

- Node.js and npm installed.
- AnkiConnect plugin installed and running in Anki.

## Setup and Execution

Highly recommended to run locally, since anki connect only works locally

### To run locally:

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Build the project:**
   The `prepare` script in `package.json` should automatically run the build upon installation. If you need to build manually:

   ```bash
   npm run build
   ```

   This command compiles the TypeScript code and makes the client script executable.

3. **Integrate with Cursor settings for Windows**

   ```
   "anki": {
         "command": "cmd",
         "args": [
           "/c",
           "node",
           "c:/Users/-/Downloads/anki-mcp/build/client.js"
         ]
       }
   ```

## Available Tools

To debug the tools, use

```
npm run inspector
```

The server provides the following tools for interacting with Anki:

- `update_cards`:

  - Description: After the user answers cards you've quizzed them on, use this tool to mark them answered and update their ease.
  - Input: An array of answers, each with `cardId` (number) and `ease` (number, 1-4).

- `add_card`:

  - Description: Create a new flashcard in Anki. Must use HTML formatting.
    - Line breaks: `<br>`
    - Code: `<pre style="background-color: transparent; padding: 10px; border-radius: 5px;">`
    - Lists: `<ol>` and `<li>`
    - Bold: `<strong>`
    - Italic: `<em>`
  - Input: `front` (string, HTML), `back` (string, HTML), `deckName` (optional string, defaults to 'Default').

- `get_due_cards`:

  - Description: Returns a given number of cards due for review.
  - Input: `num` (number).

- `get_new_cards`:

  - Description: Returns a given number of new and unseen cards.
  - Input: `num` (number).

- `get-deck-names`:

  - Description: Get a list of all Anki deck names.
  - Input: None.

- `find-cards`:

  - Description: Find cards using a raw Anki search query. Returns detailed card information including fields.
  - Input: `query` (string, e.g., `'deck:Default -tag:test'`, or `'"deck:My Deck" tag:important'`). To filter for empty fields, use `'-FieldName:_*'` (e.g., `'-Hanzi:_*'`).

- `update-note-fields`:

  - Description: Update specific fields of a given Anki note.
  - Input: `noteId` (number), `fields` (object, e.g., `{"Front": "New Q", "Back": "New A"}`).

- `create_deck`:

  - Description: Create a new Anki deck.
  - Input: `deckName` (string).

- `bulk_update_notes`:

  - Description: Update specific fields for multiple Anki notes.
  - Input: An array of `notes`, where each note has `noteId` (number) and `fields` (object).

More information can be found here [Anki Integration | Smithery](https://smithery.ai/server/@nietus/anki-mcp)
