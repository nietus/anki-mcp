import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { YankiConnect } from "yanki-connect";
import { ToolArgs } from "../args.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, object>;
    required?: string[];
  };
  annotations?: ToolAnnotations;
  /** Returns plain text, or any value that is sent back as JSON. */
  handler: (args: ToolArgs, client: YankiConnect) => Promise<unknown>;
}

/** Annotation presets, so clients can auto-approve reads and confirm writes. */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
};

export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

export const IDEMPOTENT_WRITE: ToolAnnotations = {
  ...WRITE,
  idempotentHint: true,
};

export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};
