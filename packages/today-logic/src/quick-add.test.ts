import { describe, expect, it } from "vitest";
import { parseQuickAdd, quickAddToTask } from "./quick-add.js";

// Sunday 25 Oct 2026, 10:40 local time.
const now = new Date(2026, 9, 25, 10, 40);
const people = [{ id: "p-sam", name: "Sam" }];
const parse = (text: string, ignore?: number[]) => parseQuickAdd(text, { now, tz: "Australia/Sydney", people, ignore });

describe("parseQuickAdd", () => {
  it("Call Sam tomorrow 3pm 30m", () => {
    const q = parse("Call Sam tomorrow 3pm 30m");
    expect(q.title).toBe("Call Sam");
    expect(q.date).toEqual(new Date(2026, 9, 26));
    expect(q.time).toEqual({ h: 15, m: 0 });
    expect(q.durationMin).toBe(30);
    expect(q.personIds).toEqual(["p-sam"]);
    expect(q.tokens.map((t) => t.label)).toEqual(["Person: Sam", "Tomorrow", "3:00 pm", "30 min"]);

    const fields = quickAddToTask(q, "Australia/Sydney");
    expect(fields.block).toEqual({
      startsAt: new Date(2026, 9, 26, 15, 0).toISOString(),
      endsAt: new Date(2026, 9, 26, 15, 30).toISOString(),
      tz: "Australia/Sydney",
    });
  });

  it("pay rent every month on the 1st", () => {
    const q = parse("pay rent every month on the 1st");
    expect(q.title).toBe("pay rent");
    expect(q.recurrence).toEqual({ rrule: "FREQ=MONTHLY;BYMONTHDAY=1", tz: "Australia/Sydney" });
    expect(q.date).toEqual(new Date(2026, 10, 1)); // first one: 1 Nov
    expect(q.tokens[0]!.label).toBe("Monthly on the 1st");
  });

  it("every 2nd and 4th Wed", () => {
    const q = parse("Bins every 2nd and 4th Wed");
    expect(q.title).toBe("Bins");
    expect(q.recurrence?.rrule).toBe("FREQ=MONTHLY;BYDAY=2WE,4WE");
    expect(q.date).toEqual(new Date(2026, 9, 28)); // 4th Wed of Oct
  });

  it("janky test does NOT become January", () => {
    const q = parse("janky test");
    expect(q.title).toBe("janky test");
    expect(q.tokens).toEqual([]);
    expect(q.date).toBeUndefined();
  });

  it("every! 3 days counts from completion", () => {
    const q = parse("Water plants every! 3 days");
    expect(q.title).toBe("Water plants");
    expect(q.recurrence).toMatchObject({ rrule: "FREQ=DAILY;INTERVAL=3", afterCompletion: true });
    expect(q.tokens[0]!.label).toBe("Every 3 days after done");
  });

  it("undoing a token keeps its words as title", () => {
    const first = parse("Read March book tomorrow");
    const date = first.tokens.find((t) => t.kind === "date")!;
    const q = parse("Read March book tomorrow", [date.start]);
    expect(q.title).toBe("Read March book tomorrow");
    expect(q.date).toBeUndefined();
  });

  it("reads weekdays, day-month dates, 24h times, hours and priority", () => {
    expect(parse("Gym fri").date).toEqual(new Date(2026, 9, 30));
    expect(parse("Flights 3 nov").date).toEqual(new Date(2026, 10, 3));
    expect(parse("Tax return jan 15").date).toEqual(new Date(2027, 0, 15));
    const q = parse("Deep work 09:30 for 1.5h p1");
    expect(q).toMatchObject({ title: "Deep work", time: { h: 9, m: 30 }, durationMin: 90, priority: 3 });
    expect(q.date).toEqual(new Date(2026, 9, 25)); // time with no date = today
  });

  it("only whole words: 'may' alone and 'pm' inside words stay text", () => {
    expect(parse("I may call").tokens).toEqual([]);
    expect(parse("Fix npm build").tokens).toEqual([]);
  });
});
