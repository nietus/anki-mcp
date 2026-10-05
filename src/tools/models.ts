import { YankiConnect } from "yanki-connect";
import { optBool, optNumber, optString, reqEnum, reqString } from "../args.js";
import { DESTRUCTIVE, IDEMPOTENT_WRITE, READ_ONLY, ToolDef, WRITE } from "./types.js";

export async function modelDetails(client: YankiConnect, modelName: string) {
  const [fieldNames, templates, css] = await Promise.all([
    client.model.modelFieldNames({ modelName }),
    client.model.modelTemplates({ modelName }),
    client.model.modelStyling({ modelName }),
  ]);
  return { modelName, fieldNames, templates, css };
}

const FIELD_ACTIONS = ["add", "remove", "rename", "reposition"] as const;

export const modelTools: ToolDef[] = [
  {
    name: "get_model_names",
    description: "List all note type (model) names.",
    inputSchema: { type: "object", properties: {} },
    annotations: READ_ONLY,
    handler: async (_args, client) => client.model.modelNames(),
  },
  {
    name: "get_model_details",
    description: "Fields, card templates and CSS of a note type.",
    inputSchema: {
      type: "object",
      properties: { modelName: { type: "string" } },
      required: ["modelName"],
    },
    annotations: READ_ONLY,
    handler: async (args, client) => modelDetails(client, reqString(args, "modelName")),
  },
  {
    name: "edit_note_type_field",
    description:
      "Add, remove, rename or reposition a field of a note type. 'remove' deletes that field's content from every note of the type.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: [...FIELD_ACTIONS] },
        modelName: { type: "string" },
        fieldName: { type: "string", description: "Field to act on (the current name when renaming)." },
        newFieldName: { type: "string", description: "For rename." },
        index: { type: "number", description: "For add (optional) and reposition: 0-based position." },
      },
      required: ["action", "modelName", "fieldName"],
    },
    annotations: DESTRUCTIVE,
    handler: async (args, client) => {
      const action = reqEnum(args, "action", FIELD_ACTIONS);
      const modelName = reqString(args, "modelName");
      const fieldName = reqString(args, "fieldName");
      const fields = await client.model.modelFieldNames({ modelName });
      const exists = fields.includes(fieldName);

      switch (action) {
        case "add": {
          if (exists) throw new Error(`Field '${fieldName}' already exists in '${modelName}'.`);
          const index = optNumber(args, "index", { min: 0, max: fields.length }) ?? fields.length;
          await client.model.modelFieldAdd({ modelName, fieldName, index });
          return `Added field '${fieldName}' to '${modelName}' at position ${index}.`;
        }
        case "remove": {
          if (!exists) throw new Error(`Field '${fieldName}' does not exist in '${modelName}'.`);
          await client.model.modelFieldRemove({ modelName, fieldName });
          return `Removed field '${fieldName}' from '${modelName}'.`;
        }
        case "rename": {
          const newFieldName = reqString(args, "newFieldName");
          if (!exists) throw new Error(`Field '${fieldName}' does not exist in '${modelName}'.`);
          if (fields.includes(newFieldName) && newFieldName !== fieldName) {
            throw new Error(`Field '${newFieldName}' already exists in '${modelName}'.`);
          }
          await client.model.modelFieldRename({ modelName, oldFieldName: fieldName, newFieldName });
          return `Renamed '${fieldName}' → '${newFieldName}' in '${modelName}'.`;
        }
        case "reposition": {
          if (!exists) throw new Error(`Field '${fieldName}' does not exist in '${modelName}'.`);
          const index = optNumber(args, "index", { min: 0, max: fields.length - 1 });
          if (index === undefined) throw new Error("'index' is required for reposition.");
          await client.model.modelFieldReposition({ modelName, fieldName, index });
          return `Moved '${fieldName}' to position ${index} in '${modelName}'.`;
        }
      }
    },
  },
  {
    name: "update_note_type_templates",
    description: "Replace the Front/Back HTML of card templates of a note type.",
    inputSchema: {
      type: "object",
      properties: {
        modelName: { type: "string" },
        templates: {
          type: "object",
          description: 'Template name → {Front, Back}, e.g. {"Card 1": {"Front": "...", "Back": "..."}}.',
          additionalProperties: {
            type: "object",
            properties: { Front: { type: "string" }, Back: { type: "string" } },
            required: ["Front", "Back"],
          },
        },
      },
      required: ["modelName", "templates"],
    },
    annotations: { ...DESTRUCTIVE, idempotentHint: true },
    handler: async (args, client) => {
      const modelName = reqString(args, "modelName");
      const templates = args.templates as Record<string, { Front: string; Back: string }>;
      if (!templates || typeof templates !== "object" || Object.keys(templates).length === 0) {
        throw new Error("'templates' is required.");
      }
      await client.model.updateModelTemplates({ model: { name: modelName, templates } });
      return `Updated templates of '${modelName}'.`;
    },
  },
  {
    name: "update_note_type_styling",
    description: "Replace the CSS of a note type.",
    inputSchema: {
      type: "object",
      properties: { modelName: { type: "string" }, css: { type: "string" } },
      required: ["modelName", "css"],
    },
    annotations: IDEMPOTENT_WRITE,
    handler: async (args, client) => {
      const modelName = reqString(args, "modelName");
      const css = typeof args.css === "string" ? args.css : "";
      await client.model.updateModelStyling({ model: { name: modelName, css } });
      return `Updated styling of '${modelName}'.`;
    },
  },
  {
    name: "create_model",
    description: "Create a new note type.",
    inputSchema: {
      type: "object",
      properties: {
        modelName: { type: "string" },
        fieldNames: { type: "array", items: { type: "string" } },
        cardTemplates: {
          type: "array",
          items: {
            type: "object",
            properties: { Name: { type: "string" }, Front: { type: "string" }, Back: { type: "string" } },
            required: ["Name", "Front", "Back"],
          },
        },
        css: { type: "string" },
        isCloze: { type: "boolean", description: "Default false." },
      },
      required: ["modelName", "fieldNames", "cardTemplates"],
    },
    annotations: WRITE,
    handler: async (args, client) => {
      const modelName = reqString(args, "modelName");
      const fieldNames = Array.isArray(args.fieldNames) ? args.fieldNames.map(String) : [];
      const cardTemplates = Array.isArray(args.cardTemplates)
        ? (args.cardTemplates as { Name: string; Front: string; Back: string }[])
        : [];
      if (fieldNames.length === 0 || cardTemplates.length === 0) {
        throw new Error("'fieldNames' and 'cardTemplates' must be non-empty.");
      }
      await client.model.createModel({
        modelName,
        inOrderFields: fieldNames,
        css: optString(args, "css") ?? "",
        isCloze: optBool(args, "isCloze"),
        cardTemplates: cardTemplates.map(({ Name, Front, Back }) => ({ Name, Front, Back })),
      });
      return `Created note type '${modelName}'.`;
    },
  },
];
