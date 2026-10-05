import {
  ToolArgs,
  optBool,
  optNumber,
  optString,
  optStringArray,
  reqNumber,
  reqString,
  reqStringRecord,
} from "../args.js";
import { dryRunProperty, filterProperties, noteIdsProperty, resolveNoteIds, searchTerm } from "../query.js";
import { assertSupportedLanguage, generateSpeech } from "../tts.js";
import { chunk, mapWithConcurrency } from "../utils.js";
import { ToolDef, WRITE } from "./types.js";

const AUDIO_WRITE = { ...WRITE, openWorldHint: true };

const audioProperties = {
  sourceField: { type: "string", description: "Field whose text is spoken." },
  audioField: { type: "string", description: "Field that receives the [sound:...] tag." },
  language: {
    type: "string",
    description: "Language code, default 'en' (e.g. es, fr, de, ja, zh, pt).",
  },
} as const;

function languageArg(args: ToolArgs): string {
  const language = optString(args, "language") ?? "en";
  assertSupportedLanguage(language);
  return language;
}

export const audioTools: ToolDef[] = [
  {
    name: "add_card_with_audio",
    description: "Create ONE new note with Azure TTS audio generated from one of its fields.",
    inputSchema: {
      type: "object",
      properties: {
        fields: { type: "object", additionalProperties: { type: "string" } },
        modelName: { type: "string" },
        deckName: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        ...audioProperties,
      },
      required: ["fields", "modelName", "sourceField", "audioField"],
    },
    annotations: AUDIO_WRITE,
    handler: async (args, client) => {
      const fields = reqStringRecord(args, "fields");
      const sourceField = reqString(args, "sourceField");
      const audioField = reqString(args, "audioField");
      const language = languageArg(args);
      if (!fields[sourceField]) {
        throw new Error(`Source field '${sourceField}' is missing or empty.`);
      }

      const audio = await generateSpeech(client, fields[sourceField], language);
      const noteId = await client.note.addNote({
        note: {
          deckName: optString(args, "deckName") ?? "Default",
          modelName: reqString(args, "modelName"),
          fields: { ...fields, [audioField]: audio },
          tags: optStringArray(args, "tags"),
          options: { allowDuplicate: false },
        },
      });
      if (!noteId) throw new Error("AnkiConnect did not create the note.");
      return `Created note ${noteId} with ${language} audio.`;
    },
  },
  {
    name: "update_card_with_audio",
    description: "Generate audio for ONE existing note from one of its fields.",
    inputSchema: {
      type: "object",
      properties: { noteId: { type: "number" }, ...audioProperties },
      required: ["noteId", "sourceField", "audioField"],
    },
    annotations: AUDIO_WRITE,
    handler: async (args, client) => {
      const noteId = reqNumber(args, "noteId");
      const sourceField = reqString(args, "sourceField");
      const audioField = reqString(args, "audioField");
      const language = languageArg(args);

      const [note] = await client.note.notesInfo({ notes: [noteId] });
      if (!note) throw new Error(`Note ${noteId} not found.`);
      const sourceText = note.fields[sourceField]?.value;
      if (!sourceText) {
        throw new Error(`Field '${sourceField}' is missing or empty in note ${noteId}.`);
      }

      const audio = await generateSpeech(client, sourceText, language);
      await client.note.updateNoteFields({ note: { id: noteId, fields: { [audioField]: audio } } });
      return `Added ${language} audio to note ${noteId}.`;
    },
  },
  {
    name: "bulk_generate_audio",
    description:
      "Generate audio for many notes at once (e.g. a whole deck). By default only notes whose audio field is empty are processed.",
    inputSchema: {
      type: "object",
      properties: {
        ...audioProperties,
        ...filterProperties,
        ...noteIdsProperty,
        overwrite: { type: "boolean", description: "Also regenerate notes that already have audio (default false)." },
        limit: { type: "number", description: "Max notes per call, 1-200 (default 50). Call again for the rest." },
        ...dryRunProperty,
      },
      required: ["sourceField", "audioField"],
    },
    annotations: AUDIO_WRITE,
    handler: async (args, client) => {
      const sourceField = reqString(args, "sourceField");
      const audioField = reqString(args, "audioField");
      const language = languageArg(args);
      const limit = optNumber(args, "limit", { min: 1, max: 200 }) ?? 50;
      const overwrite = optBool(args, "overwrite");

      const { noteIds, query } = await resolveNoteIds(
        client,
        args,
        overwrite ? "" : searchTerm(audioField, "")
      );
      const batch = noteIds.slice(0, limit);
      if (optBool(args, "dryRun") || batch.length === 0) {
        return {
          dryRun: optBool(args, "dryRun"),
          target: query ?? "explicit note IDs",
          matching: noteIds.length,
          wouldProcess: batch.length,
        };
      }

      const notes = [];
      for (const ids of chunk(batch, 250)) {
        notes.push(...(await client.note.notesInfo({ notes: ids })));
      }

      const results = await mapWithConcurrency(notes, 4, async (note) => {
        const text = note.fields[sourceField]?.value;
        if (!text) return { noteId: note.noteId, ok: false, error: `'${sourceField}' is empty` };
        if (!(audioField in note.fields)) {
          return { noteId: note.noteId, ok: false, error: `no field '${audioField}'` };
        }
        try {
          const audio = await generateSpeech(client, text, language);
          await client.note.updateNoteFields({ note: { id: note.noteId, fields: { [audioField]: audio } } });
          return { noteId: note.noteId, ok: true };
        } catch (e) {
          return { noteId: note.noteId, ok: false, error: (e as Error).message };
        }
      });

      const failed = results.filter((r) => !r.ok);
      return {
        target: query ?? "explicit note IDs",
        processed: results.length - failed.length,
        failed: failed.slice(0, 20),
        remaining: noteIds.length - batch.length,
      };
    },
  },
];
