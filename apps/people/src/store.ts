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

// The same saved store as every other SocietyOS app on this device, so
// Today's events and tasks, notes, emails and money all reach People's
// timelines. Contact details stay on the device. Swap for the SQLite + sync
// store once the backend is set up (see docs/architecture.md).
export const store = new PersistedStore(deviceStorage());
export const ME = "local-user";
export const APP = "people";
export const base = { ownerId: ME, sourceApp: APP };

/** Load saved data. People adds nothing on first run: the empty state explains what to do. */
export const ready: Promise<void> = (async () => {
  await store.load();
  // Pick up changes made in other open apps (Today in another tab). Added to
  // PersistedStore by the shared-deploy change; guarded until that lands.
  (store as { watchStorage?: () => void }).watchStorage?.();
})();
