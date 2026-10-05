import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { YankiConnect } from "yanki-connect";
import { createServer } from "../src/server.js";

/** Minimal fake of the parts of YankiConnect the tests touch. */
function fakeAnki() {
  return {
    card: {
      findCards: vi.fn(async () => [11, 12, 13]),
      cardsInfo: vi.fn(async ({ cards }: { cards: number[] }) =>
        cards.map((cardId) => ({
          cardId,
          note: cardId * 10,
          deckName: "Deck",
          modelName: "Basic",
          question: "<div>Q</div>",
          answer: "<div>Q</div><hr>A",
          fields: { Front: { order: 0, value: "Q" } },
          interval: 4,
          due: 1,
          queue: 2,
          reps: 3,
          lapses: 0,
          nextReviews: ["<10m", "2d", "4d", "8d"],
        }))
      ),
      suspend: vi.fn(async () => true),
      answerCards: vi.fn(async ({ answers }: { answers: unknown[] }) => answers.map(() => true)),
    },
    note: {
      findNotes: vi.fn(async () => [101, 102]),
      notesInfo: vi.fn(async ({ notes }: { notes: number[] }) =>
        notes.map((noteId) => ({
          noteId,
          modelName: "Basic",
          tags: [],
          fields: { Front: { order: 0, value: `front ${noteId}` } },
        }))
      ),
      deleteNotes: vi.fn(async () => null),
      canAddNotesWithErrorDetail: vi.fn(async ({ notes }: { notes: unknown[] }) =>
        notes.map((_, i) => (i === 1 ? { canAdd: false, error: "cannot create note because it is a duplicate" } : { canAdd: true }))
      ),
      addNotes: vi.fn(async ({ notes }: { notes: unknown[] }) => notes.map((_, i) => 500 + i)),
    },
    deck: {
      deckNames: vi.fn(async () => {
        throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
      }),
    },
  };
}

async function connect(anki: ReturnType<typeof fakeAnki>) {
  const server = createServer(() => anki as unknown as YankiConnect);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as { type: string; text: string }[])[0].text;
}

describe("MCP server", () => {
  let anki: ReturnType<typeof fakeAnki>;
  let client: Client;

  beforeEach(async () => {
    anki = fakeAnki();
    client = await connect(anki);
  });

  it("lists well-formed tools with annotations", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of ["suspend_cards", "manage_tags", "find_leeches", "get_study_overview", "delete_notes"]) {
      expect(names).toContain(name);
    }
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBeTypeOf("boolean");
      for (const req of tool.inputSchema.required ?? []) {
        expect(tool.inputSchema.properties, `${tool.name}.${req}`).toHaveProperty(req);
      }
    }
  });

  it("sends usage instructions and prompts", async () => {
    expect(client.getInstructions()).toMatch(/HTML/);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(["quiz_me", "make_cards", "leech_review"]);
    const prompt = await client.getPrompt({ name: "quiz_me", arguments: { deck: "Spanish" } });
    expect((prompt.messages[0].content as { text: string }).text).toMatch(/deckName "Spanish"/);
  });

  it("suspend_cards dryRun previews without writing", async () => {
    const result = await client.callTool({
      name: "suspend_cards",
      arguments: { deckName: "Deck", tags: ["x"], dryRun: true },
    });
    expect(text(result)).toMatch(/would suspend 3 cards/);
    expect(anki.card.findCards).toHaveBeenCalledWith({ query: '"deck:Deck" "tag:x" -is:suspended' });
    expect(anki.card.suspend).not.toHaveBeenCalled();
  });

  it("delete_notes requires the preview token", async () => {
    const preview = JSON.parse(text(await client.callTool({ name: "delete_notes", arguments: { tags: ["old"] } })));
    expect(preview.notesToDelete).toBe(2);
    expect(anki.note.deleteNotes).not.toHaveBeenCalled();

    const bad = await client.callTool({ name: "delete_notes", arguments: { tags: ["old"], confirmToken: "nope" } });
    expect(bad.isError).toBe(true);

    await client.callTool({ name: "delete_notes", arguments: { tags: ["old"], confirmToken: preview.confirmToken } });
    expect(anki.note.deleteNotes).toHaveBeenCalledWith({ notes: [101, 102] });
  });

  it("add_bulk skips duplicates and reports why", async () => {
    const note = { modelName: "Basic", fields: { Front: "a", Back: "b" } };
    const result = JSON.parse(text(await client.callTool({ name: "add_bulk", arguments: { notes: [note, note, note] } })));
    expect(result.added).toBe(2);
    expect(result.rejected).toEqual([expect.objectContaining({ index: 1, reason: expect.stringMatching(/duplicate/) })]);
  });

  it("find_cards pages results and only fetches that page", async () => {
    const result = JSON.parse(text(await client.callTool({ name: "find_cards", arguments: { query: "deck:X", limit: 2 } })));
    expect(result).toMatchObject({ total: 3, returned: 2, hasMore: true });
    expect(anki.card.cardsInfo).toHaveBeenCalledWith({ cards: [11, 12] });
    expect(result.cards[0]).toEqual({ cardId: 11, noteId: 110, deckName: "Deck", modelName: "Basic", question: "Q", answer: "A" });
  });

  it("get_due_cards exposes the interval of each button", async () => {
    const result = JSON.parse(text(await client.callTool({ name: "get_due_cards", arguments: { num: 1 } })));
    expect(result.cards[0].nextIntervals).toEqual({ Again: "<10m", Hard: "2d", Good: "4d", Easy: "8d" });
  });

  it("returns readable errors as tool results", async () => {
    const invalid = await client.callTool({ name: "answer_cards", arguments: { answers: [{ cardId: 1, ease: 7 }] } });
    expect(invalid.isError).toBe(true);
    expect(text(invalid)).toMatch(/use 1-4/);

    const offline = await client.callTool({ name: "get_deck_names", arguments: {} });
    expect(offline.isError).toBe(true);
    expect(text(offline)).toMatch(/open Anki/);
  });
});

describe("move_cards", () => {
  it("moves from a subdeck to its parent", async () => {
    const anki = fakeAnki();
    Object.assign(anki.deck, { changeDeck: vi.fn(async () => null) });
    const client = await connect(anki);
    await client.callTool({ name: "move_cards", arguments: { deckName: "A::B", targetDeck: "A" } });
    expect(anki.card.findCards).toHaveBeenCalledWith({ query: '"deck:A::B"' });
    expect((anki.deck as unknown as { changeDeck: ReturnType<typeof vi.fn> }).changeDeck).toHaveBeenCalledWith({
      cards: [11, 12, 13],
      deck: "A",
    });
  });
});

describe("named pauses", () => {
  it("tags what it suspends and resumes only that group", async () => {
    const anki = fakeAnki();
    Object.assign(anki.card, {
      cardsToNotes: vi.fn(async () => [110, 120]),
      unsuspend: vi.fn(async () => true),
    });
    Object.assign(anki.note, { addTags: vi.fn(async () => null), removeTags: vi.fn(async () => null) });
    const card = anki.card as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const note = anki.note as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const client = await connect(anki);

    await client.callTool({ name: "suspend_cards", arguments: { tags: ["HSK5"], label: "hsk 5-6" } });
    expect(card.suspend).toHaveBeenCalledWith({ cards: [11, 12, 13] });
    expect(note.addTags).toHaveBeenCalledWith({ notes: [110, 120], tags: "paused::hsk-5-6" });

    await client.callTool({ name: "unsuspend_cards", arguments: { label: "hsk 5-6" } });
    expect(card.findCards).toHaveBeenLastCalledWith({ query: '"tag:paused::hsk-5-6" is:suspended' });
    expect(card.unsuspend).toHaveBeenCalledWith({ cards: [11, 12, 13] });
    expect(note.removeTags).toHaveBeenCalledWith({ notes: [101, 102], tags: "paused::hsk-5-6" });
  });
});
