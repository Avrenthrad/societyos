import { describe, expect, it } from "vitest";
import { detectDates, detectedStart } from "./detect.js";

// Sunday 25 October 2026, 10:00 local time.
const sent = new Date(2026, 9, 25, 10, 0);
const one = (text: string, at = sent) => {
  const found = detectDates(text, at);
  expect(found).toHaveLength(1);
  return found[0]!;
};
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe("detectDates", () => {
  it("reads a weekday and time", () => {
    const d = one("Are you free for dinner Friday at 7pm?");
    expect(ymd(d.date)).toBe("2026-10-30");
    expect(d.time).toEqual({ h: 19, m: 0 });
    expect(d.text).toBe("Friday at 7pm");
    expect(d.deadline).toBe(false);
  });

  it("reads tomorrow from the day the email was sent, not today", () => {
    const d = one("Let's review tomorrow from 2pm to 2:30pm", new Date(2026, 9, 20, 9));
    expect(ymd(d.date)).toBe("2026-10-21");
    expect(d.time).toEqual({ h: 14, m: 0 });
    expect(d.durationMin).toBe(30);
  });

  it("takes am/pm from the end of a range (2-3pm)", () => {
    const d = one("call on Mon 2-3pm");
    expect(d.time).toEqual({ h: 14, m: 0 });
    expect(d.durationMin).toBe(60);
  });

  it("marks deadlines", () => {
    const d = one("Can you send the numbers by Thursday?");
    expect(d.deadline).toBe(true);
    expect(ymd(d.date)).toBe("2026-10-29");
    expect(d.time).toBeUndefined();
  });

  it("reads day-month and month-day dates", () => {
    expect(ymd(one("Offsite on 12 November").date)).toBe("2026-11-12");
    expect(ymd(one("Offsite Nov 19th, 2026").date)).toBe("2026-11-19");
    expect(ymd(one("payment due on 3 November.").date)).toBe("2026-11-3");
    const full = one("check-up on Tue 28 Oct at 3:30pm");
    expect(ymd(full.date)).toBe("2026-10-28");
    expect(full.time).toEqual({ h: 15, m: 30 });
  });

  it("next Tuesday is in next week", () => {
    // Sent Sunday: next week starts tomorrow, so "next Tuesday" is in two days.
    expect(ymd(one("next Tuesday at 3:30pm").date)).toBe("2026-10-27");
    // Sent Monday 26 Oct: "Tuesday" is tomorrow, "next Tuesday" a week later.
    const mon = new Date(2026, 9, 26, 9);
    expect(ymd(one("Tuesday", mon).date)).toBe("2026-10-27");
    expect(ymd(one("next Tuesday", mon).date)).toBe("2026-11-3");
  });

  it("time before the day: 9:30am on Monday", () => {
    const d = one("standup is at 9:30am on Monday");
    expect(ymd(d.date)).toBe("2026-10-26");
    expect(detectedStart(d).getHours()).toBe(9);
  });

  it("ignores everyday words that look like dates", () => {
    expect(detectDates("You may want to march on. I sat in the sun.", sent)).toEqual([]);
    expect(detectDates("Monday.com is a product; the wednesdays are fine", sent)).toEqual([]);
    expect(detectDates("Order 10482 costs $24.99", sent)).toEqual([]);
  });

  it("does not split 'Friday 3pm' into a date of the 3rd", () => {
    const d = one("see you Friday 3pm");
    expect(ymd(d.date)).toBe("2026-10-30");
    expect(d.time).toEqual({ h: 15, m: 0 });
  });

  it("finds several dates in order", () => {
    const found = detectDates("Inspection Wed at 10am. Form due by 15th of November.", sent);
    expect(found.map((f) => ymd(f.date))).toEqual(["2026-10-28", "2026-11-15"]);
    expect(found[1]!.deadline).toBe(true);
  });

  it("a date with no year that has passed means next year", () => {
    expect(ymd(one("back on 3 Jan", new Date(2026, 11, 20)).date)).toBe("2027-1-3");
  });
});
