# anki-mcp

MCP server for Anki. This server allows interaction with Anki through the Model Context Protocol (MCP). It enables users to manage flashcards, decks, and review processes programmatically.

## Features

- Manage Cards: Add new cards, update existing cards (including answering and changing ease), and find cards using Anki's search syntax.
- Manage Decks: Create new decks and retrieve a list of existing deck names.
- Review Cards: Get lists of due cards and new cards for review.
- Resource Access: Provides predefined resources to quickly access common card searches like current deck, due cards, and new cards.

## Prerequisites

- Node.js and npm installed.
- AnkiConnect plugin installed and running in Anki.

## Setup and Execution

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

3. **Run the server:**
   Once built, the server can be started. The `package.json` defines a `bin` entry, suggesting it might be intended to be run as a command-line tool. If linked globally (`npm link`), you might be able to run:

   ```bash
   anki-mcp
   ```

   Alternatively, you can run the built client directly:

   ```bash
   node build/client.js
   ```

   You can also use the MCP Inspector for development and testing:

   ```bash
   npm run inspector
   ```

## Available Tools

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
