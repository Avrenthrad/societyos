import { describe, expect, it } from "vitest";
import { createEntity } from "./factory.js";

describe("createEntity", () => {
  it("fills id and timestamps", () => {
    const now = new Date("2026-10-23T00:00:00Z");
    const note = createEntity(
      "note",
      { ownerId: "u1", sourceApp: "notes", title: "Hi", body: "", tags: [], pinned: false },
      now,
    );
    expect(note.type).toBe("note");
    expect(note.id).toMatch(/[0-9a-f-]{36}/);
    expect(note.createdAt).toBe(now.toISOString());
    expect(note.updatedAt).toBe(note.createdAt);
  });
});
