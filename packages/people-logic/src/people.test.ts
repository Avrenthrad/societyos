import { createEntity, type Person } from "@societyos/core";
import { link, MemoryStore } from "@societyos/sync";
import { describe, expect, it } from "vitest";
import {
  addBirthdayReminder, findOrCreatePerson, formatAgo, importContacts, markCaughtUp, nextBirthday, parseBirthday,
  parsePersonQuickAdd, parseVCards, peopleActivity, personTimeline, planCatchUp, reachOutList, upcomingBirthdays,
} from "./index.js";

const base = { ownerId: "u1", sourceApp: "test" };
const person = (name: string, extra: Partial<Person> = {}) =>
  createEntity("person", { ...base, name, emails: [], phones: [], ...extra }, new Date(2026, 0, 1));
const now = new Date(2026, 9, 25, 12, 0); // Sun 25 Oct 2026, noon

describe("birthdays", () => {
  it("reads the common ways of writing one", () => {
    expect(parseBirthday("12 Mar")).toBe("--03-12");
    expect(parseBirthday("March 12th")).toBe("--03-12");
    expect(parseBirthday("12/03/1990")).toBe("1990-03-12"); // day first
    expect(parseBirthday("1990-03-12")).toBe("1990-03-12");
    expect(parseBirthday("19900312")).toBe("1990-03-12");
    expect(parseBirthday("--03-12")).toBe("--03-12");
    expect(parseBirthday("29 Feb")).toBe("--02-29");
    expect(parseBirthday("30 Feb")).toBeUndefined();
    expect(parseBirthday("29/02/2001")).toBeUndefined(); // not a leap year
    expect(parseBirthday("janky")).toBeUndefined();
  });

  it("finds the next one and the age they turn", () => {
    expect(nextBirthday("1990-10-25", now)).toMatchObject({ daysUntil: 0, turning: 36 });
    expect(nextBirthday("--10-24", now)?.daysUntil).toBe(364);
    const nb = nextBirthday("1990-11-01", now)!;
    expect(nb.daysUntil).toBe(7);
    expect(nb.turning).toBe(36);
    expect(nextBirthday("--11-01", now)?.turning).toBeUndefined();
  });

  it("puts 29 Feb on 28 Feb in other years", () => {
    const nb = nextBirthday("2000-02-29", new Date(2027, 0, 1))!;
    expect(nb.date).toEqual(new Date(2027, 1, 28));
    expect(nextBirthday("2000-02-29", new Date(2028, 0, 1))!.date).toEqual(new Date(2028, 1, 29));
  });

  it("lists the next 30 days, soonest first", () => {
    const people = [person("Late", { birthday: "--12-30" }), person("Soon", { birthday: "--11-02" }), person("Today", { birthday: "--10-25" }), person("None")];
    expect(upcomingBirthdays(people, now).map((b) => b.person.name)).toEqual(["Today", "Soon"]);
  });
});

describe("timeline fills itself", () => {
  it("collects linked, attended, messaged and named items from every app", async () => {
    const s = new MemoryStore();
    const sam = person("Sam Lee");
    const kim = person("Kim Park");
    await s.put(sam);
    await s.put(kim);

    const lunch = createEntity("event", { ...base, title: "Lunch", startsAt: new Date(2026, 9, 20, 12).toISOString(), endsAt: new Date(2026, 9, 20, 13).toISOString(), attendeeIds: [sam.id] });
    const dinner = createEntity("event", { ...base, title: "Dinner", startsAt: new Date(2026, 9, 30, 19).toISOString(), endsAt: new Date(2026, 9, 30, 21).toISOString(), attendeeIds: [sam.id] });
    const email = createEntity("message", { ...base, channel: "email", threadId: "t", fromId: sam.id, toIds: [], subject: "Photos", body: "", read: true }, new Date(2026, 9, 23));
    const note = createEntity("note", { ...base, title: "Gift ideas", body: "sam lee likes jazz", tags: [], pinned: false }, new Date(2026, 9, 1));
    const spend = createEntity("transaction", { ...base, amountMinor: -4250, currency: "AUD", occurredAt: new Date(2026, 9, 10).toISOString(), description: "Movie tickets" });
    const unrelated = createEntity("note", { ...base, title: "Samuel", body: "sam leeway", tags: [], pinned: false });
    for (const e of [lunch, dinner, email, note, spend, unrelated]) await s.put(e);
    await link(s, spend, sam, "related", base);

    const a = await personTimeline(s, sam, now);
    expect(a.past.map((x) => x.title)).toEqual(["Photos", "Lunch", "Movie tickets", "Gift ideas"]);
    expect(a.upcoming.map((x) => x.title)).toEqual(["Dinner"]);
    expect(a.past.find((x) => x.kind === "note")?.via).toBe("mention");
    expect(a.past.find((x) => x.kind === "transaction")?.detail).toMatch(/42\.50/);
    expect((await personTimeline(s, kim, now)).past).toHaveLength(0);
  });

  it("uses the latest real contact as last contact, not notes", async () => {
    const s = new MemoryStore();
    const sam = person("Sam Lee");
    await s.put(sam);
    const call = createEntity("task", { ...base, title: "Call Sam", status: "done", closedAt: new Date(2026, 9, 22).toISOString(), priority: 0 });
    await s.put(call);
    await link(s, call, sam, "mentions", base);
    const note = createEntity("note", { ...base, title: "About Sam Lee", body: "", tags: [], pinned: false });
    await s.put(note);
    const a = await personTimeline(s, sam, now);
    expect(a.lastContact).toEqual(new Date(2026, 9, 22));
    await markCaughtUp(s, sam, now);
    const after = await personTimeline(s, (await s.get("person", sam.id))!, now);
    expect(after.lastContact).toEqual(now);
  });
});

describe("keep in touch", () => {
  it("lists who is due, most overdue for their cadence first, and skips anyone with plans", async () => {
    const s = new MemoryStore();
    const weekly = person("Weekly Friend", { keepInTouchDays: 7, lastContactAt: new Date(2026, 9, 4).toISOString() });
    const yearly = person("Yearly Friend", { keepInTouchDays: 365, lastContactAt: new Date(2025, 8, 1).toISOString() });
    const fine = person("Fine Friend", { keepInTouchDays: 30, lastContactAt: new Date(2026, 9, 20).toISOString() });
    const planned = person("Planned Friend", { keepInTouchDays: 7, lastContactAt: new Date(2026, 8, 1).toISOString() });
    const off = person("No Cadence");
    for (const p of [weekly, yearly, fine, planned, off]) await s.put(p);
    await s.put(createEntity("event", { ...base, title: "Coffee", startsAt: new Date(2026, 9, 27, 9).toISOString(), endsAt: new Date(2026, 9, 27, 10).toISOString(), attendeeIds: [planned.id] }));

    const people = await s.list("person");
    const list = reachOutList(people, await peopleActivity(s, now), now);
    expect(list.map((r) => r.person.name)).toEqual(["Weekly Friend", "Yearly Friend"]);
    expect(list[0]!.overdueDays).toBe(14);

    // Being named in an upcoming event isn't a plan; planning a catch-up is.
    await s.put(createEntity("event", { ...base, title: "Weekly Friend's gig", startsAt: new Date(2026, 9, 30, 20).toISOString(), endsAt: new Date(2026, 9, 30, 22).toISOString(), attendeeIds: [] }));
    expect(reachOutList(people, await peopleActivity(s, now), now)[0]!.person.name).toBe("Weekly Friend");
    await planCatchUp(s, weekly, base, now);
    expect(reachOutList(people, await peopleActivity(s, now), now).map((r) => r.person.name)).toEqual(["Yearly Friend"]);
  });

  it("counts someone never contacted from when they were added", async () => {
    const s = new MemoryStore();
    const fresh = createEntity("person", { ...base, name: "New", emails: [], phones: [], keepInTouchDays: 30 }, new Date(2026, 9, 20));
    await s.put(fresh);
    expect(reachOutList([fresh], await peopleActivity(s, now), now)).toHaveLength(0);
  });

  it("says how long ago", () => {
    expect(formatAgo(new Date(2026, 9, 25, 8), now)).toBe("today");
    expect(formatAgo(new Date(2026, 9, 24), now)).toBe("yesterday");
    expect(formatAgo(new Date(2026, 9, 11), now)).toBe("2 weeks ago");
    expect(formatAgo(new Date(2026, 6, 25), now)).toBe("3 months ago");
  });
});

describe("actions that reach Today", () => {
  it("plans a catch-up once, linked to the person", async () => {
    const s = new MemoryStore();
    const sam = person("Sam Lee");
    await s.put(sam);
    const t1 = await planCatchUp(s, sam, base, now);
    const t2 = await planCatchUp(s, sam, base, now);
    expect(t1.id).toBe(t2.id);
    expect(t1.dueAllDay).toBe(true);
    expect((await personTimeline(s, sam, now)).past.map((x) => x.title)).toEqual(["Catch up with Sam Lee"]);
  });

  it("adds a yearly birthday task due on the day", async () => {
    const s = new MemoryStore();
    const sam = person("Sam Lee", { birthday: "--11-02" });
    await s.put(sam);
    const t = (await addBirthdayReminder(s, sam, base, "Australia/Sydney", now))!;
    expect(new Date(t.dueAt!)).toEqual(new Date(2026, 10, 2));
    expect(t.recurrence?.rrule).toBe("FREQ=YEARLY");
    expect(await addBirthdayReminder(s, person("No Bday"), base, "UTC", now)).toBeUndefined();
  });
});

describe("findOrCreatePerson", () => {
  it("matches by email or name and never duplicates", async () => {
    const s = new MemoryStore();
    const a = await findOrCreatePerson(s, { name: "Sam Lee", email: "Sam@Lee.com" }, base);
    const b = await findOrCreatePerson(s, { email: "sam@lee.com" }, base);
    const c = await findOrCreatePerson(s, { name: "sam lee", email: "work@sam.com" }, base);
    expect(new Set([a.id, b.id, c.id]).size).toBe(1);
    expect(c.emails).toEqual(["Sam@Lee.com", "work@sam.com"]);
    const d = await findOrCreatePerson(s, { email: "kim@park.com" }, base);
    expect(d.name).toBe("kim");
    expect(await s.list("person")).toHaveLength(2);
  });
});

describe("contacts import (.vcf)", () => {
  const vcf = [
    "BEGIN:VCARD", "VERSION:3.0", "FN:Sam Lee", "N:Lee;Sam;;;", "EMAIL;TYPE=HOME:sam@lee.com",
    "TEL;TYPE=CELL:+61 412 345 678", "BDAY:1990-03-12", "NOTE:Met at uni\\, 2010", "END:VCARD",
    "BEGIN:VCARD", "VERSION:4.0", "N:Park;Kim;;;", "BDAY:--1105", "item1.TEL:0400 000 111", "END:VCARD",
    "BEGIN:VCARD", "VERSION:2.1", "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen;;;", "END:VCARD",
    "BEGIN:VCARD", "VERSION:3.0", "FN:Long", " Name", "END:VCARD",
    "BEGIN:VCARD", "VERSION:3.0", "END:VCARD",
  ].join("\r\n");

  it("reads names, emails, phones, birthdays and notes", () => {
    const cards = parseVCards(vcf);
    expect(cards.map((c) => c.name)).toEqual(["Sam Lee", "Kim Park", "Jürgen Müller", "LongName"]);
    expect(cards[0]).toMatchObject({ emails: ["sam@lee.com"], phones: ["+61 412 345 678"], birthday: "1990-03-12", notes: "Met at uni, 2010" });
    expect(cards[1]).toMatchObject({ birthday: "--11-05", phones: ["0400 000 111"] });
  });

  it("merges into existing people instead of duplicating, and fills gaps only", async () => {
    const s = new MemoryStore();
    await s.put(person("Sammy", { emails: ["sam@lee.com"], notes: "keep me" }));
    const r = await importContacts(s, parseVCards(vcf), base);
    expect(r).toEqual({ added: 3, updated: 1, unchanged: 0 });
    const sam = (await s.list("person")).find((p) => p.emails.includes("sam@lee.com"))!;
    expect(sam).toMatchObject({ name: "Sammy", notes: "keep me", birthday: "1990-03-12", phones: ["+61 412 345 678"] });
    expect(await importContacts(s, parseVCards(vcf), base)).toEqual({ added: 0, updated: 0, unchanged: 4 });
  });
});

describe("quick add a person in one line", () => {
  it("picks out birthday, cadence, tags, email and phone", () => {
    const q = parsePersonQuickAdd("Sam Lee bday 12 Mar every 2 weeks #Friends sam@lee.com 0412 345 678");
    expect(q).toMatchObject({
      name: "Sam Lee", birthday: "--03-12", keepInTouchDays: 14, tags: ["friends"], emails: ["sam@lee.com"], phones: ["0412 345 678"],
    });
    expect(q.tokens.map((t) => t.kind).sort()).toEqual(["birthday", "email", "keep-in-touch", "phone", "tag"]);
  });

  it("handles full dates, words and plain names", () => {
    expect(parsePersonQuickAdd("Mum birthday 12/03/1960 monthly")).toMatchObject({ name: "Mum", birthday: "1960-03-12", keepInTouchDays: 30 });
    expect(parsePersonQuickAdd("Kim Park born March 5 every month")).toMatchObject({ name: "Kim Park", birthday: "--03-05", keepInTouchDays: 30 });
    expect(parsePersonQuickAdd("Jo Every")).toMatchObject({ name: "Jo Every", tokens: [] });
    expect(parsePersonQuickAdd("Bday Bob")).toMatchObject({ name: "Bday Bob" });
  });
});
