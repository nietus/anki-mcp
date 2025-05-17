import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { YankiConnect } from "yanki-connect";
import { Card } from "./interfaces.js";
import { cleanWithRegex } from "./utils.js";

function getToolDefinitions() {
  return [
    {
      name: "update_cards",
      description: "After the user answers cards you've quizzed them on, use this tool to mark them answered and update their ease",
      inputSchema: {
        type: "object",
        properties: {
          answers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                cardId: {
                  type: "number",
                  description: "Id of the card to answer"
                },
                ease: {
                  type: "number",
                  description: "Ease of the card between 1 (Again) and 4 (Easy)"
                }
              }
            }
          }
        },
      }
    },
    {
      name: "add_card",
      description: "Create a new flashcard in Anki for the user. Must use HTML formatting only. IMPORTANT FORMATTING RULES:\n1. Must use HTML tags for ALL formatting - NO markdown\n2. Use <br> for ALL line breaks\n3. For code blocks, use <pre> with inline CSS styling\n4. Example formatting:\n   - Line breaks: <br>\n   - Code: <pre style=\"background-color: transparent; padding: 10px; border-radius: 5px;\">\n   - Lists: <ol> and <li> tags\n   - Bold: <strong>\n   - Italic: <em>",
      inputSchema: {
        type: "object",
        properties: {
          fields: {
            type: "object",
            description: "An object where keys are field names and values are their content (e.g., {\"Hanzi\": \"你好\", \"Pinyin\": \"Nǐ hǎo\"}). Field names must match the target model.",
            additionalProperties: { type: "string" },
            minProperties: 1 // Ensure at least one field is provided
          },
          deckName: {
            type: "string",
            description: "Optional: The name of the deck to add the card to. Defaults to the current deck or 'Default'."
          },
          modelName: {
            type: "string",
            description: "The name of the Anki note type (model) to use."
          },
          tags: {
            type: "array",
            description: "Optional: A list of tags to add to the note.",
            items: {
              type: "string"
            }
          }
        },
        required: ["fields", "modelName"]
      }
    },
    {
      name: "get_due_cards",
      description: "Returns a given number (num) of cards due for review.",
      inputSchema: {
        type: "object",
        properties: {
          num: {
            type: "number",
            description: "Number of due cards to get"
          }
        },
        required: ["num"]
      },
    },
    {
      name: "get_new_cards",
      description: "Returns a given number (num) of new and unseen cards.",
      inputSchema: {
        type: "object",
        properties: {
          num: {
            type: "number",
            description: "Number of new cards to get"
          }
        },
        required: ["num"]
      },
    },
    {
      name: "get-deck-names",
      description: "Get a list of all Anki deck names.",
      inputSchema: {
        type: "object",
        properties: {},
      }
    },
    {
      name: "find-cards",
      description: "Find cards using a raw Anki search query. Returns detailed card information including fields.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Anki search query string (e.g., 'deck:Default -tag:test'). If a deck name or field contains spaces, it should be enclosed in double quotes (e.g., '\"deck:My Deck\" tag:important'). To filter for empty fields, use '-FieldName:_*' (e.g., '-Hanzi:_*')."
          }
        },
        required: ["query"]
      }
    },
    {
      name: "update-note-fields",
      description: "Update specific fields of a given Anki note.",
      inputSchema: {
        type: "object",
        properties: {
          noteId: {
            type: "number",
            description: "The ID of the Anki note to update."
          },
          fields: {
            type: "object",
            description: "An object where keys are field names and values are the new field content (e.g., {\"Front\": \"New Q\", \"Back\": \"New A\"})",
            additionalProperties: { type: "string" } 
          }
        },
        required: ["noteId", "fields"]
      }
    },
    {
      name: "create_deck",
      description: "Create a new Anki deck.",
      inputSchema: {
        type: "object",
        properties: {
          deckName: {
            type: "string",
            description: "The name of the deck to create."
          }
        },
        required: ["deckName"]
      }
    },
    {
      name: "bulk_update_notes",
      description: "Update specific fields for multiple Anki notes.",
      inputSchema: {
        type: "object",
        properties: {
          notes: {
            type: "array",
            description: "An array of notes to update. Each note should have a noteId and a fields object.",
            items: {
              type: "object",
              properties: {
                noteId: {
                  type: "number",
                  description: "The ID of the Anki note to update."
                },
                fields: {
                  type: "object",
                  description: "An object where keys are field names and values are the new field content.",
                  additionalProperties: { type: "string" }
                }
              },
              required: ["noteId", "fields"]
            }
          }
        },
        required: ["notes"]
      }
    },
    {
      name: "get_model_names",
      description: "Lists all available Anki note type/model names.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "get_model_details",
      description: "Retrieves the fields, card templates, and CSS styling for a specified note type.",
      inputSchema: {
        type: "object",
        properties: {
          modelName: {
            type: "string",
            description: "The name of the note type."
          }
        },
        required: ["modelName"]
      }
    },
    {
      name: "add_note_type_field",
      description: "Adds a new field to a note type.",
      inputSchema: {
        type: "object",
        properties: {
          modelName: {
            type: "string",
            description: "The name of the note type."
          },
          fieldName: {
            type: "string",
            description: "The name of the new field."
          }
        },
        required: ["modelName", "fieldName"]
      }
    },
    {
      name: "remove_note_type_field",
      description: "Removes an existing field from a note type.",
      inputSchema: {
        type: "object",
        properties: {
          modelName: {
            type: "string",
            description: "The name of the note type."
          },
          fieldName: {
            type: "string",
            description: "The name of the field to remove."
          }
        },
        required: ["modelName", "fieldName"]
      }
    },
    {
      name: "rename_note_type_field",
      description: "Renames a field in a note type.",
      inputSchema: {
        type: "object",
        properties: {
          modelName: {
            type: "string",
            description: "The name of the note type."
          },
          oldFieldName: {
            type: "string",
            description: "The current name of the field."
          },
          newFieldName: {
            type: "string",
            description: "The new name for the field."
          }
        },
        required: ["modelName", "oldFieldName", "newFieldName"]
      }
    },
    {
      name: "reposition_note_type_field",
      description: "Changes the order (index) of a field in a note type.",
      inputSchema: {
        type: "object",
        properties: {
          modelName: {
            type: "string",
            description: "The name of the note type."
          },
          fieldName: {
            type: "string",
            description: "The name of the field to reposition."
          },
          index: {
            type: "number",
            description: "The new 0-based index for the field."
          }
        },
        required: ["modelName", "fieldName", "index"]
      }
    },
    {
      name: "update_note_type_templates",
      description: "Updates the HTML templates (e.g., front and back) for the cards of a note type.",
      inputSchema: {
        type: "object",
        properties: {
          modelName: {
            type: "string",
            description: "The name of the note type."
          },
          templates: {
            type: "object",
            description: "An object where keys are template names (e.g., \"Card 1\") and values are objects with \"Front\" and \"Back\" HTML content.",
            additionalProperties: {
              type: "object",
              properties: {
                Front: { type: "string" },
                Back: { type: "string" }
              },
              required: ["Front", "Back"]
            }
          }
        },
        required: ["modelName", "templates"]
      }
    },
    {
      name: "update_note_type_styling",
      description: "Updates the CSS styling for a note type.",
      inputSchema: {
        type: "object",
        properties: {
          modelName: {
            type: "string",
            description: "The name of the note type."
          },
          css: {
            type: "string",
            description: "The new CSS styling."
          }
        },
        required: ["modelName", "css"]
      }
    },
    {
      name: "create_model",
      description: "Creates a new Anki note type (model).",
      inputSchema: {
        type: "object",
        properties: {
          modelName: {
            type: "string",
            description: "The name for the new note type."
          },
          fieldNames: {
            type: "array",
            items: { type: "string" },
            description: "List of field names for the new model."
          },
          cardTemplates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                Name: { type: "string" },
                Front: { type: "string" },
                Back: { type: "string" }
              },
              required: ["Name", "Front", "Back"]
            },
            description: "Each object defining a card template with Name, Front, and Back HTML."
          },
          css: {
            type: "string",
            description: "CSS styling for the model."
          },
          isCloze: {
            type: "boolean",
            description: "Whether this model is a cloze deletion type. Defaults to false."
          },
          modelType: {
            type: "string",
            description: "Type of model (e.g., 'Standard', 'Cloze'). Defaults to 'Standard'."
          }
        },
        required: ["modelName", "fieldNames", "cardTemplates"]
      }
    },
    {
      name: "add_bulk",
      description: "Adds multiple flashcards to Anki in a single operation. Must use HTML formatting for card content. This tool is for adding multiple notes (cards) at once.",
      inputSchema: {
        type: "object",
        properties: {
          notes: {
            type: "array",
            description: "An array of notes to add.",
            items: {
              type: "object",
              properties: {
                fields: {
                  type: "object",
                  description: "An object where keys are field names and values are their content. Field names must match the target model.",
                  additionalProperties: { type: "string" },
                  minProperties: 1
                },
                deckName: {
                  type: "string",
                  description: "Optional: The name of the deck to add the card to. Defaults to the current deck or 'Default'."
                },
                modelName: {
                  type: "string",
                  description: "The name of the Anki note type (model) to use."
                },
                tags: {
                  type: "array",
                  description: "Optional: A list of tags to add to the note.",
                  items: {
                    type: "string"
                  }
                }
              },
              required: ["fields", "modelName"]
            }
          }
        },
        required: ["notes"]
      }
    }
  ];
}

const getDeckModelInfoToolDefinition = {
  name: "get_deck_model_info",
  description: "Retrieves information about the note types (models) used within a specified deck. Helps determine if a single model is used, multiple, or if the deck is empty.",
  inputSchema: {
    type: "object",
    properties: {
      deckName: {
        type: "string",
        description: "The name of the deck to inspect."
      }
    },
    required: ["deckName"]
  }
};

export function registerToolHandlers(server: Server, client: YankiConnect) {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [...getToolDefinitions(), getDeckModelInfoToolDefinition];
    return { tools: tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error(`No arguments provided for tool: ${name}`);
    }

    switch (name) {
      case "update_cards": {
        const answers = args.answers as { cardId: number; ease: number }[];
        const result = await client.card.answerCards({ answers: answers });

        const successfulCards = answers
          .filter((_, index) => result[index])
          .map(card => card.cardId);
        const failedCards = answers.filter((_, index) => !result[index]);

        if (failedCards.length > 0) {
          const failedCardIds = failedCards.map(card => card.cardId);
          throw new Error(`Failed to update cards with IDs: ${failedCardIds.join(', ')}`);
        }

        return {
          content: [{
            type: "text",
            text: `Updated cards ${successfulCards.join(", ")}`
          }]
        };
      }

      case "add_card": {
        const fields = args.fields as { [key: string]: string };
        const modelName = String(args.modelName);
        const deckName = args.deckName ? String(args.deckName) : 'Default'; // Or fetch current deck if possible
        const tags = args.tags as string[] || [];

        if (!fields || Object.keys(fields).length === 0) {
          throw new Error("The 'fields' argument cannot be empty.");
        }
        if (!modelName) {
          throw new Error("The 'modelName' argument is required.");
        }

        const notePayload = {
          note: {
            deckName: deckName,
            modelName: modelName,
            fields: fields,
            tags: tags,
            options: {
              allowDuplicate: false // Default Anki behavior, can be made configurable
            }
          },
        };

        const result = await client.note.addNote(notePayload);
        if (result === null || result === 0) {
            throw new Error (`Failed to create note. AnkiConnect returned: ${result === null ? 'null (possibly duplicate or invalid model/fields)' : '0 (unknown error)'}`);
        }
        const noteId = result;
        // Finding the card ID immediately might be complex if multiple cards are generated per note.
        // For simplicity, returning noteId first. Or, if only one card is typical, query `nid:${noteId}`.
        // const cardIds = await client.card.findCards({ query: `nid:${noteId}` });

        return {
          content: [{
            type: "text",
            text: `Created note with id ${noteId}.` // Changed to noteId for clarity
          }]
        };
      }

      case "get_due_cards": {
        const ankiQuery = "is:due";
        let allCardIds = await client.card.findCards({ query: ankiQuery });
        if (allCardIds.length > 200) allCardIds = allCardIds.slice(0, 200);
        const cardsData = await client.card.cardsInfo({ cards: allCardIds });
        const mappedCards: Card[] = cardsData.map((card: any) => ({
          cardId: card.cardId,
          question: cleanWithRegex(card.question),
          answer: cleanWithRegex(card.answer),
          due: card.due
        })).sort((a: Card, b: Card) => a.due - b.due);

        return {
          content: [{ type: "text", text: JSON.stringify(mappedCards) }]
        };
      }

      case "get_new_cards": {
        const ankiQuery = "is:new";
        let allCardIds = await client.card.findCards({ query: ankiQuery });
        if (allCardIds.length > 200) allCardIds = allCardIds.slice(0, 200);
        const cardsData = await client.card.cardsInfo({ cards: allCardIds });
        const mappedCards: Card[] = cardsData.map((card: any) => ({
          cardId: card.cardId,
          question: cleanWithRegex(card.question),
          answer: cleanWithRegex(card.answer),
          due: card.due
        })).sort((a: Card, b: Card) => a.due - b.due);
        
        return {
          content: [{ type: "text", text: JSON.stringify(mappedCards) }]
        };
      }

      case "get-deck-names": {
        const deckNames = await client.deck.deckNames();
        return {
          content: [{ type: "text", text: JSON.stringify(deckNames) }]
        };
      }

      case "find-cards": {
        const query = String(args.query);
        if (!query) {
          console.error("[MCP Anki Client] find-cards: Query parameter is required.");
          throw new Error("Query parameter is required for find-cards tool.");
        }
        console.error(`[MCP Anki Client] find-cards: Raw query: "${query}"`);
        let allCardIds = await client.card.findCards({ query });
        console.error(`[MCP Anki Client] find-cards: Found ${allCardIds.length} total card IDs for query "${query}".`);
        if (allCardIds.length === 0) {
          return { content: [{ type: "text", text: JSON.stringify([]) }] };
        }
        if (allCardIds.length > 200) {
          console.warn(`[MCP Anki Client] find-cards: Query "${query}" returned ${allCardIds.length} cards. Limiting to 200.`);
          allCardIds = allCardIds.slice(0, 200);
        }
        const cardsInfoRaw = await client.card.cardsInfo({ cards: allCardIds });
        console.error(`[MCP Anki Client] find-cards: Fetched info for ${cardsInfoRaw.length} cards.`);
        const detailedCardsInfo = cardsInfoRaw.map(card => ({
          cardId: card.cardId,
          noteId: card.note,
          deckName: card.deckName,
          modelName: card.modelName,
          question: cleanWithRegex(card.question),
          answer: cleanWithRegex(card.answer),
          due: card.due,
          sfld: cleanWithRegex((card as any).sfld || ""), 
          fields: Object.fromEntries(
            Object.entries(card.fields).map(([fieldName, fieldData]: [string, any]) => [
              fieldName, 
              cleanWithRegex(fieldData.value)
            ])
          )
        }));
        detailedCardsInfo.sort((a, b) => a.sfld.localeCompare(b.sfld));
        return {
          content: [{ type: "text", text: JSON.stringify(detailedCardsInfo) }]
        };
      }

      case "update-note-fields": {
        const noteId = Number(args.noteId);
        const fieldsToUpdate = args.fields as Record<string, string>;
        if (isNaN(noteId)) {
          throw new Error("Invalid noteId provided.");
        }
        if (!fieldsToUpdate || Object.keys(fieldsToUpdate).length === 0) {
          throw new Error("Fields to update cannot be empty.");
        }
        await client.note.updateNoteFields({
          note: {
            id: noteId,
            fields: fieldsToUpdate,
          },
        });
        return {
          content: [{ type: "text", text: `Successfully requested update for fields of note ID: ${noteId}` }]
        };
      }

      case "create_deck": {
        const deckName = String(args.deckName);
        if (!deckName) {
          throw new Error("deckName parameter is required for create_deck tool.");
        }
        await client.deck.createDeck({ deck: deckName });
        return {
          content: [{ type: "text", text: `Successfully created deck: ${deckName}` }]
        };
      }

      case "bulk_update_notes": {
        const notesToUpdate = args.notes as { noteId: number; fields: Record<string, string> }[];
        if (!notesToUpdate || !Array.isArray(notesToUpdate) || notesToUpdate.length === 0) {
          throw new Error("Invalid or empty 'notes' array provided for bulk_update_notes tool.");
        }
        const results: { noteId: number; success: boolean; error?: string }[] = [];
        for (const note of notesToUpdate) {
          if (isNaN(note.noteId) || !note.fields || Object.keys(note.fields).length === 0) {
            results.push({ noteId: note.noteId, success: false, error: "Invalid noteId or empty fields for a note." });
            continue;
          }
          try {
            await client.note.updateNoteFields({
              note: {
                id: note.noteId,
                fields: note.fields,
              },
            });
            results.push({ noteId: note.noteId, success: true });
          } catch (e: any) {
            results.push({ noteId: note.noteId, success: false, error: e.message });
          }
        }
        const successfulUpdates = results.filter(r => r.success).map(r => r.noteId);
        const failedUpdates = results.filter(r => !r.success);
        let summary = `Bulk update process completed. Successfully updated notes: ${successfulUpdates.join(', ') || 'None'}.`;
        if (failedUpdates.length > 0) {
          summary += ` Failed updates: ${failedUpdates.map(f => `ID ${f.noteId} (Error: ${f.error})`).join('; ')}.`;
        }
        return { content: [{ type: "text", text: summary }] };
      }

      case "get_model_names": {
        const modelNames = await client.model.modelNames();
        return { content: [{ type: "text", text: JSON.stringify(modelNames) }] };
      }

      case "get_model_details": {
        const modelName = String(args.modelName);
        if (!modelName) throw new Error("modelName parameter is required.");
        const fieldNames = await client.model.modelFieldNames({ modelName });
        const templates = await client.model.modelTemplates({ modelName });
        const css = await client.model.modelStyling({ modelName });
        return { content: [{ type: "text", text: JSON.stringify({ modelName, fieldNames, templates, css }) }] };
      }

      case "add_note_type_field": {
        const modelName = String(args.modelName);
        const fieldName = String(args.fieldName);
        if (!modelName || !fieldName) throw new Error("modelName and fieldName parameters are required.");
        const currentFields = await client.model.modelFieldNames({ modelName });
        if (currentFields.includes(fieldName)) {
          throw new Error(`Field '${fieldName}' already exists in model '${modelName}'.`);
        }
        const updatedFields = [...currentFields, fieldName].map((name, index) => ({ name, ord: index }));
        await (client.model as any).updateModelFields({ model: { name: modelName, fields: updatedFields } });
        return { content: [{ type: "text", text: `Successfully added field '${fieldName}' to model '${modelName}'.` }] };
      }

      case "remove_note_type_field": {
        const modelName = String(args.modelName);
        const fieldName = String(args.fieldName);
        if (!modelName || !fieldName) throw new Error("modelName and fieldName parameters are required.");
        const currentFields = await client.model.modelFieldNames({ modelName });
        if (!currentFields.includes(fieldName)) {
          throw new Error(`Field '${fieldName}' does not exist in model '${modelName}'.`);
        }
        const updatedFields = currentFields
          .filter(name => name !== fieldName)
          .map((name, index) => ({ name, ord: index }));
        await (client.model as any).updateModelFields({ model: { name: modelName, fields: updatedFields } });
        return { content: [{ type: "text", text: `Successfully removed field '${fieldName}' from model '${modelName}'.` }] };
      }

      case "rename_note_type_field": {
        const modelName = String(args.modelName);
        const oldFieldName = String(args.oldFieldName);
        const newFieldName = String(args.newFieldName);
        if (!modelName || !oldFieldName || !newFieldName) {
          throw new Error("modelName, oldFieldName, and newFieldName parameters are required.");
        }
        const currentFields = await client.model.modelFieldNames({ modelName });
        if (!currentFields.includes(oldFieldName)) {
          throw new Error(`Field '${oldFieldName}' does not exist in model '${modelName}'.`);
        }
        if (currentFields.includes(newFieldName) && oldFieldName !== newFieldName) {
          throw new Error(`Field '${newFieldName}' already exists in model '${modelName}'. Cannot rename.`);
        }
        const updatedFields = currentFields.map((name, index) => ({
          name: name === oldFieldName ? newFieldName : name,
          ord: index
        }));
        await (client.model as any).updateModelFields({ model: { name: modelName, fields: updatedFields } });
        return { content: [{ type: "text", text: `Successfully renamed field '${oldFieldName}' to '${newFieldName}' in model '${modelName}'.` }] };
      }

      case "reposition_note_type_field": {
        const modelName = String(args.modelName);
        const fieldName = String(args.fieldName);
        const newIndex = Number(args.index);
        if (!modelName || !fieldName || isNaN(newIndex)) {
          throw new Error("modelName, fieldName, and a valid index parameters are required.");
        }
        let currentFields = await client.model.modelFieldNames({ modelName });
        if (!currentFields.includes(fieldName)) {
          throw new Error(`Field '${fieldName}' does not exist in model '${modelName}'.`);
        }
        if (newIndex < 0 || newIndex >= currentFields.length) {
          throw new Error(`Index ${newIndex} is out of bounds for model '${modelName}'. Valid range is 0 to ${currentFields.length - 1}.`);
        }
        currentFields = currentFields.filter(f => f !== fieldName);
        currentFields.splice(newIndex, 0, fieldName);
        const updatedFields = currentFields.map((name, idx) => ({ name, ord: idx }));
        await (client.model as any).updateModelFields({ model: { name: modelName, fields: updatedFields } });
        return { content: [{ type: "text", text: `Successfully repositioned field '${fieldName}' to index ${newIndex} in model '${modelName}'.` }] };
      }

      case "update_note_type_templates": {
        const modelName = String(args.modelName);
        const templates = args.templates as Record<string, { Front: string; Back: string }>;
        if (!modelName || !templates) throw new Error("modelName and templates parameters are required.");
        await client.model.updateModelTemplates({ model: { name: modelName, templates: templates } });
        return { content: [{ type: "text", text: `Successfully updated templates for model '${modelName}'.` }] };
      }

      case "update_note_type_styling": {
        const modelName = String(args.modelName);
        const css = String(args.css);
        if (!modelName || css === undefined) throw new Error("modelName and css parameters are required.");
        await client.model.updateModelStyling({ model: { name: modelName, css: css } });
        return { content: [{ type: "text", text: `Successfully updated styling for model '${modelName}'.` }] };
      }
      
      case "create_model": {
        const modelName = String(args.modelName);
        const fieldNames = args.fieldNames as string[];
        const cardTemplates = args.cardTemplates as { Name: string; Front: string; Back: string }[];
        const css = args.css ? String(args.css) : "";
        const isCloze = typeof args.isCloze === 'boolean' ? args.isCloze : false;
        if (!modelName || !fieldNames || fieldNames.length === 0 || !cardTemplates || cardTemplates.length === 0) {
          throw new Error("modelName, fieldNames (non-empty), and cardTemplates (non-empty) are required.");
        }
        await client.model.createModel({
          modelName: modelName,
          inOrderFields: fieldNames,
          css: css,
          isCloze: isCloze,
          cardTemplates: cardTemplates.map(ct => ({
            Name: ct.Name,
            Front: ct.Front,
            Back: ct.Back
          }))
        });
        return { content: [{ type: "text", text: `Successfully created model '${modelName}'.` }] };
      }

      case "add_bulk": {
        const notesInput = args.notes as {
          fields: { [key: string]: string };
          modelName: string;
          deckName?: string;
          tags?: string[];
        }[] | undefined;

        if (!notesInput || !Array.isArray(notesInput) || notesInput.length === 0) {
          throw new Error("Invalid or empty 'notes' array provided for add_bulk tool.");
        }

        const notesPayload = notesInput.map(noteArg => {
          if (!noteArg.fields || Object.keys(noteArg.fields).length === 0) {
            throw new Error(`A note in the 'notes' array is missing 'fields' or has empty 'fields'. Validation failed for note: ${JSON.stringify(noteArg)}`);
          }
          if (!noteArg.modelName) {
            throw new Error(`A note in the 'notes' array is missing 'modelName'. Validation failed for note: ${JSON.stringify(noteArg)}`);
          }
          return {
            deckName: noteArg.deckName || 'Default',
            modelName: noteArg.modelName,
            fields: noteArg.fields,
            tags: noteArg.tags || [],
            options: {
              allowDuplicate: false
            }
          };
        });

        const ankiResults = await client.note.addNotes({ notes: notesPayload }) as (number | null)[] | null;

        const successfulIds: number[] = [];
        const errors: string[] = [];

        if (ankiResults === null) {
          throw new Error("Failed to add notes. The entire batch operation returned null. This might indicate a problem with AnkiConnect or the request structure.");
        }

        ankiResults.forEach((noteId: number | null, index: number) => {
          if (noteId !== null && noteId !== 0) {
            successfulIds.push(noteId);
          } else {
            const failedNotePayload = notesPayload[index];
            const firstFieldKey = Object.keys(failedNotePayload.fields)[0] || '[No Fields]';
            const firstFieldValue = failedNotePayload.fields[firstFieldKey] || '[N/A]';
            const failureReason = noteId === null ? "null (e.g., duplicate, invalid model/fields for note)" : "0 (unknown error for note)";
            errors.push(
              `Note ${index + 1} (Model: '${failedNotePayload.modelName}', Deck: '${failedNotePayload.deckName}', First Field ('${firstFieldKey}'): '${firstFieldValue.substring(0, 20)}...') failed. Reason: ${failureReason}`
            );
          }
        });

        let responseText = `Bulk add operation finished. Successfully added ${successfulIds.length} of ${notesInput.length} notes. IDs: ${successfulIds.join(', ') || 'None'}.`;
        if (errors.length > 0) {
          responseText += `\nErrors encountered for ${errors.length} notes:\n- ${errors.join('\n- ')}`;
        }

        return {
          content: [{
            type: "text",
            text: responseText
          }]
        };
      }

      case "get_deck_model_info": {
        const deckName = String(args.deckName);
        if (!deckName) {
          throw new Error("deckName parameter is required for get_deck_model_info tool.");
        }

        const allDeckNames = await client.deck.deckNames();
        if (!allDeckNames.includes(deckName)) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ 
                deckName: deckName,
                status: "deck_not_found"
              })
            }]
          };
        }

        const cardIdsInDeck = await client.card.findCards({ query: `deck:"${deckName}"` });

        if (cardIdsInDeck.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ 
                deckName: deckName,
                status: "no_notes_found" 
              })
            }]
          };
        }
        
        const sampleCardIds = cardIdsInDeck.length > 50 ? cardIdsInDeck.slice(0, 50) : cardIdsInDeck;
        const cardsInfo = await client.card.cardsInfo({ cards: sampleCardIds });

        const uniqueModelNames = [...new Set(cardsInfo.map(card => card.modelName))];

        if (uniqueModelNames.length === 1) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                deckName: deckName,
                status: "single_model_found",
                modelName: uniqueModelNames[0]
              })
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                deckName: deckName,
                status: "multiple_models_found",
                modelNames: uniqueModelNames.sort()
              })
            }]
          };
        }
      }

      default:
        throw new Error("Unknown tool");
    }
  });
} 