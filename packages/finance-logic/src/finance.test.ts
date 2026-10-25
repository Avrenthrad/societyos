import { createEntity, type CalendarEvent } from "@societyos/core";
import { linksFor, MemoryStore } from "@societyos/sync";
import { setStatus } from "@societyos/today-logic";
import { describe, expect, it } from "vitest";
import {
  billStatus,
  createBill,
  detectLayout,
  formatMoney,
  listBills,
  merchantKey,
  monthSummary,
  parseAmount,
  parseCsv,
  parseMoneyEntry,
  payBill,
  previewImport,
  recordFromToday,
  saveEntry,
  saveImport,
  setCategory,
  suggestCategory,
  suggestEvents,
  transactionLinks,
} from "./index.js";

const owner = { ownerId: "u1", sourceApp: "finance" };
// Sunday 25 Oct 2026, 10am local
const now = new Date(2026, 9, 25, 10, 0);

describe("amounts", () => {
  it.each([
    ["4.50", 1, 450],
    ["$1,234.56", 1, 123456],
    ["-12", -1, 1200],
    ["(12.00)", -1, 1200],
    ["12.00 DR", -1, 1200],
    ["12.00 CR", 1, 1200],
    ["1.234,56", 1, 123456],
    ["+20", 1, 2000],
  ])("%s", (raw, sign, abs) => {
    expect(parseAmount(raw)).toBe(sign * abs);
  });
  it("rejects words", () => {
    expect(parseAmount("abc")).toBeUndefined();
    expect(parseAmount("")).toBeUndefined();
  });
  it("formats", () => {
    expect(formatMoney(-450)).toBe("-$4.50");
    expect(formatMoney(250000, "AUD", { signed: true })).toBe("+$2,500.00");
  });
});

describe("quick entry", () => {
  const people = [{ id: "p-sam", name: "Sam" }];
  it("Coffee 4.50 at Bean Co", () => {
    const e = parseMoneyEntry("Coffee 4.50 at Bean Co", { now });
    expect(e.amountMinor).toBe(-450);
    expect(e.description).toBe("Coffee");
    expect(e.place).toEqual({ name: "Bean Co" });
    expect(e.date).toEqual(new Date(2026, 9, 25));
  });
  it("Dinner with Sam 86 yesterday #fun", () => {
    const e = parseMoneyEntry("Dinner with Sam 86 yesterday #fun", { now, people });
    expect(e.amountMinor).toBe(-8600);
    expect(e.personIds).toEqual(["p-sam"]);
    expect(e.newPeople).toEqual([]);
    expect(e.category).toBe("Fun");
    expect(e.description).toBe("Dinner with Sam");
    expect(e.date).toEqual(new Date(2026, 9, 24));
  });
  it("tomorrow and weekdays come from Today's parser", () => {
    const e = parseMoneyEntry("Concert tickets $120 on Friday", { now });
    expect(e.date).toEqual(new Date(2026, 9, 30));
    expect(e.description).toBe("Concert tickets");
  });
  it("+2500 salary is money in", () => {
    const e = parseMoneyEntry("+2500 salary", { now });
    expect(e.amountMinor).toBe(250000);
    expect(e.description).toBe("salary");
  });
  it("refund words make it money in", () => {
    expect(parseMoneyEntry("Kmart refund 30", { now }).amountMinor).toBe(3000);
  });
  it("a repeat makes it a bill", () => {
    const e = parseMoneyEntry("Rent 520 every month on the 1st", { now });
    expect(e.amountMinor).toBe(-52000);
    expect(e.recurrence?.rrule).toBe("FREQ=MONTHLY;BYMONTHDAY=1");
    expect(e.date).toEqual(new Date(2026, 10, 1));
    expect(e.description).toBe("Rent");
  });
  it("'every 2 weeks' is a repeat, not an amount", () => {
    const e = parseMoneyEntry("Cleaner 80 every 2 weeks", { now });
    expect(e.amountMinor).toBe(-8000);
    expect(e.recurrence?.rrule).toBe("FREQ=WEEKLY;INTERVAL=2");
  });
  it("new people after 'with'", () => {
    const e = parseMoneyEntry("Lunch with Priya 24", { now });
    expect(e.newPeople).toEqual(["Priya"]);
    expect(e.description).toBe("Lunch with Priya");
  });
  it("known places match without capitals", () => {
    const e = parseMoneyEntry("snacks 6 at bean co", { now, places: [{ id: "pl1", name: "Bean Co" }] });
    expect(e.place).toEqual({ id: "pl1", name: "Bean Co" });
  });
  it("any understood piece can be undone", () => {
    const first = parseMoneyEntry("Coffee 4.50 at Bean Co", { now });
    const place = first.tokens.find((t) => t.kind === "place")!;
    const e = parseMoneyEntry("Coffee 4.50 at Bean Co", { now, ignore: [place.start] });
    expect(e.place).toBeUndefined();
    expect(e.description).toBe("Coffee at Bean Co");
  });
});

describe("categories", () => {
  it("merchant keys ignore card noise", () => {
    expect(merchantKey("VISA PURCHASE WOOLWORTHS 1234 SYDNEY AU 21/10")).toBe("woolworths");
    expect(merchantKey("Woolworths 0987 Newtown")).toBe("woolworths");
    expect(merchantKey("BEAN CO SYDNEY NS AUS Card xx1234")).toBe("bean co");
  });
  it("learns from the person's own choices first", () => {
    const history = [{ description: "WOOLWORTHS 1234", category: "Household", updatedAt: "2026-10-01" }];
    expect(suggestCategory("WOOLWORTHS 5678 NEWTOWN", history)).toBe("Household");
    expect(suggestCategory("COLES 551 NEWTOWN")).toBe("Groceries");
    expect(suggestCategory("UBER *TRIP")).toBe("Transport");
    expect(suggestCategory("UBER EATS")).toBe("Eating out");
    expect(suggestCategory("AGL ENERGY BPAY")).toBe("Bills"); // not "BP" fuel
  });
  it("fixing one teaches the rest", async () => {
    const s = new MemoryStore();
    const mk = (d: string) => createEntity("transaction", { ...owner, amountMinor: -500, currency: "AUD", occurredAt: now.toISOString(), description: d });
    const a = mk("BEAN CO 123");
    const b = mk("Bean Co 456");
    await s.put(a);
    await s.put(b);
    expect(await setCategory(s, a, "Eating out")).toBe(1);
    expect((await s.get("transaction", b.id))?.category).toBe("Eating out");
  });
});

describe("CSV import", () => {
  const commbank = `25/10/2026,"-4.50","BEAN CO SYDNEY NS AUS Card xx1234","+1,200.00"
24/10/2026,"+2,500.00","Salary ACME PTY LTD","+1,204.50"
24/10/2026,"-86.00","THE GROUNDS ALEXANDRIA","-1,295.50"
24/10/2026,"-86.00","THE GROUNDS ALEXANDRIA","-1,209.50"`;

  it("reads a headerless CommBank file", () => {
    const rows = parseCsv(commbank);
    const layout = detectLayout(rows);
    expect(layout.hasHeader).toBe(false);
    expect(layout.columns).toMatchObject({ date: 0, amount: 1, description: 2 });
    const p = previewImport(rows, layout);
    expect(p.rows).toHaveLength(4);
    expect(p.rows[0]).toMatchObject({ amountMinor: -450, occurredAt: new Date(2026, 9, 25) });
    expect(p.rows[1]!.amountMinor).toBe(250000);
    // Two identical rows are two transactions.
    expect(new Set(p.rows.map((r) => r.importKey)).size).toBe(4);
  });

  it("reads debit / credit columns with a header", () => {
    const csv = `Date,Description,Debit,Credit,Balance
2026-10-20,Woolworths,52.10,,900.00
2026-10-21,Refund Kmart,,15.00,915.00`;
    const rows = parseCsv(csv);
    const layout = detectLayout(rows);
    expect(layout.hasHeader).toBe(true);
    expect(layout.dateOrder).toBe("ymd");
    expect(layout.columns).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
    const p = previewImport(rows, layout);
    expect(p.rows.map((r) => r.amountMinor)).toEqual([-5210, 1500]);
  });

  it("spots US month-first dates", () => {
    const rows = parseCsv("Date,Amount,Description\n10/25/2026,-3.00,Coffee\n10/03/2026,-9,Lunch");
    const layout = detectLayout(rows);
    expect(layout.dateOrder).toBe("mdy");
    expect(previewImport(rows, layout).rows[1]!.occurredAt).toEqual(new Date(2026, 9, 3));
  });

  it("handles quotes, commas and semicolons", () => {
    expect(parseCsv('a;"b; c";"say ""hi"""\n')).toEqual([["a", "b; c", 'say "hi"']]);
  });

  it("lists unreadable lines instead of guessing", () => {
    const rows = parseCsv("25/10/2026,-4.50,Coffee\nnot a date,-1,x\n26/10/2026,,Blank");
    const p = previewImport(rows, { hasHeader: false, header: [], dateOrder: "dmy", columns: { date: 0, amount: 1, description: 2 } });
    expect(p.rows).toHaveLength(1);
    expect(p.skipped.map((s) => s.line)).toEqual([2, 3]);
  });

  it("importing the same statement twice adds nothing", async () => {
    const s = new MemoryStore();
    const rows = parseCsv(commbank);
    const layout = detectLayout(rows);
    expect(await saveImport(s, previewImport(rows, layout).rows, { ...owner, account: "Everyday" })).toHaveLength(4);
    const again = previewImport(rows, layout, await s.list("transaction"));
    expect(again.rows.every((r) => r.duplicate)).toBe(true);
    expect(await saveImport(s, again.rows, owner)).toHaveLength(0);
    const salary = (await s.list("transaction")).find((t) => t.amountMinor > 0)!;
    expect(salary.category).toBe("Income");
    expect(salary.account).toBe("Everyday");
  });
});

describe("saving entries links them to the rest of SocietyOS", () => {
  it("person, new person and place", async () => {
    const s = new MemoryStore();
    const sam = createEntity("person", { ...owner, name: "Sam", emails: [], phones: [] });
    await s.put(sam);
    const e = parseMoneyEntry("Dinner with Sam and with Priya 86 at The Grounds", { now, people: [{ id: sam.id, name: "Sam" }] });
    const r = await saveEntry(s, e, owner);
    if (r.kind !== "transaction") throw new Error("expected a transaction");
    const links = await transactionLinks(s, r.transaction);
    expect(links.people.map((p) => p.name).sort()).toEqual(["Priya", "Sam"]);
    expect(links.places.map((p) => p.name)).toEqual(["The Grounds"]);
    // The link People reads for its timeline.
    const samLinks = await linksFor(s, sam.id);
    expect(samLinks[0]).toMatchObject({ fromId: r.transaction.id, relation: "related" });
    // A second spend reuses the place.
    await saveEntry(s, parseMoneyEntry("Coffee 5 at The Grounds", { now }), owner);
    expect(await s.list("place")).toHaveLength(1);
  });

  it("suggests the event a spend belongs to", () => {
    const ev = (title: string, h: number) =>
      createEntity("event", { ...owner, title, startsAt: new Date(2026, 9, 24, h).toISOString(), endsAt: new Date(2026, 9, 24, h + 2).toISOString(), attendeeIds: [] }) as CalendarEvent;
    const events = [ev("Dinner with Sam", 19), ev("Standup", 9)];
    expect(suggestEvents({ occurredAt: new Date(2026, 9, 24, 21, 30).toISOString() }, events).map((e) => e.title)).toEqual(["Dinner with Sam"]);
    // No time on the spend: anything that day, closest first.
    expect(suggestEvents({ occurredAt: new Date(2026, 9, 24).toISOString() }, events)).toHaveLength(2);
  });

  it("month summary leaves transfers out", () => {
    const mk = (amountMinor: number, category: string, d = 10) =>
      createEntity("transaction", { ...owner, amountMinor, currency: "AUD", occurredAt: new Date(2026, 9, d).toISOString(), description: "x", category });
    const sum = monthSummary([mk(-1000, "Groceries"), mk(-500, "Groceries"), mk(-300, "Fun"), mk(200000, "Income"), mk(-9999, "Transfers"), mk(-100, "Fun", 40)], now);
    expect(sum).toMatchObject({ spent: 1800, earned: 200000, net: 198200 });
    expect(sum.byCategory[0]).toEqual({ key: "Groceries", total: 1500, count: 2 });
  });
});

describe("bills are tasks in Today", () => {
  it("adding a bill makes one repeating task, due on the bill's date", async () => {
    const s = new MemoryStore();
    const r = await saveEntry(s, parseMoneyEntry("Rent 520 every month on the 1st", { now }), owner);
    if (r.kind !== "bill") throw new Error("expected a bill");
    const tasks = await s.list("task");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: "Pay Rent · $520.00", status: "open", dueAllDay: true });
    expect(new Date(tasks[0]!.dueAt!)).toEqual(new Date(2026, 10, 1));
    expect(tasks[0]!.recurrence?.rrule).toBe("FREQ=MONTHLY;BYMONTHDAY=1");
    expect(billStatus(r.bill, tasks[0], now)).toMatchObject({ state: "upcoming", inDays: 7 });
    expect(billStatus(r.bill, tasks[0], new Date(2026, 9, 30))).toMatchObject({ state: "due-soon" });
  });

  it("paying in Finance records the spend and moves the task to next month", async () => {
    const s = new MemoryStore();
    const { bill } = await createBill(s, { name: "Rent", amountMinor: 52000, currency: "AUD", dueAt: new Date(2026, 10, 1), recurrence: { rrule: "FREQ=MONTHLY;BYMONTHDAY=1", tz: "Australia/Sydney" } }, owner);
    const paid = await payBill(s, bill, { ...owner, on: new Date(2026, 10, 1, 9) });
    expect(paid.transaction).toMatchObject({ amountMinor: -52000, billId: bill.id, category: "Bills" });
    expect(new Date(paid.task!.dueAt!)).toEqual(new Date(2026, 11, 1));
    expect(paid.task!.status).toBe("open");
    // Already recorded, so Finance doesn't ask again.
    expect(billStatus(paid.bill, paid.task, new Date(2026, 10, 2)).unrecorded).toBeUndefined();
  });

  it("ticking it off in Today asks Finance to record it, once", async () => {
    const s = new MemoryStore();
    const { bill, task } = await createBill(s, { name: "Phone", amountMinor: 4500, currency: "AUD", dueAt: new Date(2026, 9, 28) }, owner);
    await setStatus(s, task, "done", new Date(2026, 9, 27, 8)); // done in Today
    const [status] = await listBills(s, now);
    expect(status!.state).toBe("paid");
    expect(status!.unrecorded).toEqual(new Date(2026, 9, 27, 8));
    const rec = await recordFromToday(s, status!, owner);
    expect(rec!.transaction.amountMinor).toBe(-4500);
    const [after] = await listBills(s, now);
    expect(after!.unrecorded).toBeUndefined();
  });

  it("overdue bills sort first", async () => {
    const s = new MemoryStore();
    await createBill(s, { name: "Later", amountMinor: 100, currency: "AUD", dueAt: new Date(2026, 10, 20) }, owner);
    await createBill(s, { name: "Late", amountMinor: 100, currency: "AUD", dueAt: new Date(2026, 9, 20) }, owner);
    expect((await listBills(s, now)).map((b) => [b.bill.name, b.state])).toEqual([["Late", "overdue"], ["Later", "upcoming"]]);
  });
});
