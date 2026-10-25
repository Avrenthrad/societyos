import { createEntity } from "@societyos/core";
import { describe, expect, it } from "vitest";
import { PersistedStore, type KeyValue } from "./persisted-store.js";

const base = { ownerId: "u1", sourceApp: "test" };
const memoryKv = (): KeyValue & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe("PersistedStore", () => {
  it("survives a reload, deletes included", async () => {
    const kv = memoryKv();
    const a = new PersistedStore(kv);
    const keep = createEntity("task", { ...base, title: "Keep", status: "open", priority: 0 });
    const gone = createEntity("task", { ...base, title: "Gone", status: "open", priority: 0 });
    await a.put(keep);
    await a.put(gone);
    await a.remove("task", gone.id);
    await a.flush();

    const b = new PersistedStore(kv);
    expect(await b.load()).toBe(2);
    expect((await b.list("task")).map((t) => t.title)).toEqual(["Keep"]);
  });

  it("saves on its own after a change", async () => {
    const kv = memoryKv();
    const s = new PersistedStore(kv, "k", 1);
    await s.put(createEntity("note", { ...base, title: "x", body: "", tags: [], pinned: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(JSON.parse(kv.data.get("k")!)).toHaveLength(1);
  });

  it("starts empty if the save is unreadable", async () => {
    const kv = memoryKv();
    kv.data.set("k", "{not json");
    expect(await new PersistedStore(kv, "k").load()).toBe(0);
  });

  it("two apps sharing storage never wipe each other's rows", async () => {
    const kv = memoryKv();
    const today = new PersistedStore(kv);
    const finance = new PersistedStore(kv);
    await today.put(createEntity("task", { ...base, title: "From Today", status: "open", priority: 0 }));
    await today.flush();
    await finance.put(createEntity("task", { ...base, title: "Pay rent", status: "open", priority: 0 }));
    await finance.flush();
    const saved = JSON.parse(kv.data.get("societyos:store:v1")!) as { title: string }[];
    expect(saved.map((t) => t.title).sort()).toEqual(["From Today", "Pay rent"]);
    // Today hears about Finance's task without a reload.
    const seen: string[] = [];
    today.subscribe((c) => seen.push((c.entity as { title: string }).title));
    expect(await today.refresh()).toBe(1);
    expect(seen).toEqual(["Pay rent"]);
  });
});
