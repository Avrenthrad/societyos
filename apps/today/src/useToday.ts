import type { Entity, Person, Task } from "@societyos/core";
import { linksFor } from "@societyos/sync";
import { dayAgenda, viewCounts, type DayAgenda } from "@societyos/today-logic";
import { useEffect, useState } from "react";
import { store } from "./store";

/** Re-render whenever anything in the store changes, from any app. */
function useStoreVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const off = store.subscribe(() => setV((x) => x + 1));
    return () => {
      off();
    };
  }, []);
  return v;
}

/** Current time, ticking each minute (moves the "now" line). */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function useToday(day: Date, now: Date) {
  const v = useStoreVersion();
  const [agenda, setAgenda] = useState<DayAgenda>();
  const [counts, setCounts] = useState({ today: 0, upcoming: 0, inbox: 0 });
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all([dayAgenda(store, day, now), viewCounts(store, now), store.list("person")]).then(([a, c, p]) => {
      if (!live) return;
      setAgenda(a);
      setCounts(c);
      setPeople(p);
    });
    return () => {
      live = false;
    };
  }, [v, day.getTime(), now.getTime()]);
  return { agenda, counts, people };
}

export interface Linked {
  kind: "Person" | "Note" | "File" | "Email" | "Event" | "Task";
  title: string;
  id: string;
}

const KIND: Partial<Record<Entity["type"], Linked["kind"]>> = {
  person: "Person", note: "Note", file: "File", message: "Email", event: "Event", task: "Task",
};

function titleOf(e: Entity): string {
  switch (e.type) {
    case "person": return e.name;
    case "file": return e.name;
    case "message": return e.subject ?? "Message";
    case "note": case "task": case "event": return e.title;
    default: return e.type;
  }
}

/** Everything linked to a task, from any app. */
export function useLinked(task: Task | undefined) {
  const v = useStoreVersion();
  const [items, setItems] = useState<Linked[]>([]);
  useEffect(() => {
    if (!task) return setItems([]);
    let live = true;
    (async () => {
      const links = await linksFor(store, task.id);
      const out: Linked[] = [];
      for (const l of links) {
        const otherId = l.fromId === task.id ? l.toId : l.fromId;
        for (const type of ["person", "note", "file", "message", "event", "task"] as const) {
          const e = await store.get(type, otherId);
          if (e) {
            out.push({ kind: KIND[type]!, title: titleOf(e), id: e.id });
            break;
          }
        }
      }
      if (live) setItems(out);
    })();
    return () => {
      live = false;
    };
  }, [v, task?.id]);
  return items;
}
