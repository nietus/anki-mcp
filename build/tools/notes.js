import * as path from "path";
import { optBool, optString, optStringArray, reqEnum, reqNumber, reqString, reqStringRecord, } from "../args.js";
import { dryRunProperty, filterProperties, noteIdsProperty, resolveNoteIds, searchTerm, } from "../query.js";
import { confirmToken, wrapCloze } from "../stats.js";
import { chunk, cleanWithRegex, mapWithConcurrency, truncate } from "../utils.js";
import { DESTRUCTIVE, IDEMPOTENT_WRITE, WRITE } from "./types.js";
function describeNote(note) {
    const [firstField, firstValue] = Object.entries(note.fields)[0] ?? ["?", ""];
    return `${firstField}: "${truncate(cleanWithRegex(firstValue), 40)}"`;
}
/**
 * Checks every note with canAddNotesWithErrorDetail (duplicates, empty first
 * field, unknown model...) and only adds the valid ones, reporting the rest.
 */
async function addNotesWithReport(client, notes, dryRun) {
    let checks;
    try {
        checks = await client.note.canAddNotesWithErrorDetail({ notes });
    }
    catch {
        // Older AnkiConnect versions lack this action; let addNotes report failures.
        checks = notes.map(() => ({ canAdd: true }));
    }
    const rejected = checks
        .map((c, i) => ({ ...c, index: i }))
        .filter((c) => !c.canAdd)
        .map((c) => ({
        index: c.index,
        note: describeNote(notes[c.index]),
        reason: c.error ?? "cannot be added",
    }));
    const addable = notes
        .map((note, index) => ({ note, index }))
        .filter(({ index }) => checks[index].canAdd);
    if (dryRun) {
        return { dryRun: true, wouldAdd: addable.length, rejected };
    }
    const ids = addable.length > 0
        ? ((await client.note.addNotes({ notes: addable.map((a) => a.note) })) ?? [])
        : [];
    const added = [];
    addable.forEach(({ note, index }, i) => {
        const id = ids[i];
        if (id) {
            added.push(Number(id));
        }
        else {
            rejected.push({ index, note: describeNote(note), reason: "addNotes failed" });
        }
    });
    return {
        added: added.length,
        noteIds: added,
        rejected: rejected.sort((a, b) => a.index - b.index),
    };
}
function toNewNote(raw, fallbackDeck, fallbackTags = []) {
    const fields = reqStringRecord(raw, "fields");
    const modelName = reqString(raw, "modelName");
    return {
        deckName: optString(raw, "deckName") ?? fallbackDeck ?? "Default",
        modelName,
        fields,
        tags: [...fallbackTags, ...optStringArray(raw, "tags")],
        options: { allowDuplicate: false },
    };
}
const newNoteProperties = {
    fields: {
        type: "object",
        additionalProperties: { type: "string" },
        description: 'Field name → HTML content, e.g. {"Front": "...", "Back": "..."}. Names must match the note type.',
    },
    modelName: { type: "string", description: "Note type name (see get_deck_model_info / get_model_names)." },
    deckName: { type: "string", description: "Target deck (default 'Default')." },
    tags: { type: "array", items: { type: "string" } },
};
async function loadNotes(client, noteIds) {
    const infos = [];
    for (const ids of chunk(noteIds, 250)) {
        infos.push(...(await client.note.notesInfo({ notes: ids })));
    }
    return infos;
}
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function mediaFileName(source, fallbackExt = ".png") {
    let base = "image";
    let ext = fallbackExt;
    try {
        const pathname = /^https?:\/\//i.test(source) ? new URL(source).pathname : source;
        const parsed = path.parse(pathname);
        if (parsed.name)
            base = parsed.name.replace(/[^\w.-]+/g, "_").slice(0, 40);
        if (/^\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(parsed.ext))
            ext = parsed.ext.toLowerCase();
    }
    catch {
        // Keep defaults for unparsable sources.
    }
    return `mcp_${Date.now()}_${base}${ext}`;
}
export const noteTools = [
    {
        name: "add_card",
        description: "Create ONE new note. For several notes use add_bulk; to change existing notes use update_note_fields.",
        inputSchema: {
            type: "object",
            properties: { ...newNoteProperties },
            required: ["fields", "modelName"],
        },
        annotations: WRITE,
        handler: async (args, client) => {
            const note = toNewNote(args);
            const noteId = await client.note.addNote({ note });
            if (!noteId)
                throw new Error("AnkiConnect did not create the note.");
            return `Created note ${noteId}.`;
        },
    },
    {
        name: "add_bulk",
        description: "Create many new notes in one call. Duplicates and invalid notes are skipped and reported with the reason. Use dryRun to check before adding.",
        inputSchema: {
            type: "object",
            properties: {
                notes: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: { ...newNoteProperties },
                        required: ["fields", "modelName"],
                    },
                },
                ...dryRunProperty,
            },
            required: ["notes"],
        },
        annotations: WRITE,
        handler: async (args, client) => {
            const raw = args.notes;
            if (!Array.isArray(raw) || raw.length === 0) {
                throw new Error("'notes' must be a non-empty array.");
            }
            const notes = raw.map((n, i) => {
                try {
                    return toNewNote(n);
                }
                catch (e) {
                    throw new Error(`Note ${i}: ${e.message}`);
                }
            });
            return addNotesWithReport(client, notes, optBool(args, "dryRun"));
        },
    },
    {
        name: "add_cloze_cards",
        description: "Create cloze notes from text. Either pass 'terms' to hide (each becomes {{c1::}}, {{c2::}}...) or text that already has {{c1::...}} markup.",
        inputSchema: {
            type: "object",
            properties: {
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            text: { type: "string", description: "Sentence or passage (HTML allowed)." },
                            terms: { type: "array", items: { type: "string" }, description: "Words/phrases to hide, in order." },
                            extra: { type: "string", description: "Optional content for the second field (Back Extra)." },
                        },
                        required: ["text"],
                    },
                },
                deckName: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                modelName: { type: "string", description: "Cloze note type (default 'Cloze')." },
                ...dryRunProperty,
            },
            required: ["items"],
        },
        annotations: WRITE,
        handler: async (args, client) => {
            const raw = args.items;
            if (!Array.isArray(raw) || raw.length === 0) {
                throw new Error("'items' must be a non-empty array.");
            }
            const modelName = optString(args, "modelName") ?? "Cloze";
            const fieldNames = await client.model.modelFieldNames({ modelName });
            if (fieldNames.length === 0) {
                throw new Error(`Note type '${modelName}' not found or has no fields.`);
            }
            const [textField, extraField] = fieldNames;
            const deckName = optString(args, "deckName") ?? "Default";
            const tags = optStringArray(args, "tags");
            const notes = raw.map((item, i) => {
                const itemArgs = item;
                try {
                    const text = wrapCloze(reqString(itemArgs, "text"), optStringArray(itemArgs, "terms"));
                    const fields = { [textField]: text };
                    const extra = optString(itemArgs, "extra");
                    if (extra && extraField)
                        fields[extraField] = extra;
                    return { deckName, modelName, fields, tags, options: { allowDuplicate: false } };
                }
                catch (e) {
                    throw new Error(`Item ${i}: ${e.message}`);
                }
            });
            return addNotesWithReport(client, notes, optBool(args, "dryRun"));
        },
    },
    {
        name: "update_note_fields",
        description: "Update fields of ONE existing note. For many notes use bulk_update_notes.",
        inputSchema: {
            type: "object",
            properties: {
                noteId: { type: "number" },
                fields: { type: "object", additionalProperties: { type: "string" }, description: "Field name → new HTML content." },
            },
            required: ["noteId", "fields"],
        },
        annotations: IDEMPOTENT_WRITE,
        handler: async (args, client) => {
            const noteId = reqNumber(args, "noteId");
            const fields = reqStringRecord(args, "fields");
            await client.note.updateNoteFields({ note: { id: noteId, fields } });
            return `Updated note ${noteId} (${Object.keys(fields).join(", ")}).`;
        },
    },
    {
        name: "bulk_update_notes",
        description: "Update fields of many existing notes in one call.",
        inputSchema: {
            type: "object",
            properties: {
                notes: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            noteId: { type: "number" },
                            fields: { type: "object", additionalProperties: { type: "string" } },
                        },
                        required: ["noteId", "fields"],
                    },
                },
            },
            required: ["notes"],
        },
        annotations: IDEMPOTENT_WRITE,
        handler: async (args, client) => {
            const raw = args.notes;
            if (!Array.isArray(raw) || raw.length === 0) {
                throw new Error("'notes' must be a non-empty array.");
            }
            const results = await mapWithConcurrency(raw, 8, async (n) => {
                const noteArgs = n;
                const noteId = Number(noteArgs.noteId);
                try {
                    const fields = reqStringRecord(noteArgs, "fields");
                    if (!Number.isFinite(noteId))
                        throw new Error("invalid noteId");
                    await client.note.updateNoteFields({ note: { id: noteId, fields } });
                    return { noteId, ok: true };
                }
                catch (e) {
                    return { noteId, ok: false, error: e.message };
                }
            });
            const failed = results.filter((r) => !r.ok);
            return {
                updated: results.length - failed.length,
                failed,
            };
        },
    },
    {
        name: "find_and_replace",
        description: "Find and replace text across notes (plain text or regex), optionally only in some fields. Returns before/after samples; use dryRun to preview.",
        inputSchema: {
            type: "object",
            properties: {
                find: { type: "string" },
                replace: { type: "string", description: "Replacement (regex mode supports $1 groups). Empty string deletes." },
                regex: { type: "boolean", description: "Treat 'find' as a JavaScript regex (default false)." },
                caseSensitive: { type: "boolean", description: "Default false." },
                fields: { type: "array", items: { type: "string" }, description: "Only these fields (default: all)." },
                ...filterProperties,
                ...noteIdsProperty,
                ...dryRunProperty,
            },
            required: ["find", "replace"],
        },
        annotations: DESTRUCTIVE,
        handler: async (args, client) => {
            const find = reqString(args, "find");
            const replace = typeof args.replace === "string" ? args.replace : "";
            const flags = optBool(args, "caseSensitive") ? "g" : "gi";
            const pattern = optBool(args, "regex")
                ? new RegExp(find, flags)
                : new RegExp(escapeRegExp(find), flags);
            const onlyFields = new Set(optStringArray(args, "fields"));
            const dryRun = optBool(args, "dryRun");
            const { noteIds, query } = await resolveNoteIds(client, args);
            const notes = await loadNotes(client, noteIds);
            const changes = notes.flatMap((note) => {
                const updated = {};
                const samples = [];
                for (const [name, field] of Object.entries(note.fields)) {
                    if (onlyFields.size > 0 && !onlyFields.has(name))
                        continue;
                    const after = field.value.replace(pattern, replace);
                    if (after !== field.value) {
                        updated[name] = after;
                        samples.push({ field: name, before: truncate(field.value, 120), after: truncate(after, 120) });
                    }
                }
                return Object.keys(updated).length > 0
                    ? [{ noteId: note.noteId, fields: updated, samples }]
                    : [];
            });
            if (!dryRun) {
                await mapWithConcurrency(changes, 8, (c) => client.note.updateNoteFields({ note: { id: c.noteId, fields: c.fields } }));
            }
            return {
                dryRun,
                searched: notes.length,
                target: query ?? "explicit note IDs",
                notesChanged: changes.length,
                samples: changes.slice(0, 5).map((c) => ({ noteId: c.noteId, changes: c.samples })),
            };
        },
    },
    {
        name: "delete_notes",
        description: "Permanently delete notes (and all their cards). Two steps: call without confirmToken to preview and get a token, show the preview to the user, then call again with the token after they confirm.",
        inputSchema: {
            type: "object",
            properties: {
                ...filterProperties,
                ...noteIdsProperty,
                confirmToken: {
                    type: "string",
                    description: "Token from the preview call. Only valid while the same notes still match.",
                },
            },
        },
        annotations: DESTRUCTIVE,
        handler: async (args, client) => {
            const { noteIds, query } = await resolveNoteIds(client, args);
            const target = query ?? "explicit note IDs";
            if (noteIds.length === 0)
                return `No notes matched (${target}).`;
            const token = confirmToken(noteIds);
            const provided = optString(args, "confirmToken");
            if (!provided) {
                const sample = await client.note.notesInfo({ notes: noteIds.slice(0, 5) });
                return {
                    preview: true,
                    notesToDelete: noteIds.length,
                    target,
                    sample: sample.map((n) => ({
                        noteId: n.noteId,
                        modelName: n.modelName,
                        firstField: truncate(cleanWithRegex(Object.values(n.fields).sort((a, b) => a.order - b.order)[0]?.value ?? ""), 80),
                    })),
                    confirmToken: token,
                    next: "Show this to the user. If they confirm, call delete_notes again with the same filters and this confirmToken.",
                };
            }
            if (provided !== token) {
                throw new Error("confirmToken does not match the notes currently selected (the selection changed). Run the preview again.");
            }
            await client.note.deleteNotes({ notes: noteIds });
            return `Deleted ${noteIds.length} notes (${target}).`;
        },
    },
    {
        name: "manage_tags",
        description: "Tag management: list tags (with a deck/filter it returns tag counts for those notes), add/remove tags on notes, rename a tag, or clear unused tags.",
        inputSchema: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["list", "add", "remove", "rename", "clear_unused"],
                },
                tagsToChange: {
                    type: "array",
                    items: { type: "string" },
                    description: "For add/remove: the tags to add or remove.",
                },
                oldTag: { type: "string", description: "For rename." },
                newTag: { type: "string", description: "For rename." },
                prefix: { type: "string", description: "For list: only tags starting with this." },
                ...filterProperties,
                ...noteIdsProperty,
                ...dryRunProperty,
            },
            required: ["action"],
        },
        annotations: IDEMPOTENT_WRITE,
        handler: async (args, client) => {
            const action = reqEnum(args, "action", ["list", "add", "remove", "rename", "clear_unused"]);
            const dryRun = optBool(args, "dryRun");
            if (action === "list") {
                const prefix = (optString(args, "prefix") ?? "").toLowerCase();
                const matchesPrefix = (t) => t.toLowerCase().startsWith(prefix);
                const hasFilter = ["deckName", "tags", "query", "noteIds"].some((k) => args[k] !== undefined);
                if (!hasFilter) {
                    return (await client.note.getTags()).filter(matchesPrefix);
                }
                // With a filter: count how many of the selected notes use each tag.
                const { noteIds, query } = await resolveNoteIds(client, args);
                const notes = await loadNotes(client, noteIds.slice(0, 5000));
                const counts = new Map();
                for (const note of notes) {
                    for (const tag of note.tags.filter(matchesPrefix)) {
                        counts.set(tag, (counts.get(tag) ?? 0) + 1);
                    }
                }
                return {
                    target: query ?? "explicit note IDs",
                    notes: noteIds.length,
                    tagCounts: Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100)),
                };
            }
            if (action === "clear_unused") {
                if (dryRun)
                    return "Dry run: clear_unused has no preview; it only removes tags no note uses.";
                await client.note.clearUnusedTags();
                return "Removed tags that no note uses.";
            }
            if (action === "rename") {
                const oldTag = reqString(args, "oldTag");
                const newTag = reqString(args, "newTag");
                const noteIds = await client.note.findNotes({ query: searchTerm("tag", oldTag) });
                if (noteIds.length === 0)
                    return `No notes have the tag "${oldTag}".`;
                if (dryRun)
                    return `Dry run: would rename "${oldTag}" → "${newTag}" on ${noteIds.length} notes.`;
                await client.note.replaceTags({
                    notes: noteIds,
                    tag_to_replace: oldTag,
                    replace_with_tag: newTag,
                });
                return `Renamed "${oldTag}" → "${newTag}" on ${noteIds.length} notes.`;
            }
            const tags = optStringArray(args, "tagsToChange");
            if (tags.length === 0)
                throw new Error("'tagsToChange' is required for add/remove.");
            if (tags.some((t) => /\s/.test(t)))
                throw new Error("Tags cannot contain spaces.");
            const { noteIds, query } = await resolveNoteIds(client, args);
            const target = query ?? "explicit note IDs";
            if (noteIds.length === 0)
                return `No notes matched (${target}).`;
            if (dryRun)
                return `Dry run: would ${action} [${tags.join(", ")}] on ${noteIds.length} notes (${target}).`;
            const params = { notes: noteIds, tags: tags.join(" ") };
            if (action === "add")
                await client.note.addTags(params);
            else
                await client.note.removeTags(params);
            return `${action === "add" ? "Added" : "Removed"} [${tags.join(", ")}] on ${noteIds.length} notes (${target}).`;
        },
    },
    {
        name: "add_image",
        description: "Attach an image to a note field from a URL, a local file path, or base64 data. The image is stored in Anki's media folder.",
        inputSchema: {
            type: "object",
            properties: {
                noteId: { type: "number" },
                field: { type: "string", description: "Field that receives the <img> tag." },
                url: { type: "string" },
                path: { type: "string", description: "Absolute path of a local image file." },
                data: { type: "string", description: "Base64-encoded image data." },
                filename: { type: "string", description: "Optional file name (needed with 'data' to set the extension)." },
                mode: { type: "string", enum: ["append", "replace"], description: "Append to the field (default) or replace it." },
            },
            required: ["noteId", "field"],
        },
        annotations: { ...WRITE, openWorldHint: true },
        handler: async (args, client) => {
            const noteId = reqNumber(args, "noteId");
            const field = reqString(args, "field");
            const url = optString(args, "url");
            const filePath = optString(args, "path");
            const data = optString(args, "data");
            const sources = [url, filePath, data].filter(Boolean);
            if (sources.length !== 1)
                throw new Error("Provide exactly one of 'url', 'path' or 'data'.");
            const [note] = await client.note.notesInfo({ notes: [noteId] });
            if (!note)
                throw new Error(`Note ${noteId} not found.`);
            if (!(field in note.fields)) {
                throw new Error(`Field '${field}' not found. Fields: ${Object.keys(note.fields).join(", ")}.`);
            }
            const filename = optString(args, "filename") ?? mediaFileName(url ?? filePath ?? "image.png");
            const stored = await client.media.storeMediaFile({
                filename,
                ...(url ? { url } : filePath ? { path: filePath } : { data }),
            });
            const img = `<img src="${stored || filename}">`;
            const mode = optString(args, "mode") === "replace" ? "replace" : "append";
            const current = note.fields[field].value;
            const value = mode === "replace" || !current ? img : `${current}<br>${img}`;
            await client.note.updateNoteFields({ note: { id: noteId, fields: { [field]: value } } });
            return `Added image ${stored || filename} to '${field}' of note ${noteId}.`;
        },
    },
];
// Exported for tests.
export { addNotesWithReport, mediaFileName };
