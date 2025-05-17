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

  - Description: Create a new flashcard in Anki. Note content uses HTML.
    - Line breaks: `<br>`
    - Code: `<pre style="background-color: transparent; padding: 10px; border-radius: 5px;">`
    - Lists: `<ol>` and `<li>`
    - Bold: `<strong>`
    - Italic: `<em>`
  - Input:
    - `fields`: (object) An object where keys are field names (e.g., "Hanzi", "Pinyin") and values are their HTML content.
    - `modelName`: (string) The name of the Anki note type (model) to use.
    - `deckName`: (optional string) The name of the deck to add the card to. Defaults to the current deck or 'Default'.
    - `tags`: (optional array of strings) A list of tags to add to the note.

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

- `get_model_names`:

  - Description: Lists all available Anki note type/model names.
  - Input: None.

- `get_model_details`:

  - Description: Retrieves the fields, card templates, and CSS styling for a specified note type.
  - Input: `modelName` (string).

- `get_deck_model_info`:

  - Description: Retrieves information about the note types (models) used within a specified deck. Helps determine if a single model is used, multiple, or if the deck is empty or non-existent.
  - Input: `deckName` (string).
  - Output: An object with `deckName`, `status` (e.g., "single_model_found", "multiple_models_found", "no_notes_found", "deck_not_found"), and conditionally `modelName` (string) or `modelNames` (array of strings).

- `add_note_type_field`:

  - Description: Adds a new field to a note type.
  - Input: `modelName` (string), `fieldName` (string).

- `remove_note_type_field`:

  - Description: Removes an existing field from a note type.
  - Input: `modelName` (string), `fieldName` (string).

- `rename_note_type_field`:

  - Description: Renames a field in a note type.
  - Input: `modelName` (string), `oldFieldName` (string), `newFieldName` (string).

- `reposition_note_type_field`:

  - Description: Changes the order (index) of a field in a note type.
  - Input: `modelName` (string), `fieldName` (string), `index` (number).

- `update_note_type_templates`:

  - Description: Updates the HTML templates (e.g., front and back) for the cards of a note type.
  - Input: `modelName` (string), `templates` (object, e.g., `{"Card 1": {"Front": "html", "Back": "html"}}`).

- `update_note_type_styling`:

  - Description: Updates the CSS styling for a note type.
  - Input: `modelName` (string), `css` (string).

- `create_model`:

  - Description: Creates a new Anki note type (model).
  - Input: `modelName` (string), `fieldNames` (array of strings), `cardTemplates` (array of objects, each with `Name`, `Front`, `Back` HTML strings), `css` (optional string), `isCloze` (optional boolean, defaults to false), `modelType` (optional string, defaults to 'Standard').

- `add_bulk`:

  - Description: Adds multiple flashcards to Anki in a single operation. Note content uses HTML. This tool is for adding multiple notes (cards) at once.
  - Input: An array of `notes`, where each note object has:
    - `fields`: (object) An object where keys are field names and values are their HTML content.
    - `modelName`: (string) The name of the Anki note type (model) to use for this note.
    - `deckName`: (optional string) The name of the deck for this note. Defaults to 'Default'.
    - `tags`: (optional array of strings) A list of tags for this note.

More information can be found here [Anki Integration | Smithery](https://smithery.ai/server/@nietus/anki-mcp)
