import { GetPromptRequestSchema, ListPromptsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
function deckClause(deck) {
    return deck ? ` from the deck "${deck}"` : "";
}
export const prompts = [
    {
        name: "quiz_me",
        description: "Run a study session: quiz due cards one at a time and record the answers in Anki.",
        arguments: [
            { name: "deck", description: "Deck to study (optional, default: all decks)." },
            { name: "count", description: "How many cards (optional, default 10)." },
        ],
        build: ({ deck, count }) => `Quiz me on my Anki cards${deckClause(deck)}.

1. Call get_study_overview${deck ? ` with deckNames ["${deck}"]` : ""} and tell me in one line what's due today.
2. Call get_due_cards with num ${Number(count) || 10}${deck ? ` and deckName "${deck}"` : ""}. If none are due, offer new cards (get_new_cards).
3. Ask ONE question at a time. Never show the answer before I reply.
4. Grade my reply against the answer: 1 = wrong/blank, 2 = right but hard, 3 = right, 4 = instant and perfect. Tell me the correct answer briefly and the interval I'll get (from nextIntervals).
5. Record grades with answer_cards (you can batch a few at a time).
6. If I keep missing a card, offer to rewrite it or add a mnemonic with update_note_fields.
7. At the end, summarise how I did.`,
    },
    {
        name: "make_cards",
        description: "Turn a text, article or notes into good flashcards.",
        arguments: [
            { name: "text", description: "The material to turn into cards.", required: true },
            { name: "deck", description: "Target deck (optional)." },
        ],
        build: ({ text, deck }) => `Create Anki flashcards from the material below${deck ? ` in the deck "${deck}"` : ""}.

Rules:
- One fact per card (atomic); short questions, short answers.
- Prefer cloze deletions (add_cloze_cards) for definitions and facts inside sentences; use basic Q/A cards for concepts.
- ${deck ? `Call get_deck_model_info for "${deck}" first to use its note type and field names.` : "Ask me which deck to use if it isn't obvious."}
- Show me the proposed cards first. After I approve, add them with add_bulk / add_cloze_cards using dryRun first to catch duplicates.

Material:
${text ?? ""}`,
    },
    {
        name: "leech_review",
        description: "Find the cards I keep forgetting and help fix them.",
        arguments: [{ name: "deck", description: "Deck to check (optional)." }],
        build: ({ deck }) => `Help me with the cards I keep forgetting${deckClause(deck)}.

1. Call find_leeches${deck ? ` with deckName "${deck}"` : ""}.
2. For the worst ones, call get_card_history to see the pattern.
3. Explain why each card is probably hard (too long, ambiguous, interference with a similar card...).
4. Propose a rewrite, a split into smaller cards, or a mnemonic. Apply only the changes I approve (update_note_fields / add_bulk).
5. Offer to unsuspend fixed leeches (unsuspend_cards) and remove the "leech" tag (manage_tags).`,
    },
];
export function registerPromptHandlers(server) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
        prompts: prompts.map(({ name, description, arguments: args }) => ({
            name,
            description,
            arguments: args,
        })),
    }));
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const prompt = prompts.find((p) => p.name === request.params.name);
        if (!prompt)
            throw new Error(`Unknown prompt: ${request.params.name}`);
        const args = request.params.arguments ?? {};
        for (const arg of prompt.arguments) {
            if (arg.required && !args[arg.name]) {
                throw new Error(`Missing required argument '${arg.name}'.`);
            }
        }
        return {
            description: prompt.description,
            messages: [
                {
                    role: "user",
                    content: { type: "text", text: prompt.build(args) },
                },
            ],
        };
    });
}
