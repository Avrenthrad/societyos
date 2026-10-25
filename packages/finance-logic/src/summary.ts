import type { CalendarEvent, Transaction } from "@societyos/core";

/** Month maths for the overview. Transfers are left out of spent and earned. */

export interface MonthSummary {
  /** First day of the month, local time. */
  month: Date;
  spent: number;
  earned: number;
  net: number;
  count: number;
  byCategory: { key: string; total: number; count: number }[];
}

export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

export function inMonth(t: Pick<Transaction, "occurredAt">, month: Date): boolean {
  const d = new Date(t.occurredAt);
  return d >= startOfMonth(month) && d < addMonths(month, 1);
}

/** Totals of money out (as positive numbers) grouped by any key, largest first. */
export function groupSpend<T extends Pick<Transaction, "amountMinor">>(txs: T[], key: (t: T) => string | string[] | undefined) {
  const map = new Map<string, { key: string; total: number; count: number }>();
  for (const t of txs) {
    if (t.amountMinor >= 0) continue;
    const k = key(t);
    for (const one of Array.isArray(k) ? k : [k ?? "Uncategorised"]) {
      const g = map.get(one) ?? { key: one, total: 0, count: 0 };
      g.total += -t.amountMinor;
      g.count++;
      map.set(one, g);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function monthSummary(all: Transaction[], month: Date): MonthSummary {
  const txs = all.filter((t) => inMonth(t, month) && t.category !== "Transfers");
  const spent = txs.filter((t) => t.amountMinor < 0).reduce((n, t) => n - t.amountMinor, 0);
  const earned = txs.filter((t) => t.amountMinor > 0).reduce((n, t) => n + t.amountMinor, 0);
  return {
    month: startOfMonth(month),
    spent,
    earned,
    net: earned - spent,
    count: txs.length,
    byCategory: groupSpend(txs, (t) => t.category),
  };
}

/** Newest first, ties broken by when they were added. */
export function sortTransactions<T extends Pick<Transaction, "occurredAt" | "createdAt">>(txs: T[]): T[] {
  return [...txs].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt));
}

/**
 * Calendar events a spend probably belongs to: same day, and when the
 * spend has a time, within three hours of the event. "Dinner with Sam"
 * at 7pm and an $86 restaurant charge that night.
 */
export function suggestEvents(tx: Pick<Transaction, "occurredAt">, events: CalendarEvent[]): CalendarEvent[] {
  const at = new Date(tx.occurredAt);
  const dayStart = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
  const hasTime = at.getTime() !== dayStart.getTime();
  const near = 3 * 3_600_000;
  return events
    .filter((e) => {
      const s = new Date(e.startsAt);
      const end = new Date(e.endsAt);
      if (!(s < dayEnd && end > dayStart)) return false;
      if (!hasTime || e.allDay) return true;
      return at.getTime() >= s.getTime() - near && at.getTime() <= end.getTime() + near;
    })
    .sort((a, b) => Math.abs(Date.parse(a.startsAt) - at.getTime()) - Math.abs(Date.parse(b.startsAt) - at.getTime()));
}
