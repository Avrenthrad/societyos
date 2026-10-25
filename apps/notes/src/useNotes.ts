import type { CalendarEvent, Note, Person } from "@societyos/core";
import { autoMeetingNotes, connections, meetingsOn, pullTaskStatus, searchEverything, type Connections, type Hit } from "@societyos/notes-logic";
import { useEffect, useState } from "react";
import { ctx, store } from "./store";

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

/** Current time, ticking each minute. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Run an async read whenever the store or `deps` change; keeps the last result. */
function useQuery<T>(read: () => Promise<T>, initial: T, deps: unknown[]): T {
  const v = useStoreVersion();
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let live = true;
    read().then((x) => live && setValue(x));
    return () => {
      live = false;
    };
  }, [v, ...deps]);
  return value;
}

export function useAllNotes(loaded: boolean) {
  return useQuery(() => store.list("note"), [] as Note[], [loaded]);
}

export function usePeople(loaded: boolean) {
  return useQuery(() => store.list("person"), [] as Person[], [loaded]);
}

export function useSearch(query: string, now: Date) {
  return useQuery(() => searchEverything(store, query, now), [] as Hit[], [query]);
}

export function useMeetings(now: Date, loaded: boolean) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return useQuery(() => meetingsOn(store, new Date(day)), [] as { event: CalendarEvent; note?: Note }[], [day, loaded]);
}

const none: Connections = { people: [], notes: [], backlinks: [], tasks: [] };

export function useConnections(noteId: string | undefined) {
  return useQuery(() => (noteId ? connections(store, noteId) : Promise.resolve(none)), none, [noteId]);
}

/** Background jobs: meeting notes made on time, and ticks from Today copied in. */
export function useAutomations(now: Date, loaded: boolean, openId: string | undefined) {
  const v = useStoreVersion();
  useEffect(() => {
    if (loaded) void autoMeetingNotes(store, ctx, now);
  }, [loaded, now.getTime()]);
  useEffect(() => {
    if (!loaded || !openId) return;
    void store.get("note", openId).then((n) => n && pullTaskStatus(store, n, ctx));
  }, [loaded, openId, v]);
}
