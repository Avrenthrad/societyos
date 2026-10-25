import { describe, expect, it } from "vitest";
import { parseAddressList, baseSubject, formatAddress } from "./address.js";
import { demoMailbox, DEMO_WORK } from "./demo.js";
import {
  applyOps,
  draftFromMessage,
  folderCounts,
  listThreads,
  mergeRemote,
  recordSent,
  replyDraft,
  saveDraft,
  setTab,
  snoozeOptions,
  threadOps,
  wakeSnoozed,
} from "./mailbox.js";
import { parseQuery } from "./search.js";

const now = new Date(2026, 9, 25, 10, 0);
const box = () => demoMailbox(now);
const subjects = (ts: { subject: string }[]) => ts.map((t) => t.subject);

describe("addresses", () => {
  it("parses lists with names, quotes and junk", () => {
    expect(parseAddressList('Sam Lee <Sam@Example.com>, "Lee, Pat" <pat@x.io>; bob@y.com, nonsense')).toEqual([
      { name: "Sam Lee", email: "sam@example.com" },
      { name: "Lee, Pat", email: "pat@x.io" },
      { email: "bob@y.com" },
    ]);
    expect(formatAddress({ name: "Lee, Pat", email: "pat@x.io" })).toBe('"Lee, Pat" <pat@x.io>');
    expect(baseSubject("RE: Fwd: re: Dinner")).toBe("Dinner");
  });
});

describe("threads and folders", () => {
  it("groups a conversation into one thread, newest first", () => {
    const inbox = listThreads(box(), { folder: "inbox" }, now);
    const dinner = inbox.find((t) => t.subject === "Dinner Friday?")!;
    expect(dinner.messages).toHaveLength(3); // includes your sent reply
    expect(dinner.unread).toBe(true);
    expect(dinner.participants.map((p) => p.email)).toContain("you@personal.demo");
    expect(inbox[0]!.subject).toBe("Welcome to Inbox");
  });

  it("splits Focused and Other", () => {
    const s = box();
    const other = subjects(listThreads(s, { folder: "inbox", tab: "other" }, now));
    const focused = subjects(listThreads(s, { folder: "inbox", tab: "focused" }, now));
    expect(other).toContain("Monday: rates, rugby and a recipe");
    expect(other).toContain("[societyos] Review requested on #12");
    expect(focused).toContain("Q3 report");
    expect(focused).not.toContain("Weekend edition");
    // Move a sender to Focused and it stays there.
    const moved = setTab(s, "newsletter@morningbrief.example", "focused");
    expect(subjects(listThreads(moved, { folder: "inbox", tab: "focused" }, now))).toContain("Weekend edition");
  });

  it("filters by account for a single inbox", () => {
    const work = listThreads(box(), { folder: "inbox", accountId: DEMO_WORK }, now);
    expect(work.every((t) => t.accountIds.includes(DEMO_WORK))).toBe(true);
    expect(subjects(work)).toContain("Q3 report");
    expect(subjects(work)).not.toContain("Sunday lunch");
  });

  it("counts unread by folder and label", () => {
    const c = folderCounts(box(), now);
    expect(c.inbox).toBeGreaterThan(3);
    expect(c.focused + c.other).toBe(c.inbox);
    expect(c.spam).toBe(1);
    expect(c.labels["l-family"]).toBe(2);
  });
});

describe("search", () => {
  it("understands Gmail-style operators", () => {
    const s = box();
    const find = (q: string) => subjects(listThreads(s, { folder: "inbox", query: q }, now));
    expect(find("from:priya")).toEqual(expect.arrayContaining(["Q3 report", "Standup moved"]));
    expect(find("has:attachment is:unread")).toEqual(["Q3 report"]);
    expect(find("label:receipts")).toEqual(expect.arrayContaining(["Your statement is ready", "Order #10482 has shipped"]));
    expect(find("hike")).toEqual(["Photos from the hike"]); // search reaches the archive
    expect(find("prize")).toEqual([]); // but not spam
    expect(find("in:spam prize")).toEqual(["You have WON a $1000 gift card!!!"]);
    expect(find('"thai place"')).toEqual(["Dinner Friday?"]);
    expect(find("lunch -roast")).toEqual([]);
    expect(find("lunch")).toEqual(["Sunday lunch"]);
    expect(find("account:work slides")).toEqual(["Slides for Thursday"]);
  });

  it("keeps unknown prefixes as text", () => {
    expect(parseQuery("re:thing").terms[0]).toEqual({ field: "text", value: "re:thing", negate: false });
  });
});

describe("actions", () => {
  it("archives, bins and brings back", () => {
    const s = box();
    const t = listThreads(s, { folder: "inbox" }, now).find((x) => x.subject === "Sunday lunch")!;
    const archived = applyOps(s, threadOps.archive(s, [t.id]));
    expect(subjects(listThreads(archived, { folder: "inbox" }, now))).not.toContain("Sunday lunch");
    expect(subjects(listThreads(archived, { folder: "archive" }, now))).toContain("Sunday lunch");
    const binned = applyOps(archived, threadOps.trash(archived, [t.id]));
    expect(subjects(listThreads(binned, { folder: "trash" }, now))).toContain("Sunday lunch");
    const back = applyOps(binned, threadOps.toInbox(binned, [t.id]));
    expect(subjects(listThreads(back, { folder: "inbox" }, now))).toContain("Sunday lunch");
  });

  it("puts your own messages back in Sent, not the inbox", () => {
    const s = box();
    const t = listThreads(s, { folder: "sent" }, now).find((x) => x.subject === "Slides for Thursday")!;
    const binned = applyOps(s, threadOps.trash(s, [t.id]));
    const back = applyOps(binned, threadOps.toInbox(binned, [t.id]));
    expect(subjects(listThreads(back, { folder: "sent" }, now))).toContain("Slides for Thursday");
    expect(subjects(listThreads(back, { folder: "inbox" }, now))).not.toContain("Slides for Thursday");
  });

  it("stars the newest message and reads/unreads whole threads", () => {
    const s = box();
    const t = listThreads(s, { folder: "inbox" }, now).find((x) => x.subject === "Dinner Friday?")!;
    const ops = threadOps.star(s, [t.id], true);
    expect(ops[0]!.ids).toEqual([t.messages[t.messages.length - 1]!.id]);
    const starred = applyOps(s, ops);
    expect(subjects(listThreads(starred, { folder: "starred" }, now))).toContain("Dinner Friday?");
    const read = applyOps(starred, threadOps.markRead(starred, [t.id]));
    expect(listThreads(read, { folder: "inbox" }, now).find((x) => x.id === t.id)!.unread).toBe(false);
  });

  it("snoozes until a time, then brings it back unread", () => {
    const s = box();
    const t = listThreads(s, { folder: "inbox" }, now).find((x) => x.subject === "Q3 report")!;
    const until = new Date(2026, 9, 26, 8);
    const snoozed = applyOps(s, threadOps.snooze(s, [t.id], until));
    expect(subjects(listThreads(snoozed, { folder: "inbox" }, now))).not.toContain("Q3 report");
    expect(subjects(listThreads(snoozed, { folder: "snoozed" }, now))).toContain("Q3 report");
    expect(wakeSnoozed(snoozed, now)).toBeUndefined();
    const woken = wakeSnoozed(snoozed, new Date(2026, 9, 26, 8, 1))!;
    const back = listThreads(woken, { folder: "inbox" }, new Date(2026, 9, 26, 8, 1));
    expect(back[0]!.subject).toBe("Q3 report");
    expect(back[0]!.unread).toBe(true);
  });

  it("offers sensible snooze times", () => {
    const labels = snoozeOptions(new Date(2026, 9, 27, 10)).map((o) => o.label); // a Tuesday
    expect(labels).toEqual(["Later today", "Tomorrow", "This weekend", "Next week"]);
    const nextWeek = snoozeOptions(new Date(2026, 9, 27, 10)).at(-1)!.until;
    expect(nextWeek.getDay()).toBe(1);
  });

  it("labels and unlabels", () => {
    const s = box();
    const t = listThreads(s, { folder: "inbox" }, now).find((x) => x.subject === "Sunday lunch")!;
    const off = applyOps(s, threadOps.label(s, [t.id], "l-family", false));
    expect(subjects(listThreads(off, { folder: "all", labelId: "l-family" }, now))).not.toContain("Sunday lunch");
  });
});

describe("compose", () => {
  it("replies to the sender, reply-all skips you", () => {
    const s = box();
    const q3 = s.messages.find((m) => m.subject === "Q3 report")!;
    const r = replyDraft(s, q3, "reply", "d1");
    expect(r.to.map((a) => a.email)).toEqual(["priya@acme.example"]);
    expect(r.subject).toBe("Re: Q3 report");
    expect(r.body).toContain("> Can you send me the Q3 numbers");
    const all = replyDraft(s, q3, "replyAll", "d2");
    expect(all.cc.map((a) => a.email)).toEqual(["tom@acme.example"]);
    expect([...all.to, ...all.cc].some((a) => a.email === "you@work.demo")).toBe(false);
    const fwd = replyDraft(s, q3, "forward", "d3");
    expect(fwd.to).toEqual([]);
    expect(fwd.threadId).toBeUndefined();
  });

  it("drafts save, then sending moves them into the thread", () => {
    const s = box();
    const q3 = s.messages.find((m) => m.subject === "Q3 report")!;
    const d = replyDraft(s, q3, "reply", "d1");
    const drafted = saveDraft(s, { ...d, body: "On it" }, now);
    expect(listThreads(drafted, { folder: "drafts" }, now)).toHaveLength(1);
    expect(draftFromMessage(drafted.messages.find((m) => m.id === "d1")!).threadId).toBe(q3.threadId);
    const sent = recordSent(drafted, { ...d, body: "On it" }, now);
    expect(listThreads(sent, { folder: "drafts" }, now)).toHaveLength(0);
    const thread = listThreads(sent, { folder: "inbox" }, now).find((t) => t.id === q3.threadId)!;
    expect(thread.messages.at(-1)!.body).toBe("On it");
    expect(thread.messages.at(-1)!.location).toBe("sent");
  });
});

describe("merging mail from a provider", () => {
  it("updates by remote id and keeps local snoozes", () => {
    const s = { ...box(), messages: [] };
    const m = { ...demoMailbox(now).messages[0]!, id: "a:1", accountId: "a", remoteId: "r1" };
    const first = mergeRemote(s, "a", [m]);
    const snoozed = { ...first, messages: first.messages.map((x) => ({ ...x, snoozedUntil: "2099-01-01T00:00:00.000Z" })) };
    const second = mergeRemote(snoozed, "a", [{ ...m, id: "a:1-new", read: true }]);
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]!.id).toBe("a:1");
    expect(second.messages[0]!.read).toBe(true);
    expect(second.messages[0]!.snoozedUntil).toBe("2099-01-01T00:00:00.000Z");
  });
});

describe("undo", () => {
  it("inverse ops put everything back", async () => {
    const { inverseOps } = await import("./mailbox.js");
    const s = box();
    const t = listThreads(s, { folder: "inbox" }, now).slice(0, 3).map((x) => x.id);
    const ops = [...threadOps.archive(s, t), ...threadOps.markRead(s, t), ...threadOps.label(s, t, "l-work", true)];
    const after = applyOps(s, ops);
    const back = applyOps(after, inverseOps(s, ops));
    const strip = (st: typeof s) => st.messages.map((m) => ({ ...m, labels: [...m.labels].sort() }));
    expect(strip(back)).toEqual(strip(s));
  });
});
