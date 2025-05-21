import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { cleanWithRegex } from "./utils.js";
import axios from "axios";
import * as dotenv from "dotenv";
import * as path from "path";
console.error("Current working directory:", process.cwd());
const envPath = path.resolve(process.cwd(), ".env");
console.error("Looking for .env file at:", envPath);
const result = dotenv.config({ path: envPath });
if (result.error) {
    console.error("Error loading .env file:", result.error);
}
else {
    console.error(".env file loaded successfully");
}
console.error("ANKI_MEDIA_DIR value:", process.env.ANKI_MEDIA_DIR);
console.error("AZURE_API_KEY available:", !!process.env.AZURE_API_KEY);
const languageToVoiceMap = {
    "en": "en-US-JennyNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "it": "it-IT-ElsaNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "pt": "pt-BR-FranciscaNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ar": "ar-EG-SalmaNeural",
    "nl": "nl-NL-ColetteNeural",
    "hi": "hi-IN-SwaraNeural",
    "tr": "tr-TR-EmelNeural",
    "pl": "pl-PL-ZofiaNeural",
    "sv": "sv-SE-SofieNeural",
    "fi": "fi-FI-SelmaNeural",
    "da": "da-DK-ChristelNeural",
    "no": "nb-NO-IselinNeural",
    "cs": "cs-CZ-VlastaNeural",
    "hu": "hu-HU-NoemiNeural",
    "el": "el-GR-AthinaNeural",
    "he": "he-IL-HilaNeural",
    "th": "th-TH-PremwadeeNeural",
    "vi": "vi-VN-HoaiMyNeural",
    "id": "id-ID-GadisNeural",
    "ms": "ms-MY-YasminNeural",
    "ro": "ro-RO-AlinaNeural",
};
import * as fs from 'fs';
async function generateSpeech(text, language = "en") {
    const subscriptionKey = process.env.AZURE_API_KEY;
    if (!subscriptionKey) {
        console.error("AZURE_API_KEY not found in environment variables. Audio generation will not work.");
        return `[No audio available - API key missing]`;
    }
    const voice = languageToVoiceMap[language] || "en-US-JennyNeural";
    const endpoint = "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1";
    try {
        console.log(`Generating speech for text: "${text}" in language: ${language}`);
        console.log(`Using endpoint: ${endpoint}`);
        console.log(`Using voice: ${voice}`);
        let response;
        try {
            response = await axios({
                method: 'post',
                url: endpoint,
                headers: {
                    'Ocp-Apim-Subscription-Key': subscriptionKey,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
                    'User-Agent': 'AnkiAudioTool'
                },
                data: `<speak version='1.0' xml:lang='${language}'><voice xml:lang='${language}' name='${voice}'>${text}</voice></speak>`,
                responseType: 'arraybuffer'
            });
        }
        catch (apiError) {
            console.error("Error calling Azure TTS API:", apiError);
            return `[Error calling TTS API: ${apiError instanceof Error ? apiError.message : 'Unknown error'}]`;
        }
        if (!response.data || response.data.length === 0) {
            console.error("Received empty audio data from Azure TTS API");
            return `[Error: Empty audio data received]`;
        }
        const timestamp = new Date().getTime();
        const fileName = `tts_${language}_${timestamp}.mp3`;
        try {
            // Try to get media directory from env or use a fallback approach
            let ankiMediaDir = process.env.ANKI_MEDIA_DIR;
            // Debug output
            console.error("ANKI_MEDIA_DIR from env:", ankiMediaDir);
            // If environment variable is not set, try hardcoding the path as a fallback
            if (!ankiMediaDir) {
                console.error("ANKI_MEDIA_DIR not found in environment variables. Trying fallback...");
                ankiMediaDir = "C:/Users/anton/AppData/Roaming/Anki2/Test/collection.media";
                console.error("Using fallback media directory:", ankiMediaDir);
            }
            if (!ankiMediaDir) {
                console.error("ANKI_MEDIA_DIR not found in environment variables or fallback. Audio files cannot be saved.");
                return `[Error: Anki media directory not configured]`;
            }
            console.log(`Using Anki media directory: ${ankiMediaDir}`);
            if (!fs.existsSync(ankiMediaDir)) {
                console.log(`Creating Anki media directory: ${ankiMediaDir}`);
                try {
                    fs.mkdirSync(ankiMediaDir, { recursive: true });
                }
                catch (mkdirError) {
                    console.error(`Cannot create Anki media directory: ${mkdirError}`);
                    return `[Error: Cannot create Anki media directory]`;
                }
            }
            const filePath = path.join(ankiMediaDir, fileName);
            console.log(`Saving audio file to: "${filePath}"`);
            fs.writeFileSync(filePath, Buffer.from(response.data));
            if (fs.existsSync(filePath)) {
                console.log(`SUCCESS! Audio saved to: "${filePath}"`);
                return `[sound:${fileName}]`;
            }
            else {
                console.error(`ERROR: File was not created at: "${filePath}"`);
                return `[Error: Audio file could not be created]`;
            }
        }
        catch (fileError) {
            console.error("Error saving audio file:", fileError);
            return `[Error saving audio file: ${fileError instanceof Error ? fileError.message : 'Unknown error'}]`;
        }
    }
    catch (error) {
        console.error("Unexpected error in generateSpeech:", error);
        return `[Error generating audio: ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }
}
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
            description: "Create a NEW flashcard in Anki for the user. ONLY use this for creating NEW cards, NOT for updating existing ones. Will throw an error if the card already exists. For updating existing cards, use update_note_fields with the noteId instead. Must use HTML formatting only. IMPORTANT FORMATTING RULES:\n1. Must use HTML tags for ALL formatting - NO markdown\n2. Use <br> for ALL line breaks\n3. For code blocks, use <pre> with inline CSS styling\n4. Example formatting:\n   - Line breaks: <br>\n   - Code: <pre style=\"background-color: transparent; padding: 10px; border-radius: 5px;\">\n   - Lists: <ol> and <li> tags\n   - Bold: <strong>\n   - Italic: <em>",
            inputSchema: {
                type: "object",
                properties: {
                    fields: {
                        type: "object",
                        description: "An object where keys are field names and values are their content (e.g., {\"Hanzi\": \"你好\", \"Pinyin\": \"Nǐ hǎo\"}). Field names must match the target model.",
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
        },
        {
            name: "add_card_with_audio",
            description: "Create a NEW flashcard in Anki with automatically generated audio. ONLY use this for creating NEW cards, NOT for updating existing ones. Will throw an error if the card already exists. For updating audio on existing cards, use update_card_with_audio with the noteId instead. The audio is generated from a specified source field and added to a target audio field.",
            inputSchema: {
                type: "object",
                properties: {
                    fields: {
                        type: "object",
                        description: "An object where keys are field names and values are their content.",
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
                        items: { type: "string" }
                    },
                    sourceField: {
                        type: "string",
                        description: "Field name containing the text to generate audio from."
                    },
                    audioField: {
                        type: "string",
                        description: "Field name where the generated audio will be stored."
                    },
                    language: {
                        type: "string",
                        description: "Optional: Language code for TTS (e.g., 'en', 'es', 'fr'). Defaults to 'en'."
                    }
                },
                required: ["fields", "modelName", "sourceField", "audioField"]
            }
        },
        {
            name: "update_card_with_audio",
            description: "Update an EXISTING card by generating audio from a specified field and adding it to an audio field. Use this ONLY for cards that already exist (you must have the noteId). For creating new cards with audio, use add_card_with_audio instead.",
            inputSchema: {
                type: "object",
                properties: {
                    noteId: {
                        type: "number",
                        description: "The ID of the Anki note to update."
                    },
                    sourceField: {
                        type: "string",
                        description: "Field name containing the text to generate audio from."
                    },
                    audioField: {
                        type: "string",
                        description: "Field name where the generated audio will be stored."
                    },
                    language: {
                        type: "string",
                        description: "Optional: Language code for TTS (e.g., 'en', 'es', 'fr'). Defaults to 'en'."
                    }
                },
                required: ["noteId", "sourceField", "audioField"]
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
            name: "get_deck_names",
            description: "Get a list of all Anki deck names.",
            inputSchema: {
                type: "object",
                properties: {},
            }
        },
        {
            name: "find_cards",
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
            name: "update_note_fields",
            description: "Update specific fields of an EXISTING Anki note. Use this ONLY when you already have the noteId of an existing card. For creating new cards, use add_card instead.",
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
            description: "RECOMMENDED FOR MULTIPLE CARDS: Update specific fields for multiple EXISTING Anki notes in a single operation. Much more efficient than updating cards one by one. Use this ONLY when you have noteIds for cards that already exist. For creating new cards in bulk, use add_bulk instead. Complete all updates in a single operation whenever possible.",
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
            description: "RECOMMENDED FOR MULTIPLE CARDS: Adds multiple NEW flashcards to Anki in a single operation. Much more efficient than adding cards one by one. ONLY use this for creating NEW cards, NOT for updating existing ones. Will throw errors for any cards that already exist. For updating existing cards, use bulk_update_notes with noteIds instead. Must use HTML formatting for card content.",
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
export function registerToolHandlers(server, getClient) {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        console.error("[MCP Anki Client - tool-manager.ts] Received ListToolsRequest from client.");
        const tools = [...getToolDefinitions(), getDeckModelInfoToolDefinition];
        return { tools: tools };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const toolArgs = args || {};
        switch (name) {
            case "update_cards": {
                const client = getClient();
                const answers = toolArgs.answers;
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
                const client = getClient();
                const fields = toolArgs.fields;
                const modelName = String(toolArgs.modelName);
                const deckName = toolArgs.deckName ? String(toolArgs.deckName) : 'Default';
                const tags = toolArgs.tags || [];
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
                            allowDuplicate: false
                        }
                    },
                };
                const result = await client.note.addNote(notePayload);
                if (result === null || result === 0) {
                    throw new Error(`Failed to create note. AnkiConnect returned: ${result === null ? 'null (possibly duplicate or invalid model/fields)' : '0 (unknown error)'}`);
                }
                const noteId = result;
                return {
                    content: [{
                            type: "text",
                            text: `Created note with id ${noteId}.`
                        }]
                };
            }
            case "add_card_with_audio": {
                const client = getClient();
                const fields = toolArgs.fields;
                const modelName = String(toolArgs.modelName);
                const deckName = toolArgs.deckName ? String(toolArgs.deckName) : 'Default';
                const tags = toolArgs.tags || [];
                const sourceField = String(toolArgs.sourceField);
                const audioField = String(toolArgs.audioField);
                const language = toolArgs.language ? String(toolArgs.language) : 'en';
                if (!fields || Object.keys(fields).length === 0) {
                    throw new Error("The 'fields' argument cannot be empty.");
                }
                if (!modelName) {
                    throw new Error("The 'modelName' argument is required.");
                }
                if (!fields[sourceField]) {
                    throw new Error(`Source field '${sourceField}' not found in the provided fields or is empty.`);
                }
                if (!languageToVoiceMap[language]) {
                    throw new Error(`Unsupported language code: '${language}'. Supported languages are: ${Object.keys(languageToVoiceMap).join(', ')}`);
                }
                const audioContent = await generateSpeech(fields[sourceField], language);
                const fieldsWithAudio = { ...fields, [audioField]: audioContent };
                const notePayload = {
                    note: {
                        deckName: deckName,
                        modelName: modelName,
                        fields: fieldsWithAudio,
                        tags: tags,
                        options: {
                            allowDuplicate: false
                        }
                    },
                };
                const result = await client.note.addNote(notePayload);
                if (result === null || result === 0) {
                    throw new Error(`Failed to create note with audio. AnkiConnect returned: ${result === null ? 'null (possibly duplicate or invalid model/fields)' : '0 (unknown error)'}`);
                }
                const noteId = result;
                return {
                    content: [{
                            type: "text",
                            text: `Created note with id ${noteId} including generated audio in ${language} language.`
                        }]
                };
            }
            case "update_card_with_audio": {
                const client = getClient();
                const noteId = Number(toolArgs.noteId);
                const sourceField = String(toolArgs.sourceField);
                const audioField = String(toolArgs.audioField);
                const language = toolArgs.language ? String(toolArgs.language) : 'en';
                if (isNaN(noteId)) {
                    throw new Error("Invalid noteId provided.");
                }
                if (!languageToVoiceMap[language]) {
                    throw new Error(`Unsupported language code: '${language}'. Supported languages are: ${Object.keys(languageToVoiceMap).join(', ')}`);
                }
                const noteInfo = await client.note.notesInfo({ notes: [noteId] });
                if (!noteInfo || noteInfo.length === 0) {
                    throw new Error(`Note with ID ${noteId} not found.`);
                }
                const note = noteInfo[0];
                if (!note.fields[sourceField]) {
                    throw new Error(`Source field '${sourceField}' not found in note ${noteId}.`);
                }
                const sourceText = note.fields[sourceField].value;
                if (!sourceText) {
                    throw new Error(`Source field '${sourceField}' is empty in note ${noteId}.`);
                }
                const audioContent = await generateSpeech(sourceText, language);
                await client.note.updateNoteFields({
                    note: {
                        id: noteId,
                        fields: {
                            [audioField]: audioContent
                        },
                    },
                });
                return {
                    content: [{
                            type: "text",
                            text: `Successfully updated note ${noteId} with generated audio in ${language} language from the '${sourceField}' field.`
                        }]
                };
            }
            case "get_due_cards": {
                const client = getClient();
                const ankiQuery = "is:due";
                let allCardIds = await client.card.findCards({ query: ankiQuery });
                if (allCardIds.length > 999)
                    allCardIds = allCardIds.slice(0, 999);
                const cardsData = await client.card.cardsInfo({ cards: allCardIds });
                const mappedCards = cardsData.map((card) => ({
                    cardId: card.cardId,
                    question: cleanWithRegex(card.question),
                    answer: cleanWithRegex(card.answer),
                    due: card.due
                })).sort((a, b) => a.due - b.due);
                return {
                    content: [{ type: "text", text: JSON.stringify(mappedCards) }]
                };
            }
            case "get_new_cards": {
                const client = getClient();
                const ankiQuery = "is:new";
                let allCardIds = await client.card.findCards({ query: ankiQuery });
                if (allCardIds.length > 999)
                    allCardIds = allCardIds.slice(0, 999);
                const cardsData = await client.card.cardsInfo({ cards: allCardIds });
                const mappedCards = cardsData.map((card) => ({
                    cardId: card.cardId,
                    question: cleanWithRegex(card.question),
                    answer: cleanWithRegex(card.answer),
                    due: card.due
                })).sort((a, b) => a.due - b.due);
                return {
                    content: [{ type: "text", text: JSON.stringify(mappedCards) }]
                };
            }
            case "get_deck_names": {
                const client = getClient();
                const deckNames = await client.deck.deckNames();
                return {
                    content: [{ type: "text", text: JSON.stringify(deckNames) }]
                };
            }
            case "find_cards": {
                const client = getClient();
                const query = String(toolArgs.query);
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
                if (allCardIds.length > 999) {
                    console.warn(`[MCP Anki Client] find-cards: Query "${query}" returned ${allCardIds.length} cards. Limiting to 999.`);
                    allCardIds = allCardIds.slice(0, 999);
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
                    sfld: cleanWithRegex(card.sfld || ""),
                    fields: Object.fromEntries(Object.entries(card.fields).map(([fieldName, fieldData]) => [
                        fieldName,
                        cleanWithRegex(fieldData.value)
                    ]))
                }));
                detailedCardsInfo.sort((a, b) => a.sfld.localeCompare(b.sfld));
                return {
                    content: [{ type: "text", text: JSON.stringify(detailedCardsInfo) }]
                };
            }
            case "update_note_fields": {
                const client = getClient();
                const noteId = Number(toolArgs.noteId);
                const fieldsToUpdate = toolArgs.fields;
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
                const client = getClient();
                const deckName = String(toolArgs.deckName);
                if (!deckName) {
                    throw new Error("deckName parameter is required for create_deck tool.");
                }
                await client.deck.createDeck({ deck: deckName });
                return {
                    content: [{ type: "text", text: `Successfully created deck: ${deckName}` }]
                };
            }
            case "bulk_update_notes": {
                const client = getClient();
                const notesToUpdate = toolArgs.notes;
                if (!notesToUpdate || !Array.isArray(notesToUpdate) || notesToUpdate.length === 0) {
                    throw new Error("Invalid or empty 'notes' array provided for bulk_update_notes tool.");
                }
                const results = [];
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
                    }
                    catch (e) {
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
                const client = getClient();
                const modelNames = await client.model.modelNames();
                return { content: [{ type: "text", text: JSON.stringify(modelNames) }] };
            }
            case "get_model_details": {
                const client = getClient();
                const modelName = String(toolArgs.modelName);
                if (!modelName)
                    throw new Error("modelName parameter is required.");
                const fieldNames = await client.model.modelFieldNames({ modelName });
                const templates = await client.model.modelTemplates({ modelName });
                const css = await client.model.modelStyling({ modelName });
                return { content: [{ type: "text", text: JSON.stringify({ modelName, fieldNames, templates, css }) }] };
            }
            case "add_note_type_field": {
                const client = getClient();
                const modelName = String(toolArgs.modelName);
                const fieldName = String(toolArgs.fieldName);
                if (!modelName || !fieldName)
                    throw new Error("modelName and fieldName parameters are required.");
                const currentFields = await client.model.modelFieldNames({ modelName });
                if (currentFields.includes(fieldName)) {
                    throw new Error(`Field '${fieldName}' already exists in model '${modelName}'.`);
                }
                await client.model.modelFieldAdd({ modelName: modelName, fieldName: fieldName, index: currentFields.length });
                return { content: [{ type: "text", text: `Successfully added field '${fieldName}' to model '${modelName}'.` }] };
            }
            case "remove_note_type_field": {
                const client = getClient();
                const modelName = String(toolArgs.modelName);
                const fieldName = String(toolArgs.fieldName);
                if (!modelName || !fieldName)
                    throw new Error("modelName and fieldName parameters are required.");
                const currentFields = await client.model.modelFieldNames({ modelName });
                if (!currentFields.includes(fieldName)) {
                    throw new Error(`Field '${fieldName}' does not exist in model '${modelName}'.`);
                }
                await client.model.modelFieldRemove({ modelName: modelName, fieldName: fieldName });
                return { content: [{ type: "text", text: `Successfully removed field '${fieldName}' from model '${modelName}'.` }] };
            }
            case "rename_note_type_field": {
                const client = getClient();
                const modelName = String(toolArgs.modelName);
                const oldFieldName = String(toolArgs.oldFieldName);
                const newFieldName = String(toolArgs.newFieldName);
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
                await client.model.modelFieldRename({ modelName: modelName, oldFieldName: oldFieldName, newFieldName: newFieldName });
                return { content: [{ type: "text", text: `Successfully renamed field '${oldFieldName}' to '${newFieldName}' in model '${modelName}'.` }] };
            }
            case "reposition_note_type_field": {
                const client = getClient();
                const modelName = String(toolArgs.modelName);
                const fieldName = String(toolArgs.fieldName);
                const newIndex = Number(toolArgs.index);
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
                await client.model.modelFieldReposition({ modelName: modelName, fieldName: fieldName, index: newIndex });
                return { content: [{ type: "text", text: `Successfully repositioned field '${fieldName}' to index ${newIndex} in model '${modelName}'.` }] };
            }
            case "update_note_type_templates": {
                const client = getClient();
                const modelName = String(toolArgs.modelName);
                const templates = toolArgs.templates;
                if (!modelName || !templates)
                    throw new Error("modelName and templates parameters are required.");
                await client.model.updateModelTemplates({ model: { name: modelName, templates: templates } });
                return { content: [{ type: "text", text: `Successfully updated templates for model '${modelName}'.` }] };
            }
            case "update_note_type_styling": {
                const client = getClient();
                const modelName = String(toolArgs.modelName);
                const css = String(toolArgs.css);
                if (!modelName || css === undefined)
                    throw new Error("modelName and css parameters are required.");
                await client.model.updateModelStyling({ model: { name: modelName, css: css } });
                return { content: [{ type: "text", text: `Successfully updated styling for model '${modelName}'.` }] };
            }
            case "create_model": {
                const client = getClient();
                const modelName = String(toolArgs.modelName);
                const fieldNames = toolArgs.fieldNames;
                const cardTemplates = toolArgs.cardTemplates;
                const css = toolArgs.css ? String(toolArgs.css) : "";
                const isCloze = typeof toolArgs.isCloze === 'boolean' ? toolArgs.isCloze : false;
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
                const client = getClient();
                const notesInput = toolArgs.notes;
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
                const ankiResults = await client.note.addNotes({ notes: notesPayload });
                const successfulIds = [];
                const errors = [];
                if (ankiResults === null) {
                    throw new Error("Failed to add notes. The entire batch operation returned null. This might indicate a problem with AnkiConnect or the request structure.");
                }
                ankiResults.forEach((noteId, index) => {
                    if (noteId !== null && noteId !== 0) {
                        successfulIds.push(noteId);
                    }
                    else {
                        const failedNotePayload = notesPayload[index];
                        const firstFieldKey = Object.keys(failedNotePayload.fields)[0] || '[No Fields]';
                        const firstFieldValue = failedNotePayload.fields[firstFieldKey] || '[N/A]';
                        const failureReason = noteId === null ? "null (e.g., duplicate, invalid model/fields for note)" : "0 (unknown error for note)";
                        errors.push(`Note ${index + 1} (Model: '${failedNotePayload.modelName}', Deck: '${failedNotePayload.deckName}', First Field ('${firstFieldKey}'): '${firstFieldValue.substring(0, 20)}...') failed. Reason: ${failureReason}`);
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
                const client = getClient();
                const deckName = String(toolArgs.deckName);
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
                }
                else {
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
