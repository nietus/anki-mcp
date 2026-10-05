/**
 * Small helpers to read and validate tool arguments. Tool inputs arrive as
 * untyped JSON, so every handler goes through these instead of casting.
 */

export type ToolArgs = Record<string, unknown>;

export function optString(args: ToolArgs, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new Error(`'${key}' must be a string.`);
  }
  return value;
}

export function reqString(args: ToolArgs, key: string): string {
  const value = optString(args, key);
  if (value === undefined) throw new Error(`'${key}' is required.`);
  return value;
}

export function optNumber(
  args: ToolArgs,
  key: string,
  opts: { min?: number; max?: number } = {}
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") return undefined;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) throw new Error(`'${key}' must be a number.`);
  if (opts.min !== undefined && num < opts.min) {
    throw new Error(`'${key}' must be >= ${opts.min}.`);
  }
  if (opts.max !== undefined && num > opts.max) {
    throw new Error(`'${key}' must be <= ${opts.max}.`);
  }
  return num;
}

export function reqNumber(
  args: ToolArgs,
  key: string,
  opts: { min?: number; max?: number } = {}
): number {
  const value = optNumber(args, key, opts);
  if (value === undefined) throw new Error(`'${key}' is required.`);
  return value;
}

export function optBool(args: ToolArgs, key: string, fallback = false): boolean {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`'${key}' must be a boolean.`);
}

export function optStringArray(args: ToolArgs, key: string): string[] {
  const value = args[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`'${key}' must be an array.`);
  return value.map(String).filter((s) => s.length > 0);
}

export function optNumberArray(args: ToolArgs, key: string): number[] {
  const value = args[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`'${key}' must be an array.`);
  return value.map((v) => {
    const num = Number(v);
    if (!Number.isFinite(num)) {
      throw new Error(`'${key}' must only contain numbers.`);
    }
    return num;
  });
}

export function optStringRecord(
  args: ToolArgs,
  key: string
): Record<string, string> | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`'${key}' must be an object.`);
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      String(v ?? ""),
    ])
  );
}

export function reqStringRecord(
  args: ToolArgs,
  key: string
): Record<string, string> {
  const value = optStringRecord(args, key);
  if (!value || Object.keys(value).length === 0) {
    throw new Error(`'${key}' is required and cannot be empty.`);
  }
  return value;
}

export function optEnum<T extends string>(
  args: ToolArgs,
  key: string,
  allowed: readonly T[]
): T | undefined {
  const value = optString(args, key);
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) {
    throw new Error(`'${key}' must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function reqEnum<T extends string>(
  args: ToolArgs,
  key: string,
  allowed: readonly T[]
): T {
  const value = optEnum(args, key, allowed);
  if (value === undefined) {
    throw new Error(`'${key}' is required (one of: ${allowed.join(", ")}).`);
  }
  return value;
}
