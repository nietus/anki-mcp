/**
 * Small helpers to read and validate tool arguments. Tool inputs arrive as
 * untyped JSON, so every handler goes through these instead of casting.
 */
export function optString(args, key) {
    const value = args[key];
    if (value === undefined || value === null || value === "")
        return undefined;
    if (typeof value !== "string") {
        throw new Error(`'${key}' must be a string.`);
    }
    return value;
}
export function reqString(args, key) {
    const value = optString(args, key);
    if (value === undefined)
        throw new Error(`'${key}' is required.`);
    return value;
}
export function optNumber(args, key, opts = {}) {
    const value = args[key];
    if (value === undefined || value === null || value === "")
        return undefined;
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num))
        throw new Error(`'${key}' must be a number.`);
    if (opts.min !== undefined && num < opts.min) {
        throw new Error(`'${key}' must be >= ${opts.min}.`);
    }
    if (opts.max !== undefined && num > opts.max) {
        throw new Error(`'${key}' must be <= ${opts.max}.`);
    }
    return num;
}
export function reqNumber(args, key, opts = {}) {
    const value = optNumber(args, key, opts);
    if (value === undefined)
        throw new Error(`'${key}' is required.`);
    return value;
}
export function optBool(args, key, fallback = false) {
    const value = args[key];
    if (value === undefined || value === null)
        return fallback;
    if (typeof value === "boolean")
        return value;
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    throw new Error(`'${key}' must be a boolean.`);
}
export function optStringArray(args, key) {
    const value = args[key];
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value))
        throw new Error(`'${key}' must be an array.`);
    return value.map(String).filter((s) => s.length > 0);
}
export function optNumberArray(args, key) {
    const value = args[key];
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value))
        throw new Error(`'${key}' must be an array.`);
    return value.map((v) => {
        const num = Number(v);
        if (!Number.isFinite(num)) {
            throw new Error(`'${key}' must only contain numbers.`);
        }
        return num;
    });
}
export function optStringRecord(args, key) {
    const value = args[key];
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`'${key}' must be an object.`);
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [
        k,
        String(v ?? ""),
    ]));
}
export function reqStringRecord(args, key) {
    const value = optStringRecord(args, key);
    if (!value || Object.keys(value).length === 0) {
        throw new Error(`'${key}' is required and cannot be empty.`);
    }
    return value;
}
export function optEnum(args, key, allowed) {
    const value = optString(args, key);
    if (value === undefined)
        return undefined;
    if (!allowed.includes(value)) {
        throw new Error(`'${key}' must be one of: ${allowed.join(", ")}.`);
    }
    return value;
}
export function reqEnum(args, key, allowed) {
    const value = optEnum(args, key, allowed);
    if (value === undefined) {
        throw new Error(`'${key}' is required (one of: ${allowed.join(", ")}).`);
    }
    return value;
}
