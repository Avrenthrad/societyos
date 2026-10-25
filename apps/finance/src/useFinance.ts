import type { CalendarEvent, Person, Place, Transaction } from "@societyos/core";
import {
  dueThisMonth,
  groupSpend,
  inMonth,
  listBills,
  monthSummary,
  sortTransactions,
  transactionLinks,
  type BillStatus,
  type MonthSummary,
  type TxLinks,
} from "@societyos/finance-logic";
import { useEffect, useState } from "react";
import { store } from "./store";

/** Re-render whenever anything in the store changes, from any app. */
export function useStoreVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const off = store.subscribe(() => setV((x) => x + 1));
    return () => {
      off();
    };
  }, []);
  return v;
}

export interface FinanceData {
  all: Transaction[];
  month: Transaction[];
  summary: MonthSummary;
  bills: BillStatus[];
  billsDue: number;
  people: Person[];
  places: Place[];
  events: CalendarEvent[];
  byPerson: { key: string; total: number; count: number }[];
  byPlace: { key: string; total: number; count: number }[];
}

export function useFinance(month: Date, now: Date, loaded: boolean) {
  const v = useStoreVersion();
  const [data, setData] = useState<FinanceData>();
  useEffect(() => {
    if (!loaded) return;
    let live = true;
    (async () => {
      const [txs, bills, people, places, events, links] = await Promise.all([
        store.list("transaction"),
        listBills(store, now),
        store.list("person"),
        store.list("place"),
        store.list("event"),
        store.list("link", (l) => l.relation === "related" || l.relation === "located-at"),
      ]);
      const all = sortTransactions(txs);
      const inThisMonth = all.filter((t) => inMonth(t, month));
      const names = new Map<string, string>([...people.map((p) => [p.id, p.name] as const), ...places.map((p) => [p.id, p.name] as const)]);
      const joined = (t: Transaction, ids: Set<string>) =>
        links.filter((l) => l.fromId === t.id && ids.has(l.toId)).map((l) => names.get(l.toId)!);
      const personIds = new Set(people.map((p) => p.id));
      const placeIds = new Set(places.map((p) => p.id));
      const byPerson = groupSpend(inThisMonth, (t) => joined(t, personIds)).filter((g) => g.key !== "Uncategorised");
      const byPlace = groupSpend(inThisMonth, (t) => joined(t, placeIds)).filter((g) => g.key !== "Uncategorised");
      if (!live) return;
      setData({
        all,
        month: inThisMonth,
        summary: monthSummary(all, month),
        bills,
        billsDue: dueThisMonth(bills, now),
        people,
        places,
        events,
        byPerson,
        byPlace,
      });
    })();
    return () => {
      live = false;
    };
  }, [v, month.getTime(), now.toDateString(), loaded]);
  return data;
}

export function useTxLinks(t: Transaction | undefined) {
  const v = useStoreVersion();
  const [links, setLinks] = useState<TxLinks>();
  useEffect(() => {
    if (!t) return setLinks(undefined);
    let live = true;
    transactionLinks(store, t).then((l) => live && setLinks(l));
    return () => {
      live = false;
    };
  }, [v, t?.id]);
  return links;
}

/** Current time, ticking each minute. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
