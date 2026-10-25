import { createEntity } from "@societyos/core";
import { PersistedStore, type KeyValue } from "@societyos/sync";
import { startOfDay } from "@societyos/today-logic";

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

// Saved on this device and loaded on start. Swap for the SQLite + sync
// store once the backend is set up (see docs/architecture.md).
export const store = new PersistedStore(deviceStorage());
export const ME = "local-user";
export const APP = "today";

const base = { ownerId: ME, sourceApp: APP };

/** Load saved data; on the very first run add a couple of how-to tasks. */
export const ready: Promise<void> = (async () => {
  if ((await store.load()) > 0) return;
  const today = startOfDay(new Date()).toISOString();
  for (const title of ["Tap me, then tap a time on the day to plan me", "Try quick add: Gym tomorrow 7am 1h"]) {
    await store.put(createEntity("task", { ...base, title, status: "open", priority: 0, dueAt: today, dueAllDay: true }));
  }
})();
