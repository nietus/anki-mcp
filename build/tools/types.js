/** Annotation presets, so clients can auto-approve reads and confirm writes. */
export const READ_ONLY = {
    readOnlyHint: true,
    openWorldHint: false,
};
export const WRITE = {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
};
export const IDEMPOTENT_WRITE = {
    ...WRITE,
    idempotentHint: true,
};
export const DESTRUCTIVE = {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
};
