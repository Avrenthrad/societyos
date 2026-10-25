import { createEntity } from "@societyos/core";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store.js";
import { link, linksFor } from "./links.js";

const base = { ownerId: "u1", sourceApp: "test" };

describe("MemoryStore", () => {
  it("puts, lists and soft-deletes", async () => {
    const s = new MemoryStore();
    const t = createEntity("task", { ...base, title: "Buy milk", done: false, priority: 1 });
    await s.put(t);
    expect(await s.list("task")).toHaveLength(1);
    await s.remove("task", t.id);
    expect(await s.get("task", t.id)).toBeUndefined();
  });

  it("tells subscribers about changes from any app", async () => {
    const s = new MemoryStore();
    const seen: string[] = [];
    s.subscribe((c) => seen.push(`${c.op}:${c.entity.type}`));
    await s.put(createEntity("note", { ...base, title: "x", body: "", tags: [], pinned: false }));
    expect(seen).toEqual(["put:note"]);
  });

  it("ignores stale remote changes (last write wins)", async () => {
    const s = new MemoryStore();
    const n = createEntity("note", { ...base, title: "new", body: "", tags: [], pinned: false });
    await s.put(n);
    const stale = { ...n, title: "old", updatedAt: "2000-01-01T00:00:00.000Z" };
    expect(await s.applyRemote(stale)).toBe(false);
    expect((await s.get("note", n.id))?.title).toBe("new");
  });

  it("links entities across apps", async () => {
    const s = new MemoryStore();
    const msg = createEntity("message", {
      ...base, channel: "email", threadId: "t1", fromId: "p1", toIds: [], body: "Can you send the report?", read: false,
    });
    const task = createEntity("task", { ...base, title: "Send report", done: false, priority: 2 });
    await link(s, task, msg, "created-from", base);
    expect(await linksFor(s, msg.id)).toHaveLength(1);
  });
});

describe("searchAll", () => {
  it("finds matches across apps", async () => {
    const { searchAll } = await import("./search.js");
    const s = new MemoryStore();
    await s.put(createEntity("note", { ...base, title: "Dentist notes", body: "", tags: [], pinned: false }));
    await s.put(createEntity("task", { ...base, title: "Book dentist", done: false, priority: 1 }));
    await s.put(createEntity("task", { ...base, title: "Groceries", done: false, priority: 0 }));
    const hits = await searchAll(s, "dentist");
    expect(hits.map((h) => h.type).sort()).toEqual(["note", "task"]);
  });
});
