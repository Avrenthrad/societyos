import { PersistedStore, type KeyValue } from "@societyos/sync";

/** Browser / desktop storage, or in-memory where there is none (phones, for now). */
function deviceStorage(): KeyValue {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls) {
      ls.setItem("societyos:probe", "1");
      return ls;
    }
  } catch {
    // private mode or blocked storage
  }
  const mem = new Map<string, string>();
  return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
}

// The same saved store as Today and the other SocietyOS web apps (same
// site, same key), so a bill added here shows up as a task in Today.
// Swap for the SQLite + sync store once the backend is set up.
export const store = new PersistedStore(deviceStorage());
store.watchStorage();
export const ME = "local-user";
export const APP = "finance";
export const OWNER = { ownerId: ME, sourceApp: APP };
export const CURRENCY = "AUD";

export const ready: Promise<number> = store.load();
