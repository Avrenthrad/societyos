import type { ID, Person } from "@societyos/core";
import {
  peopleActivity, reachOutList, sortPeople, upcomingBirthdays,
  type PersonActivity, type ReachOut, type UpcomingBirthday,
} from "@societyos/people-logic";
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

/** Current time, ticking each minute. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export interface PeopleData {
  people: Person[];
  activity: Map<ID, PersonActivity>;
  reachOut: ReachOut[];
  birthdays: UpcomingBirthday[];
  tags: string[];
}

/** Everyone, their timelines, who to reach out to and birthdays coming up. */
export function usePeople(now: Date, loaded: boolean): PeopleData | undefined {
  const v = useStoreVersion();
  const [data, setData] = useState<PeopleData>();
  // Recompute at most once a day for the clock; changes re-run it straight away.
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  useEffect(() => {
    if (!loaded) return;
    let live = true;
    (async () => {
      const people = sortPeople(await store.list("person"));
      const activity = await peopleActivity(store, now);
      if (!live) return;
      setData({
        people,
        activity,
        reachOut: reachOutList(people, activity, now),
        birthdays: upcomingBirthdays(people, now, 30),
        tags: [...new Set(people.flatMap((p) => p.tags ?? []))].sort(),
      });
    })();
    return () => {
      live = false;
    };
  }, [v, day, loaded]);
  return data;
}
