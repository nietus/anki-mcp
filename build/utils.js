/**
 * Cleans an HTML string from a card field by removing style tags,
 * replacing divs with newlines, stripping all other HTML tags,
 * removing Anki-specific [anki:play:] tags, converting HTML entities,
 * and trimming whitespace.
 * @param htmlString - The HTML string to clean.
 * @returns A cleaned string with basic formatting preserved.
 */
export function cleanWithRegex(htmlString) {
    return htmlString
        // Remove style tags and their content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        // Replace divs with newlines
        .replace(/<div[^>]*>/g, '\n')
        // Remove all HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Remove anki play tags
        .replace(/\[anki:play:[^\]]+\]/g, '')
        // Convert HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        // Clean up whitespace but preserve newlines
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
}
