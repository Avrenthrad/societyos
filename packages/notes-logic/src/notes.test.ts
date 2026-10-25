import { createEntity, type Person } from "@societyos/core";
import { linksFor, MemoryStore } from "@societyos/sync";
import { describe, expect, it } from "vitest";
import {
  autoMeetingNotes,
  checklist,
  connections,
  extractMentions,
  extractNoteLinks,
  extractTags,
  meetingNoteFor,
  newNote,
  openMeetingNote,
  preview,
  pullTaskStatus,
  saveNote,
  searchEverything,
  sendToToday,
  tagTree,
  toggleChecklist,
  toggleItem,
} from "./index.js";

const ctx = { ownerId: "u1", sourceApp: "notes" };
const person = (name: string): Person => createEntity("person", { ...ctx, sourceApp: "people", name, emails: [], phones: [] });

describe("reading a note", () => {
  it("finds nested tags, not headings, numbers or URL anchors", () => {
    expect(extractTags("# Heading\n#work/meetings and #Ideas, issue #12, see x.com/#anchor")).toEqual(["work/meetings", "ideas"]);
  });

  it("finds [[note links]]", () => {
    expect(extractNoteLinks("See [[Trip plan]] and [[ Budget ]]")).toEqual(["Trip plan", "Budget"]);
  });

  it("finds @mentions by full name, or first name when it is unique", () => {
    const sam = person("Sam Lee");
    const samB = person("Sam Brown");
    const ana = person("Ana Ruiz");
    const hits = extractMentions("Met @Sam Lee and @ana. Mail sam@example.com", [sam, samB, ana]);
    expect(hits.map((p) => p.name).sort()).toEqual(["Ana Ruiz", "Sam Lee"]);
    expect(extractMentions("@Sam said hi", [sam, samB])).toEqual([]); // two Sams: ambiguous
  });

  it("reads and toggles checklists without touching other lines", () => {
    const body = "Plan\n- [ ] Call Sam\n- [x] Book room\n- [ ] ";
    expect(checklist(body)).toEqual([
      { line: 1, text: "Call Sam", done: false },
      { line: 2, text: "Book room", done: true },
    ]);
    expect(toggleChecklist(body, 1)).toBe("Plan\n- [x] Call Sam\n- [x] Book room\n- [ ] ");
    expect(toggleChecklist(body, 0)).toBe(body);
  });

  it("previews the first real line without Markdown", () => {
    expect(preview("\n## Agenda\n- item")).toBe("Agenda");
    expect(preview("#meeting #work\n\nWhen: today")).toBe("When: today");
  });
});

describe("saving", () => {
  it("keeps tags and mention links in step with the text", async () => {
    const s = new MemoryStore();
    const sam = person("Sam Lee");
    await s.put(sam);
    const plan = newNote(ctx, { title: "Trip plan" });
    await s.put(plan);
    let n = newNote(ctx, { title: "Call" });
    await s.put(n);

    n = await saveNote(s, n, { body: "With @Sam Lee about [[trip plan]] #travel" }, ctx);
    expect(n.tags).toEqual(["travel"]);
    let c = await connections(s, n.id);
    expect(c.people.map((p) => p.name)).toEqual(["Sam Lee"]);
    expect(c.notes.map((x) => x.title)).toEqual(["Trip plan"]);
    expect((await connections(s, plan.id)).backlinks.map((x) => x.id)).toEqual([n.id]);

    n = await saveNote(s, n, { body: "Just me now" }, ctx);
    c = await connections(s, n.id);
    expect(c.people).toEqual([]);
    expect(c.notes).toEqual([]);
    expect(n.tags).toEqual([]);
  });

  it("builds a tag tree with counts", () => {
    const notes = [
      newNote(ctx, { body: "#work/meetings" }),
      newNote(ctx, { body: "#work/meetings #work" }),
      newNote(ctx, { body: "#home" }),
    ];
    const tree = tagTree(notes);
    expect(tree.map((t) => [t.path, t.count])).toEqual([["home", 1], ["work", 2]]);
    expect(tree[1]!.children.map((t) => [t.path, t.count])).toEqual([["work/meetings", 2]]);
  });
});

describe("checklists become Today tasks", () => {
  it("sends an item to Today once, and keeps both sides ticked together", async () => {
    const s = new MemoryStore();
    const sam = person("Sam Lee");
    await s.put(sam);
    let n = newNote(ctx, { title: "Standup", body: "- [ ] Send report to @Sam Lee" });
    await s.put(n);
    const item = checklist(n.body)[0]!;
    const now = new Date(2026, 9, 25, 9);

    const task = await sendToToday(s, n, item, ctx, now);
    expect(task.title).toBe("Send report to Sam Lee");
    expect((await linksFor(s, task.id)).map((l) => l.relation).sort()).toEqual(["created-from", "mentions"]);
    expect(new Date(task.dueAt!).getDate()).toBe(25);
    expect(await sendToToday(s, n, item, ctx, now)).toEqual(task); // no duplicate
    expect(await s.list("task")).toHaveLength(1);

    n = await toggleItem(s, n, item, ctx, now);
    expect(n.body).toBe("- [x] Send report to @Sam Lee");
    expect((await s.get("task", task.id))!.status).toBe("done");

    // Reopen in the note, then finish it in Today: the note follows.
    n = await toggleItem(s, n, checklist(n.body)[0]!, ctx, now);
    expect((await s.get("task", task.id))!.status).toBe("open");
    await s.put({ ...(await s.get("task", task.id))!, status: "done" });
    n = await pullTaskStatus(s, n, ctx);
    expect(n.body).toBe("- [x] Send report to @Sam Lee");
  });
});

describe("meeting notes", () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 25, h, m);
  const event = (title: string, s: Date, e: Date, attendeeIds: string[] = []) =>
    createEntity("event", { ...ctx, sourceApp: "today", title, startsAt: s.toISOString(), endsAt: e.toISOString(), attendeeIds, location: "Room 2" });

  it("makes a note linked to the event and its people", async () => {
    const s = new MemoryStore();
    const sam = person("Sam Lee");
    await s.put(sam);
    const ev = event("Design review", at(10), at(11), [sam.id]);
    await s.put(ev);
    const n = await openMeetingNote(s, ev, ctx);
    expect(n.title).toBe("Design review – Sun 25 Oct");
    expect(n.body).toContain("**When:** Sun 25 Oct, 10:00–11:00");
    expect(n.body).toContain("**Where:** Room 2");
    expect(n.body).toContain("@Sam Lee");
    expect(n.tags).toEqual(["meeting"]);
    const c = await connections(s, n.id);
    expect(c.event?.id).toBe(ev.id);
    expect(c.people.map((p) => p.id)).toEqual([sam.id]);
    expect((await openMeetingNote(s, ev, ctx)).id).toBe(n.id); // same note next time
  });

  it("makes notes on its own for meetings about to start, once each", async () => {
    const s = new MemoryStore();
    const soon = event("Standup", at(9, 5), at(9, 20));
    const later = event("Lunch", at(12), at(13));
    const over = event("Early", at(7), at(8));
    for (const e of [soon, later, over]) await s.put(e);

    const made = await autoMeetingNotes(s, ctx, at(9));
    expect(made.map((n) => n.title)).toEqual(["Standup – Sun 25 Oct"]);
    expect(await autoMeetingNotes(s, ctx, at(9, 1))).toEqual([]);

    // Deleted on purpose: not made again.
    await s.remove("note", made[0]!.id);
    expect(await autoMeetingNotes(s, ctx, at(9, 2))).toEqual([]);
    expect(await meetingNoteFor(s, soon.id)).toBeUndefined();
  });
});

describe("search across apps", () => {
  it("needs every word, ranks titles and whole words first", async () => {
    const s = new MemoryStore();
    const now = new Date();
    await s.put(newNote(ctx, { title: "Dentist", body: "Ask about the crown" }));
    await s.put(newNote(ctx, { title: "Groceries", body: "toothpaste for the dentist trip" }));
    await s.put(createEntity("task", { ...ctx, sourceApp: "today", title: "Book dentist", status: "open", priority: 0 }));
    await s.put(createEntity("event", { ...ctx, sourceApp: "today", title: "Dentists conference", startsAt: now.toISOString(), endsAt: now.toISOString(), attendeeIds: [] }));
    await s.put(person("Sam Lee"));

    const hits = await searchEverything(s, "dentist", now);
    expect(hits.map((h) => h.title)).toEqual(["Dentist", "Book dentist", "Dentists conference", "Groceries"]);
    expect(hits.map((h) => h.app)).toEqual(["Notes", "Today", "Today", "Notes"]);
    expect(hits[3]!.snippet).toBe("toothpaste for the dentist trip");

    expect((await searchEverything(s, "crown dentist", now)).map((h) => h.title)).toEqual(["Dentist"]);
    expect((await searchEverything(s, "sam", now)).map((h) => h.app)).toEqual(["People"]);
    expect(await searchEverything(s, "   ", now)).toEqual([]);
  });
});
