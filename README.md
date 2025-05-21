# anki-mcp

[![smithery badge](https://smithery.ai/badge/@nietus/anki-mcp)](https://smithery.ai/server/@nietus/anki-mcp)

MCP server for Anki. This server allows interaction with Anki through the Model Context Protocol (MCP). It enables users to manage flashcards, decks, and review processes programmatically.

<video src="public/0521.mp4" controls width="100%"></video>

## Prerequisites

- Node.js and npm installed.
- AnkiConnect plugin installed and running in Anki.
- For audio features: Azure API key (set in `.env` file as `AZURE_API_KEY`).

## Setup and Execution

Highly recommended to run locally, since AnkiConnect only works locally

### To run locally:

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

   Create a .env file in the root directory with your Azure API key and Anki media directory:

   ```
   AZURE_API_KEY=your_azure_api_key_here
   ANKI_MEDIA_DIR=path/to/your/anki/media/directory
   ```
   
   For Anki media directory, use the path to your Anki collection.media folder. This is where audio files will be stored. If you have trouble, paste it directly into the code.
   
   - Windows example: `C:\Users\username\AppData\Roaming\Anki2\User 1\collection.media`
   - macOS example: `/Users/username/Library/Application Support/Anki2/User 1/collection.media`
   - Linux example: `/home/username/.local/share/Anki2/User 1/collection.media`
   
   **Note:** The ANKI_MEDIA_DIR is required for audio generation to work properly as Anki needs to find the audio files in its media collection.

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

  - Description: Create a NEW flashcard in Anki. Use ONLY for creating new cards, NOT for updating existing ones (will throw an error if the card already exists). For updating existing cards, use `update_note_fields` with the noteId instead. Note content uses HTML.
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

- `add_card_with_audio`:

  - Description: Create a NEW flashcard in Anki with automatically generated audio from Azure TTS. Use ONLY for creating new cards, NOT for updating existing ones (will throw an error if the card already exists). For updating audio on existing cards, use `update_card_with_audio` with the noteId instead.
  - Input:
    - `fields`, `modelName`, `deckName`, `tags`: Same as `add_card`.
    - `sourceField`: (string) Field name containing the text to generate audio from.
    - `audioField`: (string) Field name where the generated audio will be stored.
    - `language`: (optional string) Language code for TTS (e.g., 'en', 'es', 'fr'). Defaults to 'en'.
  - Supported languages: en, es, fr, de, it, ja, ko, pt, ru, zh, ar, nl, hi, tr, pl, sv, fi, da, no, cs, hu, el, he, th, vi, id, ms, ro.

- `update_card_with_audio`:

  - Description: Update an EXISTING card by generating audio from a specified field and adding it to an audio field. Use ONLY for cards that already exist (you must have the noteId). For creating new cards with audio, use `add_card_with_audio` instead.
  - Input:
    - `noteId`: (number) The ID of the Anki note to update.
    - `sourceField`: (string) Field name containing the text to generate audio from.
    - `audioField`: (string) Field name where the generated audio will be stored.
    - `language`: (optional string) Language code for TTS. Defaults to 'en'.

- `get_due_cards`:

  - Description: Returns a given number of cards due for review.
  - Input: `num` (number).

- `get_new_cards`:

  - Description: Returns a given number of new and unseen cards.
  - Input: `num` (number).

- `get_deck_names`:

  - Description: Get a list of all Anki deck names.
  - Input: None.

- `find_cards`:

  - Description: Find cards using a raw Anki search query. Returns detailed card information including fields.
  - Input: `query` (string, e.g., `'deck:Default -tag:test'`, or `'"deck:My Deck" tag:important'`). To filter for empty fields, use `'-FieldName:_*'` (e.g., `'-Hanzi:_*'`).

- `update_note_fields`:

  - Description: Update specific fields of an EXISTING Anki note. Use ONLY when you already have the noteId of an existing card. For creating new cards, use `add_card` instead.
  - Input: `noteId` (number), `fields` (object, e.g., `{"Front": "New Q", "Back": "New A"}`).

- `create_deck`:

  - Description: Create a new Anki deck.
  - Input: `deckName` (string).

- `bulk_update_notes`:

  - Description: **RECOMMENDED FOR MULTIPLE CARDS**: Update specific fields for multiple EXISTING Anki notes in a single operation. Much more efficient than updating cards one by one. Use ONLY when you have noteIds for cards that already exist. For creating new cards in bulk, use `add_bulk` instead. Always complete all updates in a single operation whenever possible.
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

  - Description: **RECOMMENDED FOR MULTIPLE CARDS**: Adds multiple NEW flashcards to Anki in a single operation. Much more efficient than adding cards one by one. Use ONLY for creating new cards, NOT for updating existing ones (will throw errors for any cards that already exist). For updating existing cards, use `bulk_update_notes` with noteIds instead. Always complete all additions in a single operation whenever possible. Must use HTML formatting for card content.
  - Input: An array of `notes`, where each note object has:
    - `fields`: (object) An object where keys are field names and values are their HTML content.
    - `modelName`: (string) The name of the Anki note type (model) to use for this note.
    - `deckName`: (optional string) The name of the deck for this note. Defaults to 'Default'.
    - `tags`: (optional array of strings) A list of tags for this note.

More information can be found here [Anki Integration | Smithery](https://smithery.ai/server/@nietus/anki-mcp)
