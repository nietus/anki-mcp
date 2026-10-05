/**
 * Cleans an HTML string from a card field by removing style tags,
 * replacing divs with newlines, stripping all other HTML tags,
 * removing Anki-specific [anki:play:] tags, converting HTML entities,
 * and trimming whitespace.
 * @param htmlString - The HTML string to clean.
 * @returns A cleaned string with basic formatting preserved.
 */
export function cleanWithRegex(htmlString) {
    return (htmlString
        // Remove style tags and their content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        // Replace divs and line breaks with newlines
        .replace(/<div[^>]*>/g, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        // Remove all HTML tags
        .replace(/<[^>]+>/g, " ")
        // Remove anki play tags
        .replace(/\[anki:play:[^\]]+\]/g, "")
        // Convert HTML entities
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        // Clean up whitespace but preserve newlines
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter((line) => line.length > 0)
        .join("\n"));
}
/** Truncates long text so a single card can't blow up the agent's context. */
export function truncate(text, max = 600) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
/**
 * On most note types the answer side repeats the question (`{{FrontSide}}`).
 * Returns only the part that is new on the answer side.
 */
export function answerOnly(question, answer) {
    if (question && answer.startsWith(question)) {
        const rest = answer.slice(question.length).trim();
        if (rest.length > 0)
            return rest;
    }
    return answer;
}
/**
 * Formats an AnkiConnect interval: positive values are days, negative values
 * are seconds (learning cards).
 */
export function formatInterval(interval) {
    if (interval === 0)
        return "new";
    if (interval < 0) {
        const seconds = -interval;
        if (seconds < 3600)
            return `${Math.round(seconds / 60)}m`;
        return `${Math.round(seconds / 3600)}h`;
    }
    if (interval < 30)
        return `${interval}d`;
    if (interval < 365)
        return `${(interval / 30).toFixed(1)}mo`;
    return `${(interval / 365).toFixed(1)}y`;
}
const QUEUE_LABELS = {
    [-3]: "buried",
    [-2]: "buried",
    [-1]: "suspended",
    0: "new",
    1: "learning",
    2: "review",
    3: "learning",
    4: "preview",
};
export function queueLabel(queue) {
    return QUEUE_LABELS[queue] ?? "unknown";
}
export const EASE_LABELS = ["Again", "Hard", "Good", "Easy"];
/** Runs `worker` over `items` with at most `concurrency` calls in flight. */
export async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let next = 0;
    async function run() {
        while (next < items.length) {
            const index = next++;
            results[index] = await worker(items[index], index);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
    return results;
}
/** Splits an array into chunks, to keep individual AnkiConnect requests small. */
export function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}
